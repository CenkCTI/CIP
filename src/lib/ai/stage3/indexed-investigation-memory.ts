import "server-only";
import {createHash} from "node:crypto";
import type {requireOwnedProject} from "@/lib/projects/ownership";
import {createAdminClient} from "@/lib/supabase/admin";
import {createStage3ReadContext,type Stage3AiReadContext} from "./context";
import {extractPdfPages} from "./pdf-text";
import type {Stage3Span} from "./provenance";
import {splitPagesForIndex,memorySearchQuery} from "./index-chunks";

type Owned=Awaited<ReturnType<typeof requireOwnedProject>>;
export class InvestigationIndexError extends Error {
  constructor(public code:"invalid_index_source"|"index_metadata_mismatch"|"index_database_unavailable"|"index_failed"){
    super(code);
  }
}
type IndexedRow={id:string;status:string;asset_sha256:string;chunk_count:number;indexed_at:string|null};
type Asset={state?:unknown;asset_role?:unknown;sha256?:unknown;storage_path?:unknown;
  mime_type?:unknown;original_filename?:unknown;size_bytes?:unknown};
const isPDF=(a:Asset)=>String(a.mime_type??"").toLowerCase()==="application/pdf"||
  String(a.original_filename??"").toLowerCase().endsWith(".pdf");
