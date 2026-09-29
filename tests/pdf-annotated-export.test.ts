import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { burnAnnotationsIntoPdf, mergePdfBytes } from "@/lib/collection/pdf-burn-in";

describe("deterministic annotated PDF helpers",()=>{
  it("burns PDF-space annotations without changing source page count",async()=>{
    const source=await PDFDocument.create();const page=source.addPage([612,792]);const font=await source.embedFont(StandardFonts.Helvetica);page.drawText("APT28 test source",{x:72,y:700,size:12,font});
    const original=new Uint8Array(await source.save());
    const annotated=await burnAnnotationsIntoPdf(original,[{id:"a",annotation_type:"HIGHLIGHT",geometry_version:2,comment:"note",created_at:"2026-01-01"}],[{id:"f",annotation_id:"a",page_number:1,quads:[{x1:70,y1:715,x2:190,y2:715,x3:190,y3:695,x4:70,y4:695}]}]);
    expect(annotated).not.toEqual(original);expect((await PDFDocument.load(annotated)).getPageCount()).toBe(1);
  });
  it("merges front matter and source into one real PDF",async()=>{
    const front=await PDFDocument.create();front.addPage();const body=await PDFDocument.create();body.addPage();body.addPage();
    const merged=await mergePdfBytes(new Uint8Array(await front.save()),new Uint8Array(await body.save()));
    expect(new TextDecoder().decode(merged.slice(0,4))).toBe("%PDF");expect((await PDFDocument.load(merged)).getPageCount()).toBe(3);
  });
});
