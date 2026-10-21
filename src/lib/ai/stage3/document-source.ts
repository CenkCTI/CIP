import "server-only";
import { createHash } from "node:crypto";
import type { Stage3AiReadContext } from "./context";
import { Stage3ContextError } from "./context";
import { extractPdfPages } from "./pdf-text";
import { buildDocumentPlan,documentLimits,type DocumentSelection } from "./document-manifest";

/** Server-only asset reads; no client-supplied text, Storage path or quote. */
export async function loadOwnedDocumentPlan(
  reader:Stage3AiReadContext,sourceId:string,assetId:string,selection:DocumentSelection,
){
  await reader.readSource(sourceId);
  const asset=await reader.readAsset(sourceId,assetId);
  if(asset.asset_role!=="ORIGINAL" || asset.state!=="READY" ||
     typeof asset.storage_path!=="string" || !asset.storage_path ||
     (String(asset.mime_type??"").toLowerCase()!=="application/pdf" &&
      !String(asset.original_filename??"").toLowerCase().endsWith(".pdf"))){
    throw new Stage3ContextError("unsupported_asset");
  }
  if(typeof asset.size_bytes==="number" && asset.size_bytes>50*1024*1024)
    throw new Stage3ContextError("context_too_large");
  const bytes=await reader.downloadOriginalPdf(asset.storage_path);
  const sha=createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
  const selected=selection.kind==="document"?"all" as const:
    Array.from({length:selection.pageEnd-selection.pageStart+1},(_,i)=>selection.pageStart+i);
  if(selected!=="all" && selected.length>documentLimits().maxSelectedPages)
    throw new Stage3ContextError("context_too_large");
  const pages=await extractPdfPages(bytes,selected,{maxDocumentPages:200,maxDocumentChars:500_000});
  return buildDocumentPlan(pages,sha);
}
