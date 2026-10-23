import type {IndexedEvidenceChunk} from "./evidence-retrieval";

export type RankedCandidate=IndexedEvidenceChunk & {
  project_id:string;owner_id:string;source_sha256:string;
  index_version:string;quality_status:"COMPLETE";
  section_type?:"COVER"|"TABLE_OF_CONTENTS"|"BIBLIOGRAPHY"|"BODY";
};
export type RankScope={
  projectId:string;ownerId:string;indexVersion:string;
  sourceId?:string;assetId?:string;sourceSha256?:string;
};
export type FusedCandidate={
  row:RankedCandidate;score:number;lexicalRank:number|null;
  semanticRank:number|null;exactIdentifierMatch:boolean;
};
export type FusionStatus="HYBRID"|"LEXICAL_ONLY"|"INSUFFICIENT_RETRIEVAL";
export type FusionResult={status:FusionStatus;items:FusedCandidate[];
  lexicalCandidates:number;semanticCandidates:number};

/** Detect identifiers without interpreting them as new evidence. */
export function exactIdentifiers(query:string):string[]{
 const ids=query.match(/\b(?:APT\d{1,3}|CVE-\d{4}-\d{4,7}|CERTFR-\d{4}-CTI-\d{3}|GHSA-[a-z0-9-]{8,}|T\d{4}(?:\.\d{3})?)\b/gi)??[];
 return [...new Set(ids.map(x=>x.toUpperCase()))].slice(0,12);
}
const key=(r:IndexedEvidenceChunk)=>[r.source_id,r.asset_id,r.page_number,r.chunk_number].join(":");
const sameScope=(r:RankedCandidate,s:RankScope)=>
 r.project_id===s.projectId&&r.owner_id===s.ownerId&&
 r.index_version===s.indexVersion&&r.quality_status==="COMPLETE"&&
 /^[a-f0-9]{64}$/.test(r.source_sha256)&&
 (!s.sourceId||r.source_id===s.sourceId)&&
 (!s.assetId||r.asset_id===s.assetId)&&
 (!s.sourceSha256||r.source_sha256===s.sourceSha256);
const bounded=(xs:readonly RankedCandidate[],scope:RankScope)=>
 xs.slice(0,30).filter(r=>sameScope(r,scope));

/**
 * RRF is a ranking stage, NOT a tenant authorization boundary.
 * The lexical and semantic SQL candidate queries MUST enforce owner/project,
 * original asset SHA, status/version and source policy BEFORE LIMIT 30.
 * The scope checks below are additional fail-closed defense.
 */
export function fuseEvidenceRanks(args:{
 lexical:readonly RankedCandidate[];semantic:readonly RankedCandidate[];
 query:string;scope:RankScope;limit?:number;k?:number;
}):FusionResult{
 const limit=args.limit??12,k=args.k??60;
 if(!Number.isInteger(limit)||limit<1||limit>20||
   !Number.isFinite(k)||k<10||k>200||
   args.query.length>1500)throw new Error("INVALID_RRF_REQUEST");
 const lexical=bounded(args.lexical,args.scope);
 const semantic=bounded(args.semantic,args.scope);
 const found=new Map<string,FusedCandidate>();
 const ids=exactIdentifiers(args.query);
 for(const [kind,list] of [["lexical",lexical],["semantic",semantic]] as const){
  const seen=new Set<string>();
  list.forEach((row,i)=>{
   const identity=key(row);
   if(seen.has(identity))return;
   seen.add(identity);
   const old=found.get(identity);
   const literal=ids.length>0&&ids.some(id=>row.content.toUpperCase().includes(id));
   const foundItem=old??{row,score:0,lexicalRank:null,semanticRank:null,
     exactIdentifierMatch:literal};
   foundItem.score+=1/(k+i+1);
   if(kind==="lexical")foundItem.lexicalRank=i+1;
   else foundItem.semanticRank=i+1;
   found.set(identity,foundItem);
  });
 }
 const sorted=[...found.values()].sort((a,b)=>{
  // Literal identifier match is not a semantic judgement; it is only
  // query-priority for ACTUALLY present identifiers in source text.
  if(ids.length&&a.exactIdentifierMatch!==b.exactIdentifierMatch)
   return a.exactIdentifierMatch?-1:1;
  const diff=b.score-a.score;
  return diff||a.row.source_id.localeCompare(b.row.source_id)||
    a.row.asset_id.localeCompare(b.row.asset_id)||
    a.row.page_number-b.row.page_number||
    a.row.chunk_number-b.row.chunk_number;
 });
 const assets=new Set(sorted.map(x=>x.row.asset_id));
 const maxPerAsset=assets.size>=3?4:assets.size===2?Math.max(4,Math.ceil(limit*0.7)):limit;
 const selected:FusedCandidate[]=[],counts=new Map<string,number>();
 for(const hit of sorted){
  const n=counts.get(hit.row.asset_id)??0;
  if(n>=maxPerAsset)continue;
  counts.set(hit.row.asset_id,n+1);
  selected.push(hit);
  if(selected.length>=limit)break;
 }
 return {
  status:!selected.length?"INSUFFICIENT_RETRIEVAL":
    semantic.length?"HYBRID":"LEXICAL_ONLY",
  items:selected,lexicalCandidates:lexical.length,semanticCandidates:semantic.length,
 };
}
