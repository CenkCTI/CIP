import "server-only";
import type {requireOwnedProject} from "@/lib/projects/ownership";
import {createAdminClient} from "@/lib/supabase/admin";
import {createStage3ReadContext} from "./context";
import {createConfiguredE5Provider} from "./local-e5-provider";
import {CITEM_INDEX_VERSION} from "./extraction-manifest";

type Owned=Awaited<ReturnType<typeof requireOwnedProject>>;

/** Caller must have validated auth, source ownership and explicit local consent. */
export async function embedOwnedChunkBatch(
 owned:Owned,sourceId:string,assetId:string,offset:number,
){
 if(!Number.isInteger(offset)||offset<0||offset>1500)
   throw new Error("BAD_EMBEDDING_OFFSET");
 const provider=createConfiguredE5Provider();
 if(!provider||provider.metadata.dataBoundary!=="LOCAL")
   throw new Error("EMBEDDING_WORKER_NOT_AVAILABLE");
 const reader=createStage3ReadContext(owned);
 const original=await reader.readAsset(sourceId,assetId);
 const sha=String(original.sha256??"");
 if(original.asset_role!=="ORIGINAL"||original.state!=="READY"||
   !/^[a-f0-9]{64}$/.test(sha))throw new Error("INVALID_EMBEDDING_SOURCE");
 const {data:ix,error:ixErr}=await owned.supabase.from("copilot_document_indexes")
  .select("id,asset_sha256,extraction_run_id,index_version,quality_status,status")
  .eq("project_id",owned.projectId).eq("owner_id",owned.user.id)
  .eq("source_id",sourceId).eq("asset_id",assetId).maybeSingle();
 if(ixErr||!ix||ix.asset_sha256!==sha||ix.status!=="READY"||
    ix.quality_status!=="COMPLETE"||ix.index_version!==CITEM_INDEX_VERSION||
    !ix.extraction_run_id)throw new Error("UNVERIFIED_EMBEDDING_INDEX");
 const {data:chunks,error:chunkErr}=await owned.supabase.from("copilot_document_chunks")
  .select("id,content,content_sha256")
  .eq("project_id",owned.projectId).eq("owner_id",owned.user.id)
  .eq("index_id",ix.id).eq("extraction_run_id",ix.extraction_run_id)
  .order("page_number").order("chunk_number").range(offset,offset+7);
 if(chunkErr)throw new Error("EMBEDDING_READ_FAILED");
 if(!chunks?.length)return {status:"COMPLETE",processed:0,nextOffset:null};
 if(chunks.some(c=>!c.content_sha256||!/^[a-f0-9]{64}$/.test(c.content_sha256)))
  throw new Error("MISSING_CHUNK_FINGERPRINT");
 const embeddings=await provider.embed(chunks.map(c=>c.content.slice(0,1550)),"passage");
 const fresh=await owned.supabase.from("source_assets").select("sha256,state")
  .eq("project_id",owned.projectId).eq("source_id",sourceId)
  .eq("id",assetId).maybeSingle();
 if(fresh.error||fresh.data?.sha256!==sha||fresh.data.state!=="READY")
  throw new Error("SOURCE_CHANGED_DURING_EMBEDDING");
 const rows=chunks.map((c,i)=>({
  project_id:owned.projectId,owner_id:owned.user.id,
  index_id:ix.id,source_id:sourceId,asset_id:assetId,
  chunk_id:c.id,extraction_run_id:ix.extraction_run_id,
  asset_sha256:sha,content_sha256:c.content_sha256,
  model_id:provider.metadata.modelId,
  model_revision:provider.metadata.modelRevision,
  embedding:"["+embeddings[i].join(",")+"]",
  source_embedding_approved:true
 }));
 const saved=await createAdminClient().from("copilot_chunk_embeddings").upsert(
  rows,{onConflict:"chunk_id,extraction_run_id,model_id,model_revision"});
 if(saved.error)throw new Error("EMBEDDING_SAVE_FAILED");
 return {status:"PROCESSING",processed:chunks.length,nextOffset:offset+chunks.length};
}
