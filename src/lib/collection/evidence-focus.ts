/**
 * Evidence Focus: deterministic navigation into the existing PDF.js text layer.
 * No OCR, source writes, unsafe DOM injection, remote lookups, or fuzzy semantic
 * matches. Exact normalized text is preferred; a unique whitespace-insensitive
 * fallback handles PDF.js span fragmentation. Ambiguity fails closed.
 */
export type EvidenceFocusRequest={
  page:number;nonce:number;quote?:string;annotationId?:string;sourceToken?:string;
};
type Point={node:Text;offset:number};
const normalize=(value:string)=>value.normalize("NFKC").replace(/\u00ad/g,"")
  .replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').toLowerCase();
const isWord=(s:string)=>/[\p{L}\p{N}]/u.test(s);
function indexedText(root:HTMLElement){
  const walker=root.ownerDocument.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const chars:string[]=[];const points:Point[]=[];
  let n=walker.nextNode();
  while(n){
    const text=n as Text;
    if(text.parentElement?.closest('[aria-hidden="true"]')){n=walker.nextNode();continue;}
    for(let i=0;i<text.data.length;i++){
      const original=text.data[i];
      const transformed=normalize(original);
      for(const character of transformed){
        const c=/\s/u.test(character)?" ":character;
        if(c===" "&&chars.at(-1)===" ")continue;
        chars.push(c);points.push({node:text,offset:i});
      }
    }
    n=walker.nextNode();
  }
  return {chars,points};
}
function findUnique(haystack:string,needle:string):number{
  const index=haystack.indexOf(needle);
  if(index<0||haystack.indexOf(needle,index+1)>=0)return -1;
  return index;
}
export function locatePdfEvidence(root:HTMLElement,quote:string):Range|null{
  const needle=normalize(quote).replace(/\s+/g," ").trim();
  if(needle.length<12||needle.length>1400||![...needle].some(isWord))return null;
  const {chars,points}=indexedText(root);
  if(!points.length)return null;
  const original=chars.join("");
  let start=findUnique(original,needle),end=start+needle.length-1;
  if(start<0){
    // PDF.js often splits text into adjacent absolutely positioned spans with
    // no boundary whitespace. Require a UNIQUE long alphanumeric match.
    const compactNeedle=[...needle].filter(isWord).join("");
    if(compactNeedle.length<16)return null;
    const compactChars:string[]=[];const rawIndices:number[]=[];
    chars.forEach((c,i)=>{if(isWord(c)){compactChars.push(c);rawIndices.push(i);}});
    const compactAt=findUnique(compactChars.join(""),compactNeedle);
    if(compactAt<0)return null;
    start=rawIndices[compactAt];
    end=rawIndices[compactAt+compactNeedle.length-1];
  }
  const first=points[start],last=points[end];
  if(!first||!last)return null;
  const range=root.ownerDocument.createRange();
  range.setStart(first.node,first.offset);
  range.setEnd(last.node,last.offset+1);
  return range;
}

export type EvidenceRect={left:number;top:number;width:number;height:number};
export function quoteRangeRects(range:Range,page:HTMLElement):EvidenceRect[]{
  const origin=page.getBoundingClientRect();
  const rects:EvidenceRect[]=[];
  for(const rect of Array.from(range.getClientRects())){
    // Clamp all four sides: clipped glyphs must not stretch beyond the page.
    const left=Math.max(0,rect.left-origin.left);
    const top=Math.max(0,rect.top-origin.top);
    const right=Math.min(origin.width,rect.right-origin.left);
    const bottom=Math.min(origin.height,rect.bottom-origin.top);
    const width=right-left;
    const height=bottom-top;
    if(width<2||height<2)continue;
    if(rects.some(r=>Math.abs(r.left-left)<1&&Math.abs(r.top-top)<1&&
       Math.abs(r.width-width)<1))continue;
    rects.push({left,top,width,height});
    if(rects.length>=32)break;
  }
  return rects;
}
