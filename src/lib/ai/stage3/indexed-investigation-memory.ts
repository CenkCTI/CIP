import "server-only";
import {createHash} from "node:crypto";
import type {requireOwnedProject} from "@/lib/projects/ownership";
import {createAdminClient} from "@/lib/supabase/admin";
import {createStage3ReadContext,type Stage3AiReadContext} from "./context";
import {extractPdfPages} from "./pdf-text";
import type {Stage3Span} from "./provenance";
import {splitPagesForIndex,memorySearchQuery} from "./index-chunks";
import {explicitPdfPages,retrievalProbe,prioritizedEvidenceChunks,type IndexedEvidenceChunk} from "./evidence-retrieval";

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
/**
 * A READY index is an atomic, token-owned snapshot of all extracted PDF pages.
 * The v2 RPCs require forward migration 067. No partial chunk set is published.
 */
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
  const existing=await owned.supabase.from("copilot_document_indexes")
    .select("id,status,asset_sha256,chunk_count,page_count,indexed_at")
    .eq("project_id",owned.projectId).eq("owner_id",owned.user.id)
    .eq("source_id",sourceId).eq("asset_id",assetId).maybeSingle();
  if(existing.error)throw new InvestigationIndexError("index_database_unavailable");
  const cached=existing.data as (IndexedRow&{page_count:number})|null;
  if(cached?.status==="READY"&&cached.asset_sha256===fingerprint&&
    cached.chunk_count>0&&cached.page_count>0){
    // A stale/partially populated READY record must not be trusted as complete.
    const counted=await owned.supabase.from("copilot_document_chunks")
      .select("id",{count:"exact",head:true})
      .eq("project_id",owned.projectId).eq("owner_id",owned.user.id)
      .eq("index_id",cached.id);
    if(counted.error)throw new InvestigationIndexError("index_database_unavailable");
    if(counted.count===cached.chunk_count)
      return {cached:true,chunks:cached.chunk_count,pages:cached.page_count};
  }
  if(cached?.status==="PROCESSING"&&cached.asset_sha256===fingerprint&&
    cached.indexed_at&&Date.now()-new Date(cached.indexed_at).getTime()<240_000){
    return {cached:false,processing:true,chunks:0};
  }
  const bytes=await reader.downloadOriginalPdf(asset.storage_path);
  if(createHash("sha256").update(new Uint8Array(bytes)).digest("hex")!==fingerprint)
    throw new InvestigationIndexError("index_metadata_mismatch");
  // Parse before claiming to avoid holding an index lease while extracting.
  const pages=await extractPdfPages(bytes,"all",{maxDocumentPages:200,maxDocumentChars:500_000});
  const chunks=splitPagesForIndex(pages);
  if(!pages.length||!chunks.length||new Set(chunks.map(c=>c.page_number)).size!==pages.length)
    throw new InvestigationIndexError("index_failed");
  const writeDb=createAdminClient();
  const claim=await writeDb.rpc("copilot_claim_document_index_v2",{
    p_project_id:owned.projectId,p_owner_id:owned.user.id,
    p_source_id:sourceId,p_asset_id:assetId,p_sha:fingerprint,
  });
  if(claim.error)throw new InvestigationIndexError("index_database_unavailable");
  const token=(claim.data as {index_id:string;claim_token:string}[]|null)?.[0];
  if(!token)return {cached:false,processing:true,chunks:0};
  try{
    // One PostgreSQL transaction checks the SHA, lease, all pages, chunk count
    // and writes the full snapshot before marking it READY.
    const published=await writeDb.rpc("copilot_publish_document_index_v2",{
      p_index_id:token.index_id,p_claim_token:token.claim_token,
      p_project_id:owned.projectId,p_owner_id:owned.user.id,
      p_source_id:sourceId,p_asset_id:assetId,p_sha:fingerprint,
      p_page_count:pages.length,p_chunks:chunks,
    });
    if(published.error)throw new InvestigationIndexError("index_database_unavailable");
    if(published.data!==true)throw new InvestigationIndexError("index_failed");
    return {cached:false,chunks:chunks.length,pages:pages.length};
  }catch(error){
    // A timed-out worker cannot mark a newer owner's claim as ERROR.
    await writeDb.rpc("copilot_fail_document_index_v2",{
      p_index_id:token.index_id,p_claim_token:token.claim_token,
      p_project_id:owned.projectId,p_owner_id:owned.user.id,
    });
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
export async function retrieveOwnedEvidence(owned:Owned,question:string,events:MemoryEvent[],limit=12,
  active?:{sourceId:string;assetId:string;ready:boolean}):Promise<Stage3Span[]>{
  const expanded=memorySearchQuery(question,events.slice(0,5).map(e=>e.question+" "+e.summary));
  const probe=retrievalProbe(question);
  const rpcQuestion=async(p_question:string):Promise<IndexedEvidenceChunk[]>=>{
    const {data,error}=await owned.supabase.rpc("copilot_search_document_chunks",{
      p_project_id:owned.projectId,p_question,p_limit:Math.min(limit,20),
    });
    if(error)throw new InvestigationIndexError("index_database_unavailable");
    return (data??[]) as IndexedEvidenceChunk[];
  };
  const [lexical,translated]=await Promise.all([
    rpcQuestion(expanded),probe?rpcQuestion(probe):Promise.resolve([] as IndexedEvidenceChunk[]),
  ]);
  // An explicit page reference is a navigational constraint. Fetch its exact
  // owned READY original chunks even if the query's language cannot match FTS.
  // SHA freshness is established by ensureIndexedOriginalPDF before this call.
  let exact:IndexedEvidenceChunk[]=[];
  const requested=active?.ready?explicitPdfPages(question):[];
  if(active?.ready&&requested.length){
    const index=await owned.supabase.from("copilot_document_indexes")
      .select("id,page_count").eq("project_id",owned.projectId)
      .eq("owner_id",owned.user.id).eq("source_id",active.sourceId)
      .eq("asset_id",active.assetId).eq("status","READY").maybeSingle();
    if(index.error)throw new InvestigationIndexError("index_database_unavailable");
    if(index.data){
      const readyPageCount=index.data.page_count;
      const pages=requested.filter(page=>page<=readyPageCount);
      if(pages.length){
        const chunks=await owned.supabase.from("copilot_document_chunks")
          .select("source_id,asset_id,page_number,chunk_number,content")
          .eq("project_id",owned.projectId).eq("owner_id",owned.user.id)
          .eq("source_id",active.sourceId).eq("asset_id",active.assetId)
          .eq("index_id",index.data.id).in("page_number",pages)
          .order("page_number").order("chunk_number").limit(12);
        if(chunks.error)throw new InvestigationIndexError("index_database_unavailable");
        exact=(chunks.data??[]) as IndexedEvidenceChunk[];
      }
    }
  }
  const rows=prioritizedEvidenceChunks(exact,translated,lexical,limit);
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
