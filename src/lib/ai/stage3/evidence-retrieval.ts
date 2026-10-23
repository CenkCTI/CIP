/**
 * Bounded retrieval hints. An explicitly named PDF page is an exact navigation
 * request, not a semantic query. Never reinterpret the document's own page count
 * ("23 sayfalık rapor") as a requested page.
 */
export function explicitPdfPages(question:string):number[]{
  const found:number[]=[];
  const patterns=[
    /\b(\d{1,3})\s*\.?\s*sayfa(?:s[ıi]n(?:da|de|dan|den|[ıi]n)|da|de|dan|den|daki|deki|n[ıi]n|y[ıi])?(?=$|[^\p{L}\p{N}])/giu,
    /\bsayfa\s*(\d{1,3})(?=$|[^\p{L}\p{N}])/giu,
    /\bpages?\s*(\d{1,3})(?=$|[^\p{L}\p{N}])/giu,
  ];
  for(const re of patterns){
    for(const match of question.matchAll(re)){
      const n=Number(match[1]);
      if(n>=1&&n<=200&&!found.includes(n))found.push(n);
      if(found.length>=3)return found;
    }
  }
  return found;
}

/** A bounded 3-page continuation for a section that explicitly starts on page N. */
export function requestedPdfPages(question:string):number[]{
  const pages=explicitPdfPages(question);
  const isSectionStart=/\b\d{1,3}\s*\.?\s*sayfadan\s+başlayan\b/iu.test(question);
  if(!isSectionStart||pages.length!==1)return pages;
  const start=pages[0];
  return [start,start+1,start+2].filter(n=>n<=200);
}

/**
 * Search-only multilingual lexical probes, deliberately separate from the full
 * question. The deployed search RPC alphabetically truncates to 16 terms;
 * appending French aliases to a long Turkish question loses them. One short
 * dedicated probe preserves the aliases without calling them semantic retrieval.
 */
export function retrievalProbe(question:string):string|null{
  const q=question.toLocaleLowerCase("tr-TR");
  const recommendation=/öneri|tavsiye|korun|önlem|savunma|recommendation|measure|protection/i.test(q);
  const auth=/kimlik|doğrulama|parola|şifre|hesap|authentication|password|credential/i.test(q);
  if(recommendation&&auth)return "authentification passe recommandations protection";
  if(recommendation)return "recommandations securisation protection";
  const purpose=/stratejik|amaç|niyet|casusluk|hedef|kurum|stratejik|espionage|objective|purpose|target/i.test(q);
  if(purpose)return "espionnage gouvernementales universités recherche";
  if(auth)return "authentification passe";
  return null;
}

export type IndexedEvidenceChunk={
  source_id:string;asset_id:string;page_number:number;chunk_number:number;content:string;
};

/** Exact requested pages first; then translation probe and ordinary lexical results. */
export function prioritizedEvidenceChunks(
  exactPages:IndexedEvidenceChunk[],
  probeResults:IndexedEvidenceChunk[],
  lexicalResults:IndexedEvidenceChunk[],
  limit:number,
):IndexedEvidenceChunk[]{
  const out:IndexedEvidenceChunk[]=[];
  const keys=new Set<string>();
  for(const row of [...exactPages,...probeResults,...lexicalResults]){
    if(out.length>=limit)break;
    const key=[row.source_id,row.asset_id,row.page_number,row.chunk_number].join(":");
    if(keys.has(key))continue;
    keys.add(key);
    out.push(row);
  }
  return out;
}
