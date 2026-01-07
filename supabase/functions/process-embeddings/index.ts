import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 10; // Process 10 chunks at a time to stay under memory limits

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
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const manualId = body.manualId;

    if (!manualId) {
      throw new Error("manualId is required");
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch chunks without embeddings for this manual
    const { data: chunks, error: fetchError } = await supabase
      .from("document_chunks")
      .select("id, content")
      .eq("manual_id", manualId)
      .is("embedding", null)
      .limit(BATCH_SIZE);

    if (fetchError) {
      throw new Error(`Failed to fetch chunks: ${fetchError.message}`);
    }

    if (!chunks || chunks.length === 0) {
      // All chunks processed - update manual status
      const { data: totalData } = await supabase
        .from("document_chunks")
        .select("id", { count: "exact" })
        .eq("manual_id", manualId);

      await supabase
        .from("manuals")
        .update({
          status: "ready",
          processed_at: new Date().toISOString(),
          chunk_count: totalData?.length || 0,
        })
        .eq("id", manualId);

      return new Response(
        JSON.stringify({
          success: true,
          complete: true,
          message: "All embeddings generated",
          totalChunks: totalData?.length || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${chunks.length} chunks for manual ${manualId}`);

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Process each chunk
    for (const chunk of chunks) {
      try {
        const embedding = await generateEmbedding(chunk.content, OPENAI_API_KEY);

        const { error: updateError } = await supabase
          .from("document_chunks")
          .update({ embedding })
          .eq("id", chunk.id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        successCount++;
      } catch (err) {
        errorCount++;
        if (errors.length < 3) {
          errors.push(err instanceof Error ? err.message : "Unknown error");
        }
        console.error(`Error processing chunk ${chunk.id}:`, err);
      }

      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 100));
    }

    // Check remaining chunks
    const { count: remaining } = await supabase
      .from("document_chunks")
      .select("id", { count: "exact", head: true })
      .eq("manual_id", manualId)
      .is("embedding", null);

    const complete = remaining === 0;

    if (complete) {
      const { data: totalData } = await supabase
        .from("document_chunks")
        .select("id", { count: "exact" })
        .eq("manual_id", manualId);

      await supabase
        .from("manuals")
        .update({
          status: "ready",
          processed_at: new Date().toISOString(),
          chunk_count: totalData?.length || 0,
        })
        .eq("id", manualId);
    }

    console.log(
      `Processed ${successCount}/${chunks.length} chunks. Remaining: ${remaining || 0}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        complete,
        processed: successCount,
        errors: errorCount,
        remaining: remaining || 0,
        errorMessages: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Process embeddings error:", error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
