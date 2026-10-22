/** Deterministic, bounded extraction from original PDF pages; no model-generated content. */
export type IndexChunk={page_number:number;chunk_number:number;content:string};
export function splitPagesForIndex(pages:{page:number;text:string}[],size=1800,overlap=180):IndexChunk[]{
  if(!Number.isInteger(size)||size<1000||size>2200||
    !Number.isInteger(overlap)||overlap<0||overlap>=size)throw new Error("invalid_index_chunk");
  const out:IndexChunk[]=[];
  for(const page of pages){
    if(!Number.isInteger(page.page)||page.page<1||page.page>200)throw new Error("invalid_index_page");
    const content=page.text.replace(/\s+/g," ").trim();
    for(let start=0,part=1;start<content.length;start+=size-overlap,part++){
      if(part>500||out.length>=1500)throw new Error("index_chunk_limit");
      out.push({page_number:page.page,chunk_number:part,content:content.slice(start,start+size)});
      if(start+size>=content.length)break;
    }
  }
  return out;
}
export function memorySearchQuery(question:string,history:string[]):string{
  // Follow-ups frequently omit the campaign name: use recent event titles and
  // a bounded set of actor / CVE identifiers to restore the referent.
  const clues=history.join(" ").match(/\b(?:APT\d{1,3}|CVE-\d{4}-\d{4,7}|Storm-\d{3,6}|ANSSI|CERT|GRU|NATO)\b/gi)??[];
  return [question.slice(0,700),...new Set(clues.map(s=>s.toUpperCase()))].slice(0,13).join(" ").slice(0,1000);
}
