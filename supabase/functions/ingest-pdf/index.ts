import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

function chunkText(text: string, chunkSize = 1000, overlap = 100): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    let chunk = text.slice(start, end);

    // Try to break at sentence or paragraph
    if (end < text.length) {
      const lastPeriod = chunk.lastIndexOf(". ");
      const lastNewline = chunk.lastIndexOf("\n");
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > chunkSize * 0.5) {
        chunk = text.slice(start, start + breakPoint + 1);
      }
    }

    const trimmed = chunk.trim();
    if (trimmed.length > 50) chunks.push(trimmed);

    const step = chunk.length > overlap ? chunk.length - overlap : chunk.length;
    start += step;
    if (start >= text.length) break;
  }

  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { manualId, pdfUrl } = await req.json();

    if (!manualId || !pdfUrl) {
      throw new Error("manualId and pdfUrl are required");
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log(`Processing PDF for manual ${manualId}`);

    // Fetch PDF
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to fetch PDF: ${pdfResponse.status}`);
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();

    // Use pdf-parse alternative for Deno - extract text using pdfjs-dist
    // For now, we'll use a simple approach with the Lovable AI to extract text
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Convert PDF to base64 for AI processing
    const base64Pdf = btoa(
      new Uint8Array(pdfBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
    );

    console.log("Extracting text from PDF using AI...");

    // Use Gemini to extract text from PDF
    const extractResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract ALL text content from this PDF document. Include everything: headers, body text, tables (format as text), lists, rules, and any other content. Preserve the structure with headings and sections. Do not summarize - extract the complete text verbatim."
              },
              {
                type: "file",
                file: {
                  filename: "document.pdf",
                  file_data: `data:application/pdf;base64,${base64Pdf}`
                }
              }
            ]
          }
        ],
        max_tokens: 100000,
      }),
    });

    if (!extractResponse.ok) {
      const errorText = await extractResponse.text();
      console.error("AI extraction error:", errorText);
      throw new Error("Failed to extract text from PDF");
    }

    const extractData = await extractResponse.json();
    const extractedText = extractData.choices?.[0]?.message?.content || "";

    if (!extractedText || extractedText.length < 100) {
      throw new Error("Could not extract sufficient text from PDF");
    }

    console.log(`Extracted ${extractedText.length} characters from PDF`);

    // Delete existing chunks for this manual
    const { error: deleteError } = await supabase
      .from("document_chunks")
      .delete()
      .eq("manual_id", manualId);

    if (deleteError) {
      console.error("Error deleting old chunks:", deleteError);
    }

    // Chunk the text
    const chunks = chunkText(extractedText, 1200, 150);
    console.log(`Created ${chunks.length} chunks`);

    let successCount = 0;

    // Process chunks in batches
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      try {
        const embedding = await generateEmbedding(chunk, OPENAI_API_KEY);
        
        const { error: insertError } = await supabase.from("document_chunks").insert({
          content: chunk,
          metadata: { chunk_index: i },
          embedding,
          manual_id: manualId,
        });

        if (insertError) {
          console.error(`Chunk ${i} insert error:`, insertError);
        } else {
          successCount++;
        }

        // Small delay to avoid rate limits
        if (i % 5 === 0 && i > 0) {
          await new Promise(r => setTimeout(r, 200));
        }
      } catch (err) {
        console.error(`Chunk ${i} processing error:`, err);
      }
    }

    console.log(`Successfully processed ${successCount}/${chunks.length} chunks`);

    return new Response(
      JSON.stringify({ success: true, chunks: successCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Ingest error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
