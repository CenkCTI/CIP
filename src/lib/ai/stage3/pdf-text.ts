import "server-only";
import {hasPrivatePdfTextGlyphs,selectVerifiedPdfPageRecovery} from "./pdf-recovery";
import {tryExtractPdfWithPoppler} from "./pdf-poppler";
import {tryExtractPdfWithOcr} from "./pdf-ocr";

export class Stage3PdfError extends Error {
  constructor(public code: "pdf_invalid" | "pdf_page_out_of_range" | "pdf_text_unavailable" | "pdf_too_large" | "pdf_document_too_large" | "pdf_runtime_unavailable") {
    super(code);
  }
}

const MAX_PDF_BYTES = 50 * 1024 * 1024;

export async function extractPdfPages(
  bytes: ArrayBuffer,
  selectedPages: number[] | "all",
  options: { maxDocumentPages?: number; maxDocumentChars?: number } = {},
): Promise<{ page: number; text: string }[]> {
  if (bytes.byteLength > MAX_PDF_BYTES) throw new Stage3PdfError("pdf_too_large");
  if (bytes.byteLength < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new Stage3PdfError("pdf_invalid");
  }

  // Server extracts text; neither the binary nor a Storage signed URL goes to NVIDIA.
  // PDF.js may fail to load in production/serverless if its runtime dependencies
  // are absent. A safe, typed error is more actionable than an unclassified 500.
  let pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch {
    throw new Stage3PdfError("pdf_runtime_unavailable");
  }
  const { getDocument } = pdfjs;
  // Avoid relying on the PDF viewer's client-side worker or its signed URL.
  try {
    const loadingTask = getDocument({
      // PDF.js may detach its worker input; preserve the authoritative bytes.
      data: Uint8Array.from(new Uint8Array(bytes)),
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    const pages: { page: number; text: string }[] = [];
    const wholeDocument = selectedPages === "all";
    // Never silently sample the first N pages while claiming entire-PDF context.
    // Reject oversized documents before invoking the model.
    const maxPages = options.maxDocumentPages ?? 200;
    const maxChars = options.maxDocumentChars ?? 45_000;
    if (wholeDocument && (pdf.numPages < 1 || pdf.numPages > maxPages)) {
      throw new Stage3PdfError("pdf_document_too_large");
    }
    const requestedPages = wholeDocument
      ? Array.from({length: pdf.numPages}, (_, index) => index + 1)
      : selectedPages;
    let totalTextChars = 0;
    try {
      for (const number of requestedPages) {
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
          totalTextChars += text.length;
          if (wholeDocument && totalTextChars > maxChars) {
            throw new Stage3PdfError("pdf_document_too_large");
          }
          pages.push({ page: number, text });
        } finally {
          page.cleanup();
        }
      }
    } finally {
      await loadingTask.destroy();
    }
    // Distinct same-byte engines must not silently replace source text unless
    // page provenance, Unicode integrity and size sanity are preserved.
    let recovered=pages;
    if(recovered.some(p=>hasPrivatePdfTextGlyphs(p.text))){
      const original=Uint8Array.from(new Uint8Array(bytes));
      const poppler=await tryExtractPdfWithPoppler(original,pdf.numPages);
      if(poppler){
        recovered=selectVerifiedPdfPageRecovery(recovered,poppler,"poppler")
          .pages.map(({page,text})=>({page,text}));
      }
      const unresolved=recovered.filter(p=>hasPrivatePdfTextGlyphs(p.text))
        .map(p=>p.page);
      if(unresolved.length){
        const ocr=await tryExtractPdfWithOcr(original,unresolved,pdf.numPages);
        if(ocr){
          recovered=selectVerifiedPdfPageRecovery(recovered,ocr,"ocr")
            .pages.map(({page,text})=>({page,text}));
        }
      }
    }
    if(wholeDocument&&recovered.reduce((n,p)=>n+p.text.length,0)>maxChars)
      throw new Stage3PdfError("pdf_document_too_large");
    return recovered;
  } catch (error) {
    if (error instanceof Stage3PdfError) throw error;
    throw new Stage3PdfError("pdf_invalid");
  }
}
