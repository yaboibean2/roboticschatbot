import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a helpful assistant that answers questions about robotics competition game manuals.

CRITICAL INSTRUCTIONS:
- Answer questions ONLY based on the provided knowledge base content
- **ALWAYS QUOTE DIRECTLY** from the manual using exact wording in quotation marks
- Include multiple relevant quotes to support your answer
- Format quotes like: "exact text from manual" (Section X.Y, Page Z)
- ALWAYS cite specific rule numbers (G1, G2, SG1, etc.), section names, and page numbers
- If you see "--- Page X ---" markers in the content, use those page numbers in citations
- If the answer is not in the provided context, say "I don't have that information in the current manual"
- Be thorough - include all relevant details from the manual
- Use bullet points for lists of rules or requirements
- Structure your response with quotes first, then explanation
- After your answer, include 3 follow-up questions in this format:
  [followups]
  - Question 1
  - Question 2
  - Question 3
  [/followups]`;

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

async function retrieveRelevantChunks(
  supabase: any,
  query: string,
  manualId: string,
  openaiKey: string
): Promise<string> {
  try {
    const queryEmbedding = await generateEmbedding(query, openaiKey);

    const { data: chunks, error } = await supabase.rpc("match_chunks_by_manual", {
      query_embedding: queryEmbedding,
      manual_id_filter: manualId,
      match_count: 20,
      match_threshold: 0.15,
    }) as { data: any[] | null; error: any };

    if (error) {
      console.error("Error retrieving chunks:", error);
      return "";
    }

    if (!chunks || chunks.length === 0) {
      console.log("No relevant chunks found");
      return "";
    }

    console.log(`Retrieved ${chunks.length} chunks`);

    const formattedChunks = chunks
      .map((c: any, idx: number) => `[Section ${idx + 1}]\n${c.content}`)
      .join("\n\n---\n\n");

    return `\n\nRELEVANT MANUAL CONTENT:\n\n${formattedChunks}`;
  } catch (err) {
    console.error("Semantic search error:", err);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const manualId = body?.manualId;

    if (!manualId) {
      return new Response(
        JSON.stringify({ error: "No manual selected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase credentials not configured");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const latestUserMessage = messages
      .filter((m: { role: string; content: string }) => m?.role === "user" && typeof m?.content === "string")
      .pop()?.content?.trim() || "";

    if (!latestUserMessage) {
      return new Response(
        JSON.stringify({ error: "No user message provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const knowledgeBase = await retrieveRelevantChunks(
      supabase,
      latestUserMessage,
      manualId,
      OPENAI_API_KEY
    );

    const systemPrompt = SYSTEM_PROMPT + knowledgeBase;

    console.log("Sending request with", messages.length, "messages");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please wait a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Usage limit reached." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "AI service temporarily unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Chat function error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
