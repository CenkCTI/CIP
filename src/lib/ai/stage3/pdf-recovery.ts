export type PdfPageText={page:number;text:string};
export type PdfRecoveredPage=PdfPageText&{extractor:"pdfjs"|"poppler"};
const unsafe=/[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}\uFFFD]/u;
export function hasPrivatePdfTextGlyphs(text:string):boolean{return unsafe.test(text);}
export function selectVerifiedPdfPageRecovery(primary:PdfPageText[],alternative:PdfPageText[]):{
 pages:PdfRecoveredPage[];recovered:number[];unresolved:number[];
}{
 const secondary=new Map(alternative.map(p=>[p.page,p.text]));
 const validPageMap=secondary.size===alternative.length;
 const recovered:number[]=[],unresolved:number[]=[];
 const pages=primary.map(p=>{
  if(!hasPrivatePdfTextGlyphs(p.text))return {...p,extractor:"pdfjs" as const};
  const candidate=secondary.get(p.page);
  if(validPageMap&&typeof candidate==="string"&&candidate.trim().length>0&&
    !hasPrivatePdfTextGlyphs(candidate)&&
    candidate.trim().length>=Math.max(10,Math.floor(p.text.trim().length*0.2))&&
    candidate.trim().length<=Math.max(200,p.text.trim().length*5)){
    recovered.push(p.page);
    return {page:p.page,text:candidate,extractor:"poppler" as const};
  }
  unresolved.push(p.page);
  return {...p,extractor:"pdfjs" as const};
 });
 return {pages,recovered,unresolved};
}
