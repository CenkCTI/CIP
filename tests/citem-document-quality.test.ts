import {describe,it,expect} from "vitest";
import {assessDocumentTextQuality,classifyPdfSection,normalizeForSearch,countPrivateUseGlyphs} from "@/lib/ai/stage3/document-quality";
describe("PDF page quality and search-only normalization",()=>{
 it("keeps original French quotes immutable while generating diacritic aliases",()=>{
   const original="L'œuvre était liée aux données\ncontrôlées";
   const alias=normalizeForSearch(original);
   expect(alias).toBe("L'oeuvre etait liee aux donnees controlees");
   expect(original).toContain("œuvre");
   expect(original).toContain("contrôlées");
 });
 it("classifies actual heading structure without hardcoded actor names",()=>{
   expect(classifyPdfSection("Sommaire\n1 Résumé ............. 3",2)).toBe("TABLE_OF_CONTENTS");
   expect(classifyPdfSection("4 Bibliographie\nReferences",22)).toBe("BIBLIOGRAPHY");
   expect(classifyPdfSection("1 Résumé\nLes attaques...",3)).toBe("BODY");
 });
 it("flags scanned/empty and corrupted pages without inventing OCR text",()=>{
   const q=assessDocumentTextQuality([{page:1,text:""},{page:2,text:"abc\uFFFD\uFFFD\uFFFD"}]);
   expect(q.pagesWithoutText).toBe(1);
   expect(q.flags).toContain("NO_TEXT");
   expect(q.flags).toContain("REPLACEMENT_GLYPHS");
 });
 it("fingerprints original order and checks page provenance",()=>{
   const p=assessDocumentTextQuality([{page:1,text:"APT28 espionnage"},{page:2,text:"Sommaire"}]);
   const reordered=assessDocumentTextQuality([{page:2,text:"Sommaire"},{page:1,text:"APT28 espionnage"}]);
   expect(p.extractionFingerprint).not.toBe(reordered.extractionFingerprint);
   expect(reordered.flags).toContain("PAGE_SEQUENCE_INVALID");
 });
 it("does not treat language heuristics as authoritative metadata",()=>{
   const q=assessDocumentTextQuality([{page:1,text:"the and the and the security reports from the source with these reports"}]);
   expect(q.languageMethod).toBe("heuristic_unverified");
 });
});

describe("ANSSI font-private glyph extraction safety",()=>{
 it("flags corrupt year glyphs even with complete page coverage",()=>{
  const pages=Array.from({length:23},(_,i)=>({page:i+1,text:"Valid PDF page text ".repeat(8)}));
  pages[3].text="APT28 CVE-2023-23397 à partir de mars \uE12E0\uE12E\uE12E et jusqu'en juin 2023";
  const result=assessDocumentTextQuality(pages);
  expect(result.pageCount).toBe(23);
  expect(result.pagesWithoutText).toBe(0);
  expect(result.flags).toContain("PRIVATE_USE_GLYPHS");
  expect(result.pageDiagnostics[3].privateUseCount).toBe(3);
  expect(normalizeForSearch(pages[3].text)).not.toContain("mars 2022");
 });
 it("accepts intact French dates and distinguishes private-use planes",()=>{
  const good="APT28 CVE-2023-23397 à partir de mars 2022 et jusqu'en juin 2023";
  expect(countPrivateUseGlyphs(good)).toBe(0);
  expect(assessDocumentTextQuality([{page:1,text:good}]).flags).not.toContain("PRIVATE_USE_GLYPHS");
  expect(countPrivateUseGlyphs("X\u{F0000}Y\u{100000}")).toBe(2);
 });
});
