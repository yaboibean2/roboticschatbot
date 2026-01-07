import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function generateEmbedding(text: string, apiKey: string, retries = 3): Promise<number[]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
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

      if (response.status === 429) {
        // Rate limited - wait and retry
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`Rate limited, waiting ${waitTime}ms before retry ${attempt}/${retries}`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`Embedding attempt ${attempt} failed, retrying...`);
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error("Failed to generate embedding after retries");
}

function chunkText(text: string, chunkSize = 1500, overlap = 200): string[] {
  const chunks: string[] = [];
  const lines = text.split("\n");
  let currentChunk = "";
  let lastOverlap = "";

  // Section/page markers to preserve
  const sectionMarkers = /^(#{1,6}\s|Section\s|Page\s|\d+\.\d+|\*\*|Rule\s|[A-Z]{1,3}\d+)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const potentialChunk = currentChunk + (currentChunk ? "\n" : "") + line;

    if (potentialChunk.length > chunkSize && currentChunk.length > 100) {
      // Save current chunk
      chunks.push(currentChunk.trim());

      // Start new chunk with overlap
      // Look for a good break point in the last part of the chunk
      const overlapStart = Math.max(0, currentChunk.length - overlap);
      lastOverlap = currentChunk.slice(overlapStart);

      // If the current line is a section marker, start fresh
      if (sectionMarkers.test(line)) {
        currentChunk = line;
      } else {
        // Find a sentence or paragraph break in the overlap
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

  // Don't forget the last chunk
  if (currentChunk.trim().length > 50) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

async function updateManualStatus(supabase: any, manualId: string, status: string, chunkCount?: number) {
  const update: any = { status };
  if (chunkCount !== undefined) {
    update.chunk_count = chunkCount;
    update.processed_at = new Date().toISOString();
  }
  
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

  let supabase: any;
  let manualId: string | undefined;

  try {
    const body = await req.json();
    manualId = body.manualId;
    const pdfUrl = body.pdfUrl;

    if (!manualId || !pdfUrl) {
      throw new Error("manualId and pdfUrl are required");
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Mark as processing
    await updateManualStatus(supabase, manualId, "processing");

    console.log(`Processing PDF for manual ${manualId}`);

    // Fetch PDF and convert to base64 (required for PDF processing)
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to fetch PDF: ${pdfResponse.status}`);
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    const pdfSize = pdfBuffer.byteLength;
    console.log(`PDF size: ${(pdfSize / 1024 / 1024).toFixed(2)} MB`);

    // Convert to base64 safely (required for PDF processing)
    const base64Pdf = encodeBase64(pdfBuffer);

    console.log("Extracting text from PDF using AI...");

    // Use Gemini Pro for extraction - must use file type with base64 for PDFs
    const extractResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract ALL text content from this PDF document. 

Important instructions:
- Extract every single word, number, and symbol from the document
- Preserve the document structure with proper headings and sections
- Mark page breaks with "--- Page X ---" where X is the page number
- Keep tables formatted using markdown table syntax
- Preserve bullet points and numbered lists
- Include all figure captions and footnotes
- Do not summarize or skip any content

Output the complete extracted text maintaining the document structure.`
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
      
      if (extractResponse.status === 429) {
        throw new Error("Rate limit exceeded. Please try again in a few minutes.");
      }
      if (extractResponse.status === 402) {
        throw new Error("API credits exhausted. Please add credits to continue.");
      }
      throw new Error("Failed to extract text from PDF");
    }

    const extractData = await extractResponse.json();

    const content = extractData?.choices?.[0]?.message?.content;
    const extractedText =
      (typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content
              .map((p: any) => (typeof p === "string" ? p : p?.text))
              .filter(Boolean)
              .join("\n")
          : "") ||
      (extractData?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p?.text)
        .filter(Boolean)
        .join("\n") ??
        "");

    if (!extractedText || extractedText.trim().length < 100) {
      console.error(
        "AI extraction returned empty/short text",
        JSON.stringify({
          hasChoices: !!extractData?.choices,
          contentType: typeof content,
          hasCandidates: !!extractData?.candidates,
        })
      );
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

    // Chunk the text with better overlap for context preservation
    const chunks = chunkText(extractedText, 1500, 250);
    console.log(`Created ${chunks.length} chunks`);

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Process chunks with batching and rate limiting
    const batchSize = 5;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      const results = await Promise.allSettled(
        batch.map(async (chunk, batchIndex) => {
          const chunkIndex = i + batchIndex;
          const embedding = await generateEmbedding(chunk, OPENAI_API_KEY);
          
          const { error: insertError } = await supabase.from("document_chunks").insert({
            content: chunk,
            metadata: { 
              chunk_index: chunkIndex,
              total_chunks: chunks.length,
              char_count: chunk.length
            },
            embedding,
            manual_id: manualId,
          });

          if (insertError) {
            throw new Error(`Insert failed: ${insertError.message}`);
          }
          
          return chunkIndex;
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          successCount++;
        } else {
          errorCount++;
          if (errors.length < 5) {
            errors.push(result.reason?.message || "Unknown error");
          }
        }
      }

      // Progress log
      console.log(`Processed ${Math.min(i + batchSize, chunks.length)}/${chunks.length} chunks`);

      // Rate limiting delay between batches
      if (i + batchSize < chunks.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    console.log(`Successfully processed ${successCount}/${chunks.length} chunks`);
    if (errorCount > 0) {
      console.error(`Failed chunks: ${errorCount}`, errors);
    }

    // Update manual with final status
    await updateManualStatus(supabase, manualId, "ready", successCount);

    return new Response(
      JSON.stringify({ 
        success: true, 
        chunks: successCount,
        totalChunks: chunks.length,
        errors: errorCount,
        extractedLength: extractedText.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Ingest error:", error);
    
    // Update manual status to error if we have the supabase client and manualId
    if (supabase && manualId) {
      await updateManualStatus(supabase, manualId, "error");
    }
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
