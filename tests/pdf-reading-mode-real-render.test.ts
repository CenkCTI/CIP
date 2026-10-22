// @vitest-environment node
import { describe,expect,it } from "vitest";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";
import { pdfArtworkRegions, recolorPdfPagePixels } from "../src/components/investigations/source-reader/pdf/pdf-reading-mode";

describe("PDF.js real page operator-bounds acceptance",()=>{
  it("darkens surrounding text but keeps a vector diagram in its original RGB",async()=>{
    const doc=await PDFDocument.create();
    const font=await doc.embedFont(StandardFonts.Helvetica);
    const page=doc.addPage([300,200]);
    page.drawText("Cyber threat analysis", {x:24,y:160,size:13,font});
    page.drawRectangle({x:80,y:45,width:120,height:60,color:rgb(.96,.25,.18)});
    const saved=await doc.save();

    const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task=pdfjs.getDocument({
      data:Uint8Array.from(saved),
      useSystemFonts:true,
      disableFontFace:true,
      isEvalSupported:false,
    });
    try{
      const document=await task.promise;
      const loaded=await document.getPage(1);
      const viewport=loaded.getViewport({scale:1});
      const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
      const ctx=canvas.getContext("2d");
      await loaded.render({
        canvas:canvas as unknown as HTMLCanvasElement,
        viewport,
        recordOperations:true,
      }).promise;
      const operationList=await loaded.getOperatorList();
      const boxes=loaded.recordedBBoxes;
      expect(boxes).not.toBeNull();
      const source=ctx.getImageData(0,0,canvas.width,canvas.height);
      const untouched=source.data.slice();
      const regions=pdfArtworkRegions(operationList.fnArray,pdfjs.OPS,boxes,
        source.data,canvas.width,canvas.height);
      expect(regions).not.toBeNull();
      expect(regions!.length).toBeGreaterThan(0);
      expect(recolorPdfPagePixels(source.data,canvas.width,canvas.height,"night",regions!)).toBe(true);
      const i=(y:number,x:number)=>(y*canvas.width+x)*4;
      // Original white page -> night charcoal.
      expect([...source.data.slice(i(10,10),i(10,10)+3)]).toEqual([21,23,25]);
      // Red vector box is preserved, including original color samples.
      expect([...source.data.slice(i(125,125),i(125,125)+3)])
        .toEqual([...untouched.slice(i(125,125),i(125,125)+3)]);
    }finally{
      await task.destroy();
    }
  });
});
