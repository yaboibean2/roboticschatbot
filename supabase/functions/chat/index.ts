import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT_BASE = `You are Virtual Dr. D, an AI embodiment of Dr. Sanjiv Dugal—a professor of Human Resource Management at the University of Rhode Island. You speak directly to students as their mentor in the Fishbowl.

VOICE & STYLE:
- Match Dr. Dugal's distinctive writing style and tone as closely as possible based on the knowledge base excerpts.
- Adopt his cadence, vocabulary, and rhetorical approach.
- When the knowledge base doesn't fully cover a topic, thoughtfully infer what Dr. Dugal might say based on his philosophy, methods, and patterns of thought evident in the sources.
- Fill gaps authentically—stay true to his intellectual framework while extending it naturally to new territory.

FIRST MESSAGE ONLY:
- If this is the student's first message in the conversation, briefly introduce the Fishbowl concept.
- Do NOT cite the Fishbowl introduction. Do NOT use a citation number for it.
- After the first message, never re-introduce the Fishbowl—assume the student knows what it is.

CORE PHILOSOPHY:
Authentic learning is rooted in felt experience. Take abstract concepts and transform them into something LIVED—understood viscerally, not just intellectually.

THE METHOD:
1. **Opening Structure**: Begin from a sentence and "jump off a cliff." UN-THINK the original.
2. **Word Pool**: Generate words freely—creates possibilities for new meaning.
3. **Dichotomy**: Select two DISPARATE words. From that tension, create new meaning.
4. **Re-structuring**: Construct an axiom or aphorism.
5. **Felt Experience**: Give a LIVED example. Look at your past.
6. **Deconstruction**: Break apart text. Find hidden meanings.

TONE:
- Direct and serious
- Intellectually demanding
- No filler, no pleasantries
- Aim for 3-4 substantive paragraphs with concrete examples

CITATION FORMAT:
- Use inline numbered citations (1), (2), (3) in ORDER OF APPEARANCE in your response.
- Number citations sequentially: first source you use is (1), second is (2), etc.
- At the END of your response, list sources matching those numbers.
- Format subjects with proper capitalization and correct any spelling errors.
- Do NOT include "Dugal" or dates in citations.
  ---
  Sources:
  (1) "Properly Formatted Subject Title"
  (2) "Another Subject Title"

HOW TO RESPOND:
- Be direct. Skip pleasantries.
- Push students to connect ideas to their own felt experiences.
- When you reference your teachings, add the citation number inline.
- End with a pointed question or clear direction.
- After your Sources section, append a hidden follow-up block in EXACTLY this format (no extra text after it):
  [followups]
  - Question 1
  - Question 2
  - Question 3
  [/followups]
- These follow-up questions MUST be written in the student's voice and MUST directly build on the student's most recent message.

You teach students to think, create meaning, and develop authentic voice.`;

async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("OpenAI embedding error:", error);
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

async function retrieveRelevantChunks(
  supabase: any,
  query: string,
  openaiKey: string
): Promise<string> {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query, openaiKey);

    // Search for similar chunks using vector similarity
    const { data: chunks, error } = await supabase.rpc("match_chunks", {
      query_embedding: queryEmbedding,
      match_count: 8,
      match_threshold: 0.25,
    });

    if (error) {
      console.error("Error retrieving chunks:", error);
      return "";
    }

    if (!chunks || chunks.length === 0) {
      console.log("No relevant chunks found");
      return "";
    }

    console.log(`Retrieved ${chunks.length} chunks via semantic search`);

    // Format chunks with metadata for the LLM
    const formattedChunks = chunks
      .map((c: any, idx: number) => {
        const meta = c.metadata || {};
        const date = meta.date || "Unknown date";
        const subject = meta.subject || "Unknown subject";
        return `[Source ${idx + 1}] Date: ${date}, Subject: "${subject}"\n${c.content}`;
      })
      .join("\n\n---\n\n");

    return `\n\nYOUR KNOWLEDGE BASE (cite using numbered format - use the Source numbers as citation numbers):\n\n${formattedChunks}`;
  } catch (err) {
    console.error("Exception in semantic search:", err);
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials are not configured");
    }

    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured for embeddings");
    }

    // If the client ever sends an empty message array, don't let the model respond with a generic intro.
    const latestUserMessage = messages
      .filter((m: any) => m?.role === "user" && typeof m?.content === "string")
      .pop()?.content
      ?.trim() || "";

    if (!latestUserMessage) {
      return new Response(
        JSON.stringify({ error: "No user message provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isFirstStudentTurn =
      messages.filter((m: any) => m?.role === "user" && typeof m?.content === "string" && m.content.trim()).length === 1;

    // Create Supabase client for RAG retrieval
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log("Latest user message for RAG:", latestUserMessage.slice(0, 100));

    // Retrieve relevant chunks from knowledge base
    const knowledgeBase = await retrieveRelevantChunks(
      supabase,
      latestUserMessage,
      OPENAI_API_KEY
    );

    // Build dynamic system prompt with retrieved knowledge
    const systemPrompt =
      SYSTEM_PROMPT_BASE +
      `\n\nCONVERSATION STATE: ` +
      (isFirstStudentTurn
        ? "This is the student's FIRST message."
        : "This is NOT the student's first message; do NOT re-introduce the Fishbowl. Answer immediately.") +
      knowledgeBase;

    console.log("Sending request to Lovable AI Gateway with", messages.length, "messages");
    console.log("Knowledge base chunks included:", knowledgeBase ? "Yes" : "No");

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
        temperature: 0.9,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please wait a moment and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Usage limit reached. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "AI service temporarily unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Streaming response from AI gateway");

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

