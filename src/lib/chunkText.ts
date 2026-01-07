export function chunkText(text: string, chunkSize = 1500, overlap = 200): string[] {
  const chunks: string[] = [];
  const lines = text.split("\n");
  let currentChunk = "";

  // Try to keep boundaries near section/rule markers
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
