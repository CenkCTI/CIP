import type { Stage3Candidate,Stage3CandidateResponse } from "./candidates";
import type { Stage3Support } from "./provenance";

export class DocumentCandidateLimit extends Error {
  constructor(){super("document_candidate_limit");}
}
function exactKey(candidate:Stage3Candidate):string|null{
  if(candidate.kind==="CVE")return "CVE:"+candidate.cveId.toUpperCase();
  if(candidate.kind==="MITRE")return "MITRE:"+candidate.techniqueId.toUpperCase();
  if(candidate.kind==="INDICATOR"){
    // URL paths and queries, registry/file paths and local parts of emails may
    // be case-sensitive; do not lowercase them during identity comparison.
    const insensitive=["DOMAIN","HASH","IP","CIDR"].includes(candidate.indicatorType);
    const value=candidate.value.normalize("NFKC").trim();
    return "INDICATOR:"+candidate.indicatorType+":"+(insensitive?value.toLowerCase():value);
  }
  return null; // No semantic consolidation of Source Claims, events or identities.
}
function citationKey(s:Stage3Support){
  return JSON.stringify([s.provenance.sourceId,s.provenance.assetId,s.provenance.annotationId??"",
    s.page,s.sourceToken,s.quote]);
}
export function aggregateDocumentCandidates(
  results:Stage3CandidateResponse[],maxCandidates=150,
):Stage3CandidateResponse{
  const byKey=new Map<string,Stage3Candidate>();
  const order:string[]=[];
  const warnings=new Set<string>();
  let discarded=0;
  for(const response of results){
    discarded+=response.discarded;
    response.warnings.forEach(w=>warnings.add(w));
    for(const item of response.candidates){
      const key=exactKey(item)??("INDIVIDUAL:"+item.candidateId);
      const previous=byKey.get(key);
      if(!previous){
        if(order.length>=maxCandidates)throw new DocumentCandidateLimit();
        byKey.set(key,{...item,candidateId:key,verifiedSupport:[...item.verifiedSupport]});
        order.push(key);
        continue;
      }
      if(exactKey(item)===null)continue; // Stable identical ID replay, not semantic merge.
      const seen=new Set(previous.verifiedSupport.map(citationKey));
      const combined=[...previous.verifiedSupport];
      for(const support of item.verifiedSupport){
        if(!seen.has(citationKey(support))){seen.add(citationKey(support));combined.push(support);}
      }
      const matches=[...(previous.existingMatches??[]),...(item.existingMatches??[])];
      const uniqueMatches=[...new Map(matches.map(m=>[m.id,m])).values()].slice(0,5);
      byKey.set(key,{...previous,verifiedSupport:combined,
        existingMatches:uniqueMatches.length?uniqueMatches:undefined,
        matchStatus:previous.matchStatus==="UNAVAILABLE"||item.matchStatus==="UNAVAILABLE"?
          "UNAVAILABLE":previous.matchStatus??item.matchStatus});
    }
  }
  return {candidates:order.map(k=>byKey.get(k)!),warnings:[...warnings],discarded};
}
