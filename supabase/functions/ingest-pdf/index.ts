import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function chunkText(text: string, chunkSize = 1500, overlap = 200): string[] {
  const chunks: string[] = [];
  const lines = text.split("\n");
  let currentChunk = "";

  const sectionMarkers = /^(#{1,6}\s|Section\s|Page\s|\d+\.\d+|\*\*|Rule\s|[A-Z]{1,3}\d+)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const potentialChunk = currentChunk + (currentChunk ? "\n" : "") + line;

    if (potentialChunk.length > chunkSize && currentChunk.length > 100) {
      chunks.push(currentChunk.trim());

      const overlapStart = Math.max(0, currentChunk.length - overlap);
      const lastOverlap = currentChunk.slice(overlapStart);

      if (sectionMarkers.test(line)) {
        currentChunk = line;
      } else {
        const lastPeriod = lastOverlap.lastIndexOf(". ");
        const lastNewline = lastOverlap.lastIndexOf("\n");
        const breakPoint = Math.max(lastPeriod, lastNewline);

        if (breakPoint > 0) {
          currentChunk = lastOverlap.slice(breakPoint + 1).trim() + "\n" + line;
        } else {
          currentChunk = line;
        }
      }
    } else {
      currentChunk = potentialChunk;
    }
  }

  if (currentChunk.trim().length > 50) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

async function updateManualStatus(
  supabase: any,
  manualId: string,
  status: string,
  extra: Record<string, unknown> = {}
) {
  const update = { status, ...extra };
  const { error } = await supabase
    .from("manuals")
    .update(update)
    .eq("id", manualId);
  if (error) console.error("Failed to update manual status:", error);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let supabase: any = null;
  let manualId: string | undefined;

  try {
    const body = await req.json();
    manualId = body.manualId;
    const pdfUrl = body.pdfUrl;

    if (!manualId || !pdfUrl) {
      throw new Error("manualId and pdfUrl are required");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await updateManualStatus(supabase, manualId, "extracting");

    console.log(`Starting PDF extraction for manual ${manualId}`);
    console.log(`PDF URL: ${pdfUrl}`);

    // Use Gemini with URL-based file input (no base64 loading into memory)
    const extractResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract ALL text content from this PDF document.

Important instructions:
- Extract every single word, number, and symbol
- Preserve document structure with proper headings and sections
- Mark page breaks with "--- Page X ---"
- Keep tables formatted using markdown table syntax
- Preserve bullet points and numbered lists
- Include all figure captions and footnotes
- Do not summarize or skip any content

Output the complete extracted text maintaining the document structure.`,
              },
              {
                type: "file",
                file: {
                  url: pdfUrl,
                },
              },
            ],
          },
        ],
        max_tokens: 100000,
      }),
    });

    if (!extractResponse.ok) {
      const errorText = await extractResponse.text();
      console.error("AI extraction error:", extractResponse.status, errorText);

      if (extractResponse.status === 429) {
        throw new Error("Rate limit exceeded. Please try again in a few minutes.");
      }
      if (extractResponse.status === 402) {
        throw new Error("API credits exhausted. Please add credits to continue.");
      }
      throw new Error(`Failed to extract text from PDF: ${extractResponse.status}`);
    }

    const extractData = await extractResponse.json();
    const content = extractData?.choices?.[0]?.message?.content;
    const extractedText =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content
              .map((p: unknown) => (typeof p === "string" ? p : (p as { text?: string })?.text))
              .filter(Boolean)
              .join("\n")
          : "";

    if (!extractedText || extractedText.trim().length < 100) {
      console.error("Extraction returned insufficient text:", extractedText.length);
      throw new Error("Could not extract sufficient text from PDF");
    }

    console.log(`Extracted ${extractedText.length} characters`);

    // Delete existing chunks for this manual
    await supabase.from("document_chunks").delete().eq("manual_id", manualId);

    // Chunk the text
    const chunks = chunkText(extractedText, 1500, 250);
    console.log(`Created ${chunks.length} chunks`);

    // Insert chunks WITHOUT embeddings (will be processed separately)
    const chunkInserts = chunks.map((chunk, index) => ({
      content: chunk,
      metadata: {
        chunk_index: index,
        total_chunks: chunks.length,
        char_count: chunk.length,
      },
      manual_id: manualId,
      embedding: null,
    }));

    // Insert in batches to avoid payload limits
    const insertBatchSize = 50;
    let insertedCount = 0;

    for (let i = 0; i < chunkInserts.length; i += insertBatchSize) {
      const batch = chunkInserts.slice(i, i + insertBatchSize);
      const { error: insertError } = await supabase.from("document_chunks").insert(batch as any);
      if (insertError) {
        console.error("Chunk insert error:", insertError);
        throw new Error(`Failed to insert chunks: ${insertError.message}`);
      }
      insertedCount += batch.length;
    }

    console.log(`Inserted ${insertedCount} chunks, ready for embedding`);

    // Update status to indicate chunks are ready for embedding
    await updateManualStatus(supabase, manualId, "embedding", {
      chunk_count: insertedCount,
    });

    return new Response(
      JSON.stringify({
        success: true,
        phase: "extracted",
        chunks: insertedCount,
        extractedLength: extractedText.length,
        message: "Text extracted and chunked. Call process-embeddings to generate embeddings.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Ingest error:", error);

    if (supabase && manualId) {
      await updateManualStatus(supabase, manualId, "error");
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