export async function ensureIndexedOriginalPDF(owned:Owned,sourceId:string,assetId:string,
  reader:Stage3AiReadContext=createStage3ReadContext(owned)){
  await reader.readSource(sourceId);
  const asset=await reader.readAsset(sourceId,assetId) as Asset;
  const fingerprint=String(asset.sha256??"").toLowerCase();
  if(asset.state!=="READY"||asset.asset_role!=="ORIGINAL"||!isPDF(asset)||
    !/^[0-9a-f]{64}$/.test(fingerprint)||typeof asset.storage_path!=="string"||
    (typeof asset.size_bytes==="number"&&asset.size_bytes>50*1024*1024)){
    throw new InvestigationIndexError("invalid_index_source");
  }
  const query=()=>owned.supabase.from("copilot_document_indexes").select("id,status,asset_sha256,chunk_count,indexed_at")
    .eq("project_id",owned.projectId).eq("owner_id",owned.user.id)
    .eq("source_id",sourceId).eq("asset_id",assetId).maybeSingle();
  const existing=await query();
  if(existing.error)throw new InvestigationIndexError("index_database_unavailable");
  const cached=existing.data as IndexedRow|null;
  if(cached?.status==="READY"&&cached.asset_sha256===fingerprint&&cached.chunk_count>0)
    return {cached:true,chunks:cached.chunk_count};
  if(cached?.status==="PROCESSING"&&cached.asset_sha256===fingerprint&&
    cached.indexed_at&&Date.now()-new Date(cached.indexed_at).getTime()<240_000){
    // Concurrent requests must never expose half-populated chunks.
    return {cached:false,processing:true,chunks:0};
  }
  const bytes=await reader.downloadOriginalPdf(asset.storage_path);
  if(createHash("sha256").update(new Uint8Array(bytes)).digest("hex")!==fingerprint)
    throw new InvestigationIndexError("index_metadata_mismatch");
  // Only the trusted backend may write original-derived evidence. The session
  // user has SELECT-only RLS access, never direct write privileges to this cache.
  const writeDb=createAdminClient();
  const claim=await writeDb.rpc("copilot_claim_document_index",{
    p_project_id:owned.projectId,p_owner_id:owned.user.id,
    p_source_id:sourceId,p_asset_id:assetId,p_sha:fingerprint,
  });
  if(claim.error)throw new InvestigationIndexError("index_database_unavailable");
  if(!claim.data)return {cached:false,processing:true,chunks:0};
  const id=String(claim.data);
  try{
    const pages=await extractPdfPages(bytes,"all",{maxDocumentPages:200,maxDocumentChars:500_000});
    const chunks=splitPagesForIndex(pages);
    if(!chunks.length)throw new InvestigationIndexError("index_failed");
    const removed=await writeDb.from("copilot_document_chunks").delete()
      .eq("project_id",owned.projectId).eq("owner_id",owned.user.id).eq("index_id",id);
    if(removed.error)throw new InvestigationIndexError("index_database_unavailable");
    for(let i=0;i<chunks.length;i+=75){
      const batch=chunks.slice(i,i+75).map(chunk=>({
        ...chunk,project_id:owned.projectId,owner_id:owned.user.id,
        index_id:id,source_id:sourceId,asset_id:assetId,
      }));
      const inserted=await writeDb.from("copilot_document_chunks").insert(batch);
      if(inserted.error)throw new InvestigationIndexError("index_database_unavailable");
    }
    const ready=await writeDb.from("copilot_document_indexes").update({
      status:"READY",chunk_count:chunks.length,page_count:pages.length,indexed_at:new Date().toISOString(),
    }).eq("id",id).eq("project_id",owned.projectId).eq("owner_id",owned.user.id);
    if(ready.error)throw new InvestigationIndexError("index_database_unavailable");
    return {cached:false,chunks:chunks.length,pages:pages.length};
  }catch(error){
    await writeDb.from("copilot_document_indexes").update({status:"ERROR"})
      .eq("id",id).eq("project_id",owned.projectId).eq("owner_id",owned.user.id);
    throw error;
  }
}
export type MemoryEvent={
  id:string;source_id:string|null;asset_id:string|null;kind:string;
  question:string;summary:string;created_at:string;source_evidence:unknown;hypothesis_notes:unknown;
};
export async function readProjectMemoryEvents(owned:Owned,limit=40):Promise<MemoryEvent[]>{
  const {data,error}=await owned.supabase.from("copilot_investigation_events")
    .select("id,source_id,asset_id,kind,question,summary,created_at,source_evidence,hypothesis_notes")
    .eq("project_id",owned.projectId).eq("owner_id",owned.user.id)
    .order("created_at",{ascending:false}).limit(Math.min(Math.max(limit,1),60));
  if(error)throw new InvestigationIndexError("index_database_unavailable");
  return (data??[]) as MemoryEvent[];
}
export async function readProjectAnalystNotes(owned:Owned){
  const {data,error}=await owned.supabase.from("copilot_memory_profiles")
    .select("source_id,notes").eq("project_id",owned.projectId).eq("owner_id",owned.user.id)
    .neq("notes","").limit(12);
  if(error)throw new InvestigationIndexError("index_database_unavailable");
  return (data??[]).map(v=>({
    source_id:String(v.source_id),notes:String(v.notes??"").slice(0,450),
  }));
}
export function eventMemoryHints(events:MemoryEvent[],question:string){
  const words=(question.toLocaleLowerCase("tr-TR").match(/[\p{L}\p{N}]{4,}/gu)??[]).slice(0,14);
  const scored=events.map((event,i)=>({
    event,i,score:words.reduce((v,w)=>v+((event.question+" "+event.summary).toLocaleLowerCase("tr-TR").includes(w)?1:0),0),
  })).sort((a,b)=>b.score-a.score||a.i-b.i);
  return scored.slice(0,6).map(({event})=>({
    type:event.kind,question:event.question.slice(0,250),
    prior_unverified_analysis:(event.summary+"\n"+
      (Array.isArray(event.hypothesis_notes)?
        "Hypotheses (not verified): "+event.hypothesis_notes.slice(0,3).map((h,i)=>{
          const item=h as {title?:unknown;rationale?:unknown};
          return (i+1)+". "+String(item.title??"").slice(0,80)+": "+String(item.rationale??"").slice(0,160);
        }).join(" | "):"")).slice(0,950),
    date:event.created_at,
  }));
}
export async function retrieveOwnedEvidence(owned:Owned,question:string,events:MemoryEvent[],limit=12)
  :Promise<Stage3Span[]>{
  const expanded=memorySearchQuery(question,events.slice(0,5).map(e=>e.question+" "+e.summary));
  const {data,error}=await owned.supabase.rpc("copilot_search_document_chunks",{
    p_project_id:owned.projectId,p_question:expanded,p_limit:Math.min(limit,20),
  });
  if(error)throw new InvestigationIndexError("index_database_unavailable");
  type Chunk={source_id:string;asset_id:string;page_number:number;chunk_number:number;content:string};
  const rows=(data??[]) as Chunk[];
  return rows.map((row,i)=>({
    token:"MEM_"+String(i+1).padStart(3,"0"),text:row.content,
    page:row.page_number,kind:"PDF" as const,sourceId:row.source_id,assetId:row.asset_id,
  }));
}
export type AnalysisEventInput={
  kind:"ANALYSE"|"EXTRACT"|"ASK"|"ASSESSMENT"|"WEB_RESEARCH";
  sourceId:string;assetId:string;question?:string;
  result:Record<string,unknown>;context?:object;
};
export async function saveInvestigationEvent(owned:Owned,input:AnalysisEventInput){
  const raw=input.result;
  const pdfEvidence=Array.isArray(raw.evidence)?raw.evidence:
    Array.isArray(raw.verifiedSupport)?raw.verifiedSupport:[];
  const webEvidence=Array.isArray(raw.webEvidence)?raw.webEvidence:[];
  const evidence=[...pdfEvidence,...webEvidence].slice(0,8);
  const hypotheses=Array.isArray(raw.hypotheses)?raw.hypotheses.slice(0,3):[];
  const summary=typeof raw.summary==="string"?raw.summary.slice(0,5800):
    Array.isArray(raw.candidates)?
      ("Extracted "+raw.candidates.length+" unverified candidates (analyst review required): "+
        raw.candidates.slice(0,12).map((item)=>{
          const c=item as {value?:unknown;name?:unknown;kind?:unknown};
          return String(c.value??c.name??c.kind??"candidate").slice(0,90);
        }).join(", ")).slice(0,5800):"";
  const {error}=await createAdminClient().from("copilot_investigation_events").insert({
    project_id:owned.projectId,owner_id:owned.user.id,
    source_id:input.sourceId,asset_id:input.assetId,kind:input.kind,
    question:(input.question??"").slice(0,1500),summary,
    source_evidence:JSON.stringify(evidence).length<=11000?evidence:[],
    hypothesis_notes:JSON.stringify(hypotheses).length<=9000?hypotheses:[],
    metadata:{context:input.context??{},verifiedQuotesMayRequireRechecking:true},
  });
  if(error)throw new InvestigationIndexError("index_database_unavailable");
}
