import "server-only";

export class Stage3PdfError extends Error {
  constructor(public code: "pdf_invalid" | "pdf_page_out_of_range" | "pdf_text_unavailable" | "pdf_too_large") {
    super(code);
  }
}

const MAX_PDF_BYTES = 50 * 1024 * 1024;

export async function extractPdfPages(
  bytes: ArrayBuffer,
  selectedPages: number[],
): Promise<{ page: number; text: string }[]> {
  if (bytes.byteLength > MAX_PDF_BYTES) throw new Stage3PdfError("pdf_too_large");
  if (bytes.byteLength < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new Stage3PdfError("pdf_invalid");
  }

  // Server extracts text; neither the binary nor a Storage signed URL goes to NVIDIA.
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  let document: Awaited<ReturnType<ReturnType<typeof getDocument>["promise"]["then"]>> | undefined;
  // Avoid relying on the PDF viewer's client-side worker or its signed URL.
  try {
    const loadingTask = getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    const pages: { page: number; text: string }[] = [];
    try {
      for (const number of selectedPages) {
        if (!Number.isInteger(number) || number < 1 || number > pdf.numPages) {
          throw new Stage3PdfError("pdf_page_out_of_range");
        }
        const page = await pdf.getPage(number);
        try {
          const content = await page.getTextContent();
          const text = content.items.map((item) =>
            "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
          ).join("").replace(/[ \t]+/g, " ").trim();
          if (!text) throw new Stage3PdfError("pdf_text_unavailable");
          pages.push({ page: number, text });
        } finally {
          page.cleanup();
        }
      }
    } finally {
      await loadingTask.destroy();
    }
    return pages;
  } catch (error) {
    if (error instanceof Stage3PdfError) throw error;
    throw new Stage3PdfError("pdf_invalid");
  }
}
