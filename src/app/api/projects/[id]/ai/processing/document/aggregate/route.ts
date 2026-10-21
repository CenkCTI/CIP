import {z} from "zod";
import {noStore,readJsonLimited,validateOrigin} from "@/lib/ai/byok/security";
import {requireOwnedProject} from "@/lib/projects/ownership";
import {createStage3ReadContext,Stage3ContextError} from "@/lib/ai/stage3/context";
import {Stage3PdfError} from "@/lib/ai/stage3/pdf-text";
import {documentInputSchema,DocumentScanError} from "@/lib/ai/stage3/document-manifest";
import {loadOwnedDocumentPlan} from "@/lib/ai/stage3/document-source";
import {stage3CandidateModelSchema,verifyStage3Candidates} from "@/lib/ai/stage3/candidates";
import {aggregateDocumentCandidates,DocumentCandidateLimit} from "@/lib/ai/stage3/document-aggregation";
import type {Stage3Span} from "@/lib/ai/stage3/provenance";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const inputSchema=documentInputSchema.extend({
  fingerprint:z.string().regex(/^[a-f0-9]{24}$/),
  chunks:z.array(z.object({
    chunkId:z.string().regex(/^[a-f0-9]{40}$/),
    candidates:z.array(stage3CandidateModelSchema).max(24),
  }).strict()).max(24),
}).strict();
/**
 * Final server verification of all client-presented chunk suggestions.
 * The client may change its review state but cannot authorize or invent
 * source provenance. This endpoint is read-only and consumes no NVIDIA tokens.
 */
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    validateOrigin(req);
    const input=inputSchema.parse(await readJsonLimited(req,900_000));
    const {id}=await params;
    const owned=await requireOwnedProject(id);
    const {manifest,chunks}=await loadOwnedDocumentPlan(
      createStage3ReadContext(owned),input.sourceId,input.assetId,input.selection);
    if(manifest.fingerprint!==input.fingerprint)return noStore({
      code:"stale_document_chunk",stage:"source",error:"Source changed. Restart scan."
    },{status:409});
    const byId=new Map(chunks.map(c=>[c.chunkId,c]));
    const seen=new Set<string>();
    let totalCandidates=0;
    const verified=[];
    for(const entry of input.chunks){
      if(seen.has(entry.chunkId))return noStore({code:"duplicate_chunk",stage:"request",
        error:"Duplicate chunk result."},{status:400});
      seen.add(entry.chunkId);
      const chunk=byId.get(entry.chunkId);
      if(!chunk)return noStore({code:"stale_document_chunk",stage:"source",
        error:"Unknown or stale chunk."},{status:409});
      const spans:Stage3Span[]=chunk.pieces.map((piece,i)=>({
        token:"DOC_P"+String(piece.page).padStart(3,"0")+"_C"+String(i+1).padStart(2,"0"),
        text:piece.text,page:piece.page,kind:"PDF",sourceId:input.sourceId,assetId:input.assetId,
      }));
      const checked=verifyStage3Candidates(entry.candidates,spans);
      // Even if the browser supplied unsupported suggestions, they never enter the queue.
      totalCandidates+=checked.candidates.length;
      if(totalCandidates>24*24)return noStore({code:"candidate_limit",stage:"request",
        error:"Too many candidates."},{status:413});
      verified.push({candidates:checked.candidates,discarded:checked.discarded,warnings:[]});
    }
    const result=aggregateDocumentCandidates(verified,150);
    return noStore({result,verifiedChunks:seen.size,manifestChunks:manifest.chunks.length,
      notice:"Source quotations reverified. Narrative/claim meaning still requires analyst review."});
  }catch(e){
    if(e instanceof DocumentCandidateLimit)return noStore({code:"candidate_limit",stage:"source",
      error:"150-candidate limit reached; use a narrower range."},{status:422});
    if(e instanceof z.ZodError)return noStore({code:"invalid_request",stage:"request",
      error:"Invalid aggregation payload."},{status:400});
    if(e instanceof DocumentScanError || e instanceof Stage3ContextError || e instanceof Stage3PdfError)
      return noStore({code:e.code,stage:"source",error:"Could not revalidate source."},{status:422});
    if(e instanceof Error && e.message==="bad_origin")return noStore({code:"bad_origin",
      stage:"request",error:"Invalid origin."},{status:403});
    if(e instanceof Error && e.message==="body_too_large")return noStore({code:"body_too_large",
      stage:"request",error:"Aggregation payload too large."},{status:413});
    return noStore({code:"request_failed",stage:"source",error:"Aggregation failed."},{status:500});
  }
}
