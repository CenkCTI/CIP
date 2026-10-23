import {describe,it,expect} from "vitest";
import {hasPrivatePdfTextGlyphs,selectVerifiedPdfPageRecovery} from "@/lib/ai/stage3/pdf-recovery";

describe("Independent PDF text recovery",()=>{
 it("replaces only the corrupt page with trustworthy same-page alternate text",()=>{
   const primary=[{page:3,text:"APT28 espionnage"},{page:4,text:
     "APT28 CVE-\uE12E0\uE12E3-\uE12E3397 à partir de mars \uE12E0\uE12E\uE12E et jusqu'en juin 2023"}];
   const independent=[{page:3,text:"APT28 espionnage"},{page:4,text:
     "APT28 CVE-2023-23397 à partir de mars 2022 et jusqu'en juin 2023"}];
   const r=selectVerifiedPdfPageRecovery(primary,independent);
   expect(r.recovered).toEqual([4]);
   expect(r.unresolved).toEqual([]);
   expect(r.pages[0]).toMatchObject({page:3,extractor:"pdfjs"});
   expect(r.pages[1]).toMatchObject({page:4,extractor:"poppler"});
   expect(r.pages[1].text).toContain("mars 2022");
 });
 it("never invents glyph mappings from missing/short/wrong-page alternative text",()=>{
   const primary=[{page:4,text:"APT28 CVE-2023-23397 à partir de mars \uE12E0\uE12E\uE12E"}];
   const candidates=[
     [],[{page:3,text:"APT28 CVE-2023-23397 à partir de mars 2022"}],
     [{page:4,text:"?"}],[{page:4,text:"APT28 CVE-2023-23397 à partir de mars \uE12E0"}],
   ];
   for(const candidate of candidates){
     const r=selectVerifiedPdfPageRecovery(primary,candidate);
     expect(r.recovered).toEqual([]);
     expect(r.unresolved).toEqual([4]);
     expect(r.pages[0].text).toBe(primary[0].text);
   }
 });
 it("rejects duplicate page IDs and preserves intact source excerpts",()=>{
   const primary=[{page:1,text:"Exact quotation."},{page:4,text:"APT28 \uE12E"}];
   const alternate=[{page:4,text:"APT28 2022"},{page:4,text:"APT28 2023"}];
   const r=selectVerifiedPdfPageRecovery(primary,alternate);
   expect(r.pages[0].text).toBe("Exact quotation.");
   expect(r.recovered).toEqual([]);
   expect(r.unresolved).toEqual([4]);
 });
 it("detects PUA ranges and replacement characters but not normal digits",()=>{
   expect(hasPrivatePdfTextGlyphs("\uE000")).toBe(true);
   expect(hasPrivatePdfTextGlyphs("\u{F0000}")).toBe(true);
   expect(hasPrivatePdfTextGlyphs("\uFFFD")).toBe(true);
   expect(hasPrivatePdfTextGlyphs("CVE-2023-23397")).toBe(false);
 });
});
