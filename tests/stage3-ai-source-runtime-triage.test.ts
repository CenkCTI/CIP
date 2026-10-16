// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { loadStage3DocumentContext, type Stage3AiReadContext, type Stage3SourceStep } from "@/lib/ai/stage3/context";
import { stage3RequestSchema } from "@/lib/ai/stage3/schemas";
import { readFileSync } from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";

const sourceId="49429515-bc04-4539-ae53-69f0b47157cb";
const assetId="49429615-bc04-4539-ae53-69f0b47157cb";
const annotationId="49429715-bc04-4539-ae53-69f0b47157cb";
const request=stage3RequestSchema.parse({
  sourceId,assetId,context:{kind:"page",page:1},mode:"analyse",byokConsent:true,
});
function reader(overrides: Record<string,unknown> = {}): Stage3AiReadContext {
  return {
    readSource: vi.fn().mockResolvedValue({id:sourceId,title:"Test source"}),
    readAsset: vi.fn().mockResolvedValue({id:assetId,source_id:sourceId,asset_role:"ORIGINAL",
      state:"READY",storage_path:"owned/test.pdf",mime_type:"application/pdf",size_bytes:100}),
    readAnnotation: vi.fn().mockResolvedValue({id:annotationId,selected_text:"APT28 source reported phishing",page_number:1}),
    downloadOriginalPdf: vi.fn().mockResolvedValue(new TextEncoder().encode("not a PDF").buffer),
    ...overrides,
  } as unknown as Stage3AiReadContext;
}

describe("Stage 3 source runtime triage",()=>{
  it("marks source and asset queries before execution, including unexpected failures",async()=>{
    const steps:Stage3SourceStep[]=[];
    await expect(loadStage3DocumentContext(reader({
      readSource:vi.fn().mockRejectedValue(new TypeError("Unexpected Supabase runtime error")),
    }),request,(step)=>{steps.push(step);})).rejects.toBeInstanceOf(TypeError);
    expect(steps).toEqual(["read_source"]);
    steps.length=0;
    await expect(loadStage3DocumentContext(reader({
      readAsset:vi.fn().mockRejectedValue(new Error("Asset driver failure")),
    }),request,(step)=>{steps.push(step);})).rejects.toThrow("Asset driver failure");
    expect(steps).toEqual(["read_source","read_asset"]);
  });

  it("distinguishes original PDF Storage download from PDF parsing",async()=>{
    const steps:Stage3SourceStep[]=[];
    await expect(loadStage3DocumentContext(reader({
      downloadOriginalPdf:vi.fn().mockRejectedValue(new Error("Storage runtime failure")),
    }),request,(step)=>{steps.push(step);})).rejects.toThrow("Storage runtime failure");
    expect(steps).toEqual(["read_source","read_asset","pdf_download"]);
    steps.length=0;
    await expect(loadStage3DocumentContext(reader(),request,(step)=>{steps.push(step);}))
      .rejects.toMatchObject({code:"pdf_invalid"});
    expect(steps).toEqual(["read_source","read_asset","pdf_download","pdf_extract"]);
  });

  it("passes the entire PDF through server-owned extraction and preserves every page citation",async()=>{
    const doc=await PDFDocument.create();
    const font=await doc.embedFont(StandardFonts.Helvetica);
    for(let page=1;page<=12;page++)doc.addPage([500,700])
      .drawText(`Official source page ${page} text`,{x:30,y:600,font,size:12});
    const bytes=Uint8Array.from(await doc.save()).buffer;
    const full=stage3RequestSchema.parse({
      sourceId,assetId,context:{kind:"document"},mode:"analyse",byokConsent:true,
    });
    const steps:Stage3SourceStep[]=[];
    const result=await loadStage3DocumentContext(reader({
      downloadOriginalPdf:vi.fn().mockResolvedValue(bytes),
    }),full,(step)=>{steps.push(step);});
    expect([...new Set(result.spans.map((span)=>span.page))]).toEqual(
      Array.from({length:12},(_,i)=>i+1));
    expect(result.spans.at(-1)?.token).toBe("DOC_P012_C01");
    expect(steps).toEqual(["read_source","read_asset","pdf_download","pdf_extract","span_build"]);
    expect(JSON.stringify(result.spans)).not.toContain("owned/test.pdf");
  });

  it("records a separate annotation source step without requiring PDF extraction",async()=>{
    const steps:Stage3SourceStep[]=[];
    const annotated=stage3RequestSchema.parse({
      sourceId,assetId,context:{kind:"annotation",annotationId},mode:"analyse",byokConsent:true,
    });
    const result=await loadStage3DocumentContext(reader(),annotated,(step)=>{steps.push(step);});
    expect(result.spans).toHaveLength(1);
    expect(steps).toEqual(["read_source","read_asset","read_annotation"]);
  });

  it("exposes only fixed source steps and a classified PDF runtime error",()=>{
    const route=readFileSync("src/app/api/projects/[id]/ai/processing/route.ts","utf8");
    const pdf=readFileSync("src/lib/ai/stage3/pdf-text.ts","utf8");
    expect(route).toContain('stage === "source" && sourceStep ? {sourceStep} : {}');
    expect(route).toContain('pdf_runtime_unavailable:[503,');
    expect(pdf).toContain('throw new Stage3PdfError("pdf_runtime_unavailable")');
    expect(pdf.indexOf('try {\n    pdfjs = await import(')).toBeGreaterThanOrEqual(0);
  });
});
