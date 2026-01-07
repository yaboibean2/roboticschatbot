import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials are not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all quotes without embeddings
    const { data: quotes, error: fetchError } = await supabase
      .from("quotes")
      .select("id, content, subject_title")
      .is("embedding", null);

    if (fetchError) {
      throw new Error(`Failed to fetch quotes: ${fetchError.message}`);
    }

    if (!quotes || quotes.length === 0) {
      return new Response(
        JSON.stringify({ message: "All quotes already have embeddings" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Generating embeddings for ${quotes.length} quotes`);

    let successCount = 0;
    let errorCount = 0;

    for (const quote of quotes) {
      try {
        // Combine content and subject for richer embedding
        const textToEmbed = `${quote.subject_title}: ${quote.content}`;
        const embedding = await generateEmbedding(textToEmbed, OPENAI_API_KEY);

        const { error: updateError } = await supabase
          .from("quotes")
          .update({ embedding })
          .eq("id", quote.id);

        if (updateError) {
          console.error(`Failed to update quote ${quote.id}:`, updateError);
          errorCount++;
        } else {
          successCount++;
          console.log(`Generated embedding for quote: ${quote.id}`);
        }
      } catch (err) {
        console.error(`Error processing quote ${quote.id}:`, err);
        errorCount++;
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${quotes.length} quotes`,
        success: successCount,
        errors: errorCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Generate embeddings error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
