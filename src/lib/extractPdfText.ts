import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

// Vite-friendly worker setup
GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

export interface PageImage {
  pageNumber: number;
  blob: Blob;
}

export interface ExtractionResult {
  text: string;
  pageImages: PageImage[];
}

export async function extractPdfText(
  pdf: Blob,
  opts?: {
    onProgress?: (info: { page: number; totalPages: number }) => void;
    maxPages?: number;
  }
): Promise<string> {
  const result = await extractPdfWithImages(pdf, { ...opts, captureImages: false });
  return result.text;
}

export async function extractPdfWithImages(
  pdf: Blob,
  opts?: {
    onProgress?: (info: { page: number; totalPages: number }) => void;
    maxPages?: number;
    captureImages?: boolean;
    imageScale?: number;
  }
): Promise<ExtractionResult> {
  const arrayBuffer = await pdf.arrayBuffer();
  const task = getDocument({ data: arrayBuffer });
  const doc = await task.promise;

  const totalPages = opts?.maxPages ? Math.min(opts.maxPages, doc.numPages) : doc.numPages;
  const captureImages = opts?.captureImages ?? true;
  const imageScale = opts?.imageScale ?? 1.5; // Balance between quality and size

  let text = "";
  const pageImages: PageImage[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    
    // Extract text
    const content = await page.getTextContent();
    const pageText = (content.items as any[])
      .map((it) => (typeof it?.str === "string" ? it.str : ""))
      .filter(Boolean)
      .join(" ");

    text += `${text ? "\n\n" : ""}--- Page ${pageNum} ---\n${pageText}`;

    // Capture page as image
    if (captureImages) {
      try {
        const viewport = page.getViewport({ scale: imageScale });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        
        if (context) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({
            canvasContext: context,
            viewport: viewport,
            canvas: canvas,
          }).promise;

          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))),
              "image/jpeg",
              0.8
            );
          });

          pageImages.push({ pageNumber: pageNum, blob });
        }
      } catch (err) {
        console.warn(`Failed to capture page ${pageNum} as image:`, err);
      }
    }

    opts?.onProgress?.({ page: pageNum, totalPages });
  }

  return { text, pageImages };
}
