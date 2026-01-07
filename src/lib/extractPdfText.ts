import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

// Vite-friendly worker setup
GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

export async function extractPdfText(
  pdf: Blob,
  opts?: {
    onProgress?: (info: { page: number; totalPages: number }) => void;
    maxPages?: number;
  }
): Promise<string> {
  const arrayBuffer = await pdf.arrayBuffer();
  const task = getDocument({ data: arrayBuffer });
  const doc = await task.promise;

  const totalPages = opts?.maxPages ? Math.min(opts.maxPages, doc.numPages) : doc.numPages;

  let out = "";
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    const pageText = (content.items as any[])
      .map((it) => (typeof it?.str === "string" ? it.str : ""))
      .filter(Boolean)
      .join(" ");

    out += `${out ? "\n\n" : ""}--- Page ${pageNum} ---\n${pageText}`;
    opts?.onProgress?.({ page: pageNum, totalPages });
  }

  return out;
}
