import { z } from "zod";
import { noStore,readJsonLimited,validateOrigin } from "@/lib/ai/byok/security";
import { requireOwnedProject } from "@/lib/projects/ownership";
import { createStage3ReadContext,Stage3ContextError } from "@/lib/ai/stage3/context";
import { Stage3PdfError } from "@/lib/ai/stage3/pdf-text";
import { documentInputSchema,DocumentScanError } from "@/lib/ai/stage3/document-manifest";
import { loadOwnedDocumentPlan } from "@/lib/ai/stage3/document-source";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    validateOrigin(req);
    const input=documentInputSchema.parse(await readJsonLimited(req,4096));
    const {id}=await params;
    const owned=await requireOwnedProject(id);
    const {manifest}=await loadOwnedDocumentPlan(
      createStage3ReadContext(owned),input.sourceId,input.assetId,input.selection);
    return noStore({manifest});
  }catch(e){
    if(e instanceof DocumentScanError)return noStore({
      code:e.code,stage:"source",requiredChunks:e.requiredChunks??null,
      error:e.code==="document_chunk_limit"?
        "Document exceeds the 24-chunk limit. Select up to 20 pages or process in sections.":
        "The selected document has no extractable text."
    },{status:422});
    if(e instanceof Stage3ContextError || e instanceof Stage3PdfError)
      return noStore({code:e.code,stage:"source",error:"PDF preparation failed."},{status:422});
    if(e instanceof z.ZodError)return noStore({code:"invalid_request",stage:"request",error:"Invalid document selection."},{status:400});
    if(e instanceof Error && e.message==="bad_origin")
      return noStore({code:"bad_origin",stage:"request",error:"Invalid origin."},{status:403});
    if(e instanceof Error && e.message==="Investigation not found")
      return noStore({code:"not_found",stage:"ownership",error:"Investigation not found."},{status:404});
    return noStore({code:"request_failed",stage:"source",error:"Could not prepare document scan."},{status:500});
  }
}
