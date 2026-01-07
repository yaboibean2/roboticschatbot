import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type IngestChunk = {
  content: string;
  metadata: {
    date?: string;
    subject?: string;
    chunk_index?: number;
    entry_index?: number;
  };
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { chunks, clearFirst } = (await req.json()) as {
      chunks: IngestChunk[];
      clearFirst?: boolean;
    };

    if (!chunks || chunks.length === 0) {
      throw new Error("No chunks provided");
    }

    console.log(`Ingesting ${chunks.length} chunks (clearFirst=${!!clearFirst})`);

    if (clearFirst) {
      const { error: deleteError } = await supabase
        .from("document_chunks")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (deleteError) {
        console.error("Error clearing chunks:", deleteError);
        throw new Error(`Failed to clear chunks: ${deleteError.message}`);
      }
    }

    let successCount = 0;
    let errorCount = 0;
    const sampleErrors: Array<{
      stage: "embedding" | "insert" | "processing";
      message: string;
      meta?: Record<string, unknown>;
    }> = [];

    const recordSampleError = (
      stage: "embedding" | "insert" | "processing",
      err: unknown,
      meta?: Record<string, unknown>
    ) => {
      if (sampleErrors.length >= 10) return;
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : JSON.stringify(err);
      sampleErrors.push({ stage, message, meta });
    };

    console.log(`Processing ${chunks.length} chunks...`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        const meta = chunk.metadata || {};
        const date = meta.date || "";
        const subject = meta.subject || "";

        const textToEmbed = `Date: ${date}\nSubject: ${subject}\n\n${chunk.content}`;
        console.log(`Chunk ${i + 1}/${chunks.length}: generating embedding for ${textToEmbed.slice(0, 50)}...`);

        let embedding: number[];
        try {
          embedding = await generateEmbedding(textToEmbed, OPENAI_API_KEY);
          console.log(`Chunk ${i + 1}: embedding generated successfully (${embedding.length} dims)`);
        } catch (err) {
          console.error(`Chunk ${i + 1}: Embedding generation error:`, err);
          errorCount++;
          recordSampleError("embedding", err, {
            entry_index: meta.entry_index,
            chunk_index: meta.chunk_index,
          });
          continue;
        }

        const { error: insertError } = await supabase.from("document_chunks").insert({
          content: chunk.content,
          metadata: meta,
          embedding,
        });

        if (insertError) {
          console.error("Insert error:", insertError);
          errorCount++;
          recordSampleError("insert", {
            code: insertError.code,
            message: insertError.message,
            details: insertError.details,
            hint: insertError.hint,
          }, {
            entry_index: meta.entry_index,
            chunk_index: meta.chunk_index,
          });
        } else {
          successCount++;
        }
      } catch (err) {
        console.error("Chunk processing error:", err);
        errorCount++;
        recordSampleError("processing", err);
      }
    }

    console.log(`Ingest complete: ${successCount} success, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: successCount,
        errors: errorCount,
        sampleErrors,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Ingest error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

