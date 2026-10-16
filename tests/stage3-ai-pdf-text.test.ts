// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdfPages, Stage3PdfError } from "@/lib/ai/stage3/pdf-text";

describe("Stage 3 server-side PDF context", () => {
  it("extracts only requested pages as text, not binary or signed URLs", async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    document.addPage([500,700]).drawText("Source reports suspicious activity.", {x:30,y:600,size:12,font});
    document.addPage([500,700]).drawText("APT28 was mentioned by the source.", {x:30,y:600,size:12,font});
    const bytes=await document.save();
    const pages=await extractPdfPages(Uint8Array.from(bytes).buffer,[2]);
    expect(pages).toHaveLength(1);
    expect(pages[0].page).toBe(2);
    expect(pages[0].text).toContain("APT28 was mentioned");
    expect(pages[0].text).not.toContain("suspicious activity");
  });
  it("rejects scanned/textless pages rather than quietly calling OCR", async () => {
    const doc=await PDFDocument.create();
    doc.addPage([500,700]);
    const bytes=await doc.save();
    await expect(extractPdfPages(Uint8Array.from(bytes).buffer,[1]))
      .rejects.toMatchObject({code:"pdf_text_unavailable"});
  });
  it("rejects invalid and out-of-range PDFs", async () => {
    await expect(extractPdfPages(new TextEncoder().encode("not a PDF").buffer,[1]))
      .rejects.toBeInstanceOf(Stage3PdfError);
    const doc=await PDFDocument.create();
    doc.addPage([500,700]);
    const bytes=await doc.save();
    await expect(extractPdfPages(Uint8Array.from(bytes).buffer,[2]))
      .rejects.toMatchObject({code:"pdf_page_out_of_range"});
  });
});
