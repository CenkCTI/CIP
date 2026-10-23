import {describe,it,expect} from "vitest";
import {buildExtractionManifest,canPublishExtraction,CITEM_INDEX_VERSION}
 from "@/lib/ai/stage3/extraction-manifest";
describe("Phase A immutable page extraction manifest",()=>{
 const pages=[
  {page:1,text:"Report of the analyst on observed activity.".repeat(3),extractor:"pdfjs" as const},
  {page:2,text:"Les attaques ciblent plusieurs organisations.".repeat(3),extractor:"pdfjs" as const},
 ];
 it("separates original quotes and search-only aliases, hashes each page",()=>{
  const m=buildExtractionManifest([{page:1,
    text:"L'œuvre était liée aux données contrôlées. ".repeat(3),
    extractor:"pdfjs"}]);
  expect(m.index_version).toBe(CITEM_INDEX_VERSION);
  expect(m.pages[0].original_text).toContain("œuvre");
  expect(m.pages[0].search_text).toContain("oeuvre");
  expect(m.pages[0].original_text_sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(m.metadata_candidates).toEqual([]);
  expect(canPublishExtraction(m)).toBe(true);
 });
 it("requires every ordered page and forbids OCR as automatically trusted quotation",()=>{
  const full=buildExtractionManifest(pages);
  expect(full.quality_status).toBe("COMPLETE");
  expect(canPublishExtraction(full)).toBe(true);
  const ocr=buildExtractionManifest([{...pages[0],extractor:"ocr"}]);
  expect(ocr.quality_status).toBe("REVIEW_REQUIRED");
  expect(canPublishExtraction(ocr)).toBe(false);
  expect(()=>buildExtractionManifest([pages[1]])).toThrow();
  expect(()=>buildExtractionManifest([pages[0],{...pages[1],page:3}])).toThrow();
  expect(()=>buildExtractionManifest([{page:1,text:"",extractor:"pdfjs"}])).toThrow();
 });
 it("rejects original PDF pages with private-use Unicode even when page count matches",()=>{
  const m=buildExtractionManifest([{page:1,text:"APT28 mars \uE132\uE130\uE132\uE132 ".repeat(5),
   extractor:"pdfjs"}]);
  expect(m.quality_flags).toContain("PRIVATE_USE_GLYPHS");
  expect(canPublishExtraction(m)).toBe(false);
 });
});
