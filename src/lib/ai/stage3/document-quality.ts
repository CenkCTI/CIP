import {createHash} from "node:crypto";

export type SectionType="COVER"|"TABLE_OF_CONTENTS"|"BIBLIOGRAPHY"|"BODY";
export type QualityFlag="NO_TEXT"|"LOW_TEXT_COVERAGE"|"REPLACEMENT_GLYPHS"|
  "CONTROL_CHARACTERS"|"PAGE_SEQUENCE_INVALID"|"PRIVATE_USE_GLYPHS";
export type PageQuality={
  page:number;charCount:number;replacementCount:number;controlCount:number;privateUseCount:number;
  sectionType:SectionType;flags:QualityFlag[];
};
export type DocumentQuality={
  pageCount:number;pagesWithText:number;pagesWithoutText:number;
  totalExtractedChars:number;extractionFingerprint:string;
  languageHint:"fr"|"en"|"tr"|"mixed"|"unknown";languageMethod:"heuristic_unverified";
  pageDiagnostics:PageQuality[];flags:QualityFlag[];
};

/** Report private-use glyphs without inventing a font-to-Unicode map. */
export function countPrivateUseGlyphs(originalText:string):number{
 return (originalText.match(/[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu)??[]).length;
}
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
    const privateUseCount=countPrivateUseGlyphs(original);
    const pageFlags:QualityFlag[]=[];
    if(!original.trim())pageFlags.push("NO_TEXT");
    else{
      pagesWithText++;
      if(original.trim().length<80)pageFlags.push("LOW_TEXT_COVERAGE");
      if(replacementCount/Math.max(original.length,1)>0.002)
        pageFlags.push("REPLACEMENT_GLYPHS");
      if(controlCount/Math.max(original.length,1)>0.003)
        pageFlags.push("CONTROL_CHARACTERS");
      if(privateUseCount>0)pageFlags.push("PRIVATE_USE_GLYPHS");
    }
    pageFlags.forEach(flag=>flags.add(flag));
    diagnostics.push({page:p.page,charCount:original.length,replacementCount,controlCount,privateUseCount,
      sectionType:classifyPdfSection(original,p.page),flags:pageFlags});
    if(sampleParts.join(" ").length<12000)sampleParts.push(original.slice(0,1200));
  }
  const sample=sampleParts.join(" ").toLocaleLowerCase("en");
  const fr=(sample.match(/\b(?:les|des|dans|pour|contre|depuis|ainsi|leurs|plusieurs|attaques)\b/g)??[]).length;
  const en=(sample.match(/\b(?:the|and|from|against|their|with|these|reports|security)\b/g)??[]).length;
  const tr=(sample.match(/\b(?:ve|bir|ile|olan|olarak|siber|guvenlik|tehdit|rapor|saldiri|inceleme)\b/g)??[]).length;
  const leaders=[["fr",fr],["en",en],["tr",tr]] as const;
  const strong=leaders.filter(([,n])=>n>=8);
  const languageHint=strong.length>1?"mixed" as const:
    fr>=8&&fr>Math.max(en,tr)*2?"fr" as const:
    en>=8&&en>Math.max(fr,tr)*2?"en" as const:
    tr>=8&&tr>Math.max(fr,en)*2?"tr" as const:"unknown" as const;
  return {pageCount:pages.length,pagesWithText,pagesWithoutText:pages.length-pagesWithText,
    totalExtractedChars,extractionFingerprint:hash.digest("hex"),
    languageHint,languageMethod:"heuristic_unverified",pageDiagnostics:diagnostics,
    flags:[...flags].sort()};
}
