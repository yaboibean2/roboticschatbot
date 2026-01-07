import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type InChunk = {
  content: string;
  metadata?: Record<string, unknown>;
};

async function updateManual(
  supabase: any,
  manualId: string,
  update: Record<string, unknown>
) {
  const { error } = await supabase.from("manuals").update(update).eq("id", manualId);
  if (error) console.error("Failed to update manual:", error);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const manualId = body.manualId as string | undefined;
    const chunks = body.chunks as InChunk[] | undefined;
    const clearFirst = Boolean(body.clearFirst);
    const finalize = Boolean(body.finalize);
    const totalChunks = body.totalChunks as number | undefined;

    if (!manualId) throw new Error("manualId is required");
    if (!chunks || !Array.isArray(chunks) || chunks.length === 0) throw new Error("chunks is required");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (clearFirst) {
      console.log(`Clearing existing chunks for manual ${manualId}`);
      await updateManual(supabase, manualId, {
        status: "chunking",
        chunk_count: typeof totalChunks === "number" ? totalChunks : null,
        processed_at: null,
      });

      const { error: delErr } = await supabase
        .from("document_chunks")
        .delete()
        .eq("manual_id", manualId);
      if (delErr) {
        console.error("Failed clearing chunks:", delErr);
        throw new Error(delErr.message);
      }
    }

    const inserts = chunks.map((c) => ({
      manual_id: manualId,
      content: c.content,
      metadata: c.metadata ?? {},
      embedding: null,
    }));

    // Insert in smaller sub-batches to avoid payload limits
    const SUB_BATCH = 50;
    let inserted = 0;
    for (let i = 0; i < inserts.length; i += SUB_BATCH) {
      const batch = inserts.slice(i, i + SUB_BATCH);
      const { error: insErr } = await supabase.from("document_chunks").insert(batch as any);
      if (insErr) {
        console.error("Insert error:", insErr);
        throw new Error(insErr.message);
      }
      inserted += batch.length;
    }

    if (finalize) {
      await updateManual(supabase, manualId, {
        status: "embedding",
        chunk_count: typeof totalChunks === "number" ? totalChunks : undefined,
      });
    }

    return new Response(
      JSON.stringify({ success: true, inserted, finalize }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ingest-manual-chunks error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
