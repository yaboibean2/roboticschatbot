import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

interface DocumentEntry {
  date: string;
  subject: string;
  content: string;
}

interface IngestChunk {
  content: string;
  metadata: {
    date: string;
    subject: string;
    entry_index: number;
    chunk_index: number;
  };
}

async function parseDocumentAsync(
  text: string,
  onProgress?: (foundEntries: number) => void
): Promise<DocumentEntry[]> {
  const entries: DocumentEntry[] = [];
  const entryPattern =
    /------------------------------------------------------------\r?\nDate: ([^\r\n]+)\r?\nSubject: ([^\r\n]+)\r?\n------------------------------------------------------------\r?\n([\s\S]*?)(?=------------------------------------------------------------\r?\nDate:|$)/g;

  let match;
  let found = 0;

  while ((match = entryPattern.exec(text)) !== null) {
    entries.push({
      date: match[1].trim(),
      subject: match[2].trim(),
      content: match[3].trim(),
    });

    found++;
    if (found % 25 === 0) {
      onProgress?.(found);
      // Yield to the UI thread so the page doesn't freeze on large files
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  onProgress?.(found);
  return entries;
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    let chunk = text.slice(start, end);

    if (end < text.length) {
      const lastPeriod = chunk.lastIndexOf(". ");
      const lastNewline = chunk.lastIndexOf("\n\n");
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

export default function Admin() {
  const [isIngesting, setIsIngesting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");

  const config = useMemo(
    () => ({
      entryChunkChars: 1200,
      entryChunkOverlap: 150,
      chunkBatchSize: 6,
    }),
    []
  );

  const handleIngest = async () => {
    setIsIngesting(true);
    setProgress(0);
    setStatus("Fetching knowledge base...");

    try {
      const response = await fetch("/knowledge_base.txt");
      if (!response.ok) throw new Error("Could not load knowledge_base.txt");

      let content = await response.text();
      console.log(`Fetched knowledge base: ${content.length} characters`);

      setStatus("Parsing document entries...");
      // Allow UI to update before heavy parsing
      await new Promise((r) => setTimeout(r, 50));

      const entries = await parseDocumentAsync(content, (found) => {
        setStatus(`Parsing document entries... ${found} entries found`);
      });
      // free memory early (the file can be very large)
      content = "";

      console.log(`Parsed ${entries.length} entries`);
      if (entries.length === 0) throw new Error("No entries found in knowledge base.");

      let totalSuccess = 0;
      let totalErrors = 0;
      let processedEntries = 0;
      let sentBatches = 0;

      let pendingChunks: IngestChunk[] = [];
      let clearFirst = true;
      let firstSampleError: string | null = null;

      const flush = async () => {
        if (pendingChunks.length === 0) return;

        sentBatches++;
        setStatus(
          `Sending batch ${sentBatches} (${pendingChunks.length} chunks)... (success: ${totalSuccess}, errors: ${totalErrors})`
        );

        const { data, error } = await supabase.functions.invoke("ingest-knowledge", {
          body: { chunks: pendingChunks, clearFirst },
        });

        if (error) throw error;

        totalSuccess += (data as any)?.success || 0;
        totalErrors += (data as any)?.errors || 0;

        const sample = (data as any)?.sampleErrors as any[] | undefined;
        if (!firstSampleError && sample?.length) {
          const e = sample[0];
          firstSampleError =
            typeof e === "string" ? e : e?.message ? String(e.message) : JSON.stringify(e);
        }

        pendingChunks = [];
        clearFirst = false;
      };

      for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
        const entry = entries[entryIndex];
        const chunks = chunkText(entry.content, config.entryChunkChars, config.entryChunkOverlap);

        setStatus(
          `Chunking entry ${entryIndex + 1}/${entries.length} (${chunks.length} chunks)... (success: ${totalSuccess}, errors: ${totalErrors})`
        );

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
          pendingChunks.push({
            content: chunks[chunkIndex],
            metadata: {
              date: entry.date,
              subject: entry.subject,
              entry_index: entryIndex,
              chunk_index: chunkIndex,
            },
          });

          if (pendingChunks.length >= config.chunkBatchSize) {
            await flush();
            await new Promise((r) => setTimeout(r, 250));
          }
        }

        processedEntries++;
        setProgress((processedEntries / entries.length) * 100);
      }

      await flush();

      setProgress(100);
      setStatus(
        `Done! Entries: ${entries.length}. Chunks inserted: ${totalSuccess}. Chunk errors: ${totalErrors}.` +
          (firstSampleError ? `\nFirst error: ${firstSampleError}` : "")
      );
      toast.success("Knowledge base ingested successfully!");
    } catch (error) {
      console.error("Ingestion error:", error);
      setStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      toast.error("Failed to ingest knowledge base");
    } finally {
      setIsIngesting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background p-8">
      <section className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Knowledge Base Admin</h1>
          <p className="text-sm text-muted-foreground">
            Ingests the full knowledge base into vector-searchable chunks for fast RAG.
          </p>
        </header>

        <div className="p-6 border border-border rounded-lg bg-card">
          <h2 className="text-lg font-semibold mb-4">Ingest Knowledge Base</h2>
          <p className="text-muted-foreground mb-4">
            This will parse the knowledge base document, chunk it, generate embeddings, and store everything for
            retrieval.
          </p>

          <Button onClick={handleIngest} disabled={isIngesting} className="mb-4">
            {isIngesting ? "Ingesting..." : "Start Ingestion"}
          </Button>

          {isIngesting && <Progress value={progress} className="mb-4" />}

          {status && (
            <div className="p-4 bg-muted rounded text-sm font-mono whitespace-pre-wrap">{status}</div>
          )}
        </div>
      </section>
    </main>
  );
}

