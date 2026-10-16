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
  it("extracts every page for full-PDF context, including beyond the old 10-page range limit",async()=>{
    const document=await PDFDocument.create();
    const font=await document.embedFont(StandardFonts.Helvetica);
    for(let index=1;index<=12;index++){
      document.addPage([500,700]).drawText(`Evidence page ${index}.`,{x:30,y:600,font,size:12});
    }
    const bytes=await document.save();
    const pages=await extractPdfPages(Uint8Array.from(bytes).buffer,"all");
    expect(pages).toHaveLength(12);
    expect(pages.map((page)=>page.page)).toEqual(Array.from({length:12},(_,i)=>i+1));
    expect(pages[11].text).toContain("Evidence page 12");
  });

  it("rejects oversized full-PDF requests instead of silently sampling only the first pages",async()=>{
    const document=await PDFDocument.create();
    const font=await document.embedFont(StandardFonts.Helvetica);
    for(let index=1;index<=3;index++)
      document.addPage([500,700]).drawText(`Evidence from page ${index}`,{x:30,y:600,font,size:12});
    const savedBytes=Uint8Array.from(await document.save());
    // PDF.js may transfer/detach its input ArrayBuffer; each parse needs a fresh buffer.
    const freshBytes=()=>Uint8Array.from(savedBytes).buffer;
    await expect(extractPdfPages(freshBytes(),"all",{maxDocumentPages:2}))
      .rejects.toMatchObject({code:"pdf_document_too_large"});
    await expect(extractPdfPages(freshBytes(),"all",{maxDocumentChars:15}))
      .rejects.toMatchObject({code:"pdf_document_too_large"});
    const pageOnly=await extractPdfPages(freshBytes(),[2]);
    expect(pageOnly.map((p)=>p.page)).toEqual([2]);
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
