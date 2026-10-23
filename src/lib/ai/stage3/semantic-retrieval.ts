import "server-only";
import type {requireOwnedProject} from "@/lib/projects/ownership";
import type {IndexedEvidenceChunk} from "./evidence-retrieval";
import {createConfiguredE5Provider} from "./local-e5-provider";
import {exactIdentifiers} from "./hybrid-retrieval";

type Owned=Awaited<ReturnType<typeof requireOwnedProject>>;
export type SemanticSearchStatus="SEMANTIC_READY"|"LEXICAL_ONLY"|"SEMANTIC_ERROR";

/**
 * SQL provider returns only rows filtered by owner/project/current SHA/version
 * BEFORE vector top-k. This routine never uses a service-role read.
 */
export async function findOwnedSemanticCandidates(
 owned:Owned,question:string,
 scope?:{sourceId:string;assetId:string},
 limit=30,
):Promise<{status:SemanticSearchStatus;rows:IndexedEvidenceChunk[]}>{
 const provider=createConfiguredE5Provider();
 if(!provider||!question.trim()||question.length>1500)
   return {status:"LEXICAL_ONLY",rows:[]};
 try{
  const vectors=await provider.embed([question.slice(0,1400)],"query");
  const vec=vectors[0];
  const {data,error}=await owned.supabase.rpc("copilot_search_semantic_chunks_v1",{
    p_project_id:owned.projectId,
    p_model_revision:provider.metadata.modelRevision,
    p_query_embedding:"["+vec.join(",")+"]",
    p_limit:Math.max(1,Math.min(limit,30)),
    p_source_id:scope?.sourceId??null,
    p_asset_id:scope?.assetId??null,
  });
  if(error)throw new Error("SEMANTIC_SQL_UNAVAILABLE");
  return {status:"SEMANTIC_READY",rows:(data??[]) as IndexedEvidenceChunk[]};
 }catch{
  // Never promote stale semantic content when a local service fails.
  return {status:"SEMANTIC_ERROR",rows:[]};
 }
}
/** SQL results are already authorized; this stage only ranks them. */
export function fuseScopedSqlCandidates(
 lexical:readonly IndexedEvidenceChunk[],
 semantic:readonly IndexedEvidenceChunk[],
 question:string,limit=12,k=60,
):IndexedEvidenceChunk[]{
 if(!Number.isInteger(limit)||limit<1||limit>20||k<10||k>200)
   throw new Error("INVALID_FUSION_LIMIT");
 const ids=exactIdentifiers(question);
 const key=(x:IndexedEvidenceChunk)=>
  [x.source_id,x.asset_id,x.page_number,x.chunk_number].join(":");
 const map=new Map<string,{row:IndexedEvidenceChunk;score:number;idHit:boolean}>();
 for(const list of [lexical.slice(0,30),semantic.slice(0,30)]){
  const seen=new Set<string>();
  list.forEach((row,i)=>{
   const id=key(row);if(seen.has(id))return;seen.add(id);
   const old=map.get(id);
   const idHit=ids.some(v=>row.content.toUpperCase().includes(v));
   if(old){old.score+=1/(k+i+1);old.idHit||=idHit;}
   else map.set(id,{row,score:1/(k+i+1),idHit});
  });
 }
 const candidates=[...map.values()].sort((a,b)=>
  Number(b.idHit)-Number(a.idHit)||b.score-a.score||
  a.row.source_id.localeCompare(b.row.source_id)||
  a.row.page_number-b.row.page_number||
  a.row.chunk_number-b.row.chunk_number);
 const assets=new Set(candidates.map(x=>x.row.asset_id));
 const cap=assets.size>=3?4:assets.size===2?Math.max(4,Math.ceil(limit*.7)):limit;
 const selected:IndexedEvidenceChunk[]=[],byAsset=new Map<string,number>();
 for(const hit of candidates){
  const count=byAsset.get(hit.row.asset_id)??0;
  if(count>=cap)continue;
  selected.push(hit.row);byAsset.set(hit.row.asset_id,count+1);
  if(selected.length>=limit)break;
 }
 return selected;
}
