export type PdfPageText={page:number;text:string};
export type PdfRecoveredPage=PdfPageText&{extractor:"pdfjs"|"poppler"|"ocr"};
/** Preserve only literal, intact R1–R19 source labels that are missed by
 * margin-unaware OCR. Never guess missing labels or numerical identifiers. */
export function preserveVisibleRecommendationLabels(original:string,ocrText:string):string{
 const ids=[...new Set(original.match(/\bR(?:[1-9]|1[0-9])\b/g)??[])];
 const missing=ids.filter(id=>!new RegExp("\\b"+id+"\\b").test(ocrText));
 return missing.length?missing.join("\n")+"\n"+ocrText:ocrText;
}

const unsafe=/[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}\uFFFD]/u;
export function hasPrivatePdfTextGlyphs(text:string):boolean{return unsafe.test(text);}
export function selectVerifiedPdfPageRecovery(primary:PdfPageText[],alternative:PdfPageText[],engine:"poppler"|"ocr"="poppler"):{
 pages:PdfRecoveredPage[];recovered:number[];unresolved:number[];
}{
 const secondary=new Map(alternative.map(p=>[p.page,p.text]));
 const validPageMap=secondary.size===alternative.length;
 const recovered:number[]=[],unresolved:number[]=[];
 const pages=primary.map(p=>{
  if(!hasPrivatePdfTextGlyphs(p.text))return {...p,extractor:"pdfjs" as const};
  const rawCandidate=secondary.get(p.page);
  const candidate=rawCandidate===undefined?undefined:(engine==="ocr"?preserveVisibleRecommendationLabels(p.text,rawCandidate):rawCandidate);
  if(validPageMap&&typeof candidate==="string"&&candidate.trim().length>0&&
    !hasPrivatePdfTextGlyphs(candidate)&&
    candidate.trim().length>=Math.max(10,Math.floor(p.text.trim().length*0.2))&&
    candidate.trim().length<=Math.max(200,p.text.trim().length*5)){
    recovered.push(p.page);
    return {page:p.page,text:candidate,extractor:engine};
  }
  unresolved.push(p.page);
  return {...p,extractor:"pdfjs" as const};
 });
 return {pages,recovered,unresolved};
}
