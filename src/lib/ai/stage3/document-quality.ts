import {createHash} from "node:crypto";

export type SectionType="COVER"|"TABLE_OF_CONTENTS"|"BIBLIOGRAPHY"|"BODY";
export type QualityFlag="NO_TEXT"|"LOW_TEXT_COVERAGE"|"REPLACEMENT_GLYPHS"|
  "CONTROL_CHARACTERS"|"PAGE_SEQUENCE_INVALID";
export type PageQuality={
  page:number;charCount:number;replacementCount:number;controlCount:number;
  sectionType:SectionType;flags:QualityFlag[];
};
export type DocumentQuality={
  pageCount:number;pagesWithText:number;pagesWithoutText:number;
  totalExtractedChars:number;extractionFingerprint:string;
  languageHint:"fr"|"en"|"unknown";languageMethod:"heuristic_unverified";
  pageDiagnostics:PageQuality[];flags:QualityFlag[];
};

export function normalizeForSearch(originalText:string):string{
  // Search alias only; originalText and quoted French passages stay unmodified.
  return originalText.normalize("NFKC")
    .replace(/œ/g,"oe").replace(/Œ/g,"OE")
    .replace(/æ/g,"ae").replace(/Æ/g,"AE")
    .replace(/([\p{L}])-\s*\n\s*([\p{L}])/gu,"$1$2")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\s+/g," ").trim();
}
export function classifyPdfSection(text:string,page:number):SectionType{
  const first=text.slice(0,2500);
  if(/^\s*(?:sommaire|table des mati[eè]res|contents|içindekiler)\s*$/im.test(first))
    return "TABLE_OF_CONTENTS";
  if(/^\s*(?:(?:\d+|[IVX]+)\s+)?(?:bibliographie|r[eé]f[eé]rences|references)\s*$/im.test(first))
    return "BIBLIOGRAPHY";
  if(page===1&&first.trim().length<2000&&
    !/^\s*(?:r[eé]sum[eé]|summary|abstract)\b/im.test(first))return "COVER";
  return "BODY";
}
export function assessDocumentTextQuality(pages:{page:number;text:string}[]):DocumentQuality{
  const flags=new Set<QualityFlag>();
  const diagnostics:PageQuality[]=[];
  const ordered=pages.map(p=>p.page);
  if(ordered.some((v,i)=>v!==i+1))flags.add("PAGE_SEQUENCE_INVALID");
  let totalExtractedChars=0;
  let pagesWithText=0;
  const hash=createHash("sha256");
  const sampleParts:string[]=[];
  for(const p of pages){
    const original=p.text;
    hash.update(String(p.page)).update("\0").update(original).update("\0");
    totalExtractedChars+=original.length;
    const replacementCount=(original.match(/\uFFFD/g)??[]).length;
    const controlCount=(original.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g)??[]).length;
    const pageFlags:QualityFlag[]=[];
    if(!original.trim())pageFlags.push("NO_TEXT");
    else{
      pagesWithText++;
      if(original.trim().length<80)pageFlags.push("LOW_TEXT_COVERAGE");
      if(replacementCount/Math.max(original.length,1)>0.002)
        pageFlags.push("REPLACEMENT_GLYPHS");
      if(controlCount/Math.max(original.length,1)>0.003)
        pageFlags.push("CONTROL_CHARACTERS");
    }
    pageFlags.forEach(flag=>flags.add(flag));
    diagnostics.push({page:p.page,charCount:original.length,replacementCount,controlCount,
      sectionType:classifyPdfSection(original,p.page),flags:pageFlags});
    if(sampleParts.join(" ").length<12000)sampleParts.push(original.slice(0,1200));
  }
  const sample=sampleParts.join(" ").toLocaleLowerCase("en");
  const fr=(sample.match(/\b(?:les|des|dans|pour|contre|depuis|ainsi|leurs|plusieurs|attaques)\b/g)??[]).length;
  const en=(sample.match(/\b(?:the|and|from|against|their|with|these|reports|security)\b/g)??[]).length;
  const languageHint=fr>=8&&fr>en*2?"fr":en>=8&&en>fr*2?"en":"unknown";
  return {pageCount:pages.length,pagesWithText,pagesWithoutText:pages.length-pagesWithText,
    totalExtractedChars,extractionFingerprint:hash.digest("hex"),
    languageHint,languageMethod:"heuristic_unverified",pageDiagnostics:diagnostics,
    flags:[...flags].sort()};
}
