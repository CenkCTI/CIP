import { z } from "zod";
import { cookies } from "next/headers";
import { AiError } from "@/lib/ai/client";
import { byokChat } from "@/lib/ai/byok/client";
import { BYOK_COOKIE,byokEnabled,decryptCredential } from "@/lib/ai/byok/vault";
import { validateProviderModel } from "@/lib/ai/byok/providers";
import { noStore,readJsonLimited,validateOrigin } from "@/lib/ai/byok/security";
import { requireOwnedProject } from "@/lib/projects/ownership";
import { getAiConfig } from "@/lib/ai/config";
import { createStage3ReadContext,Stage3ContextError } from "@/lib/ai/stage3/context";
import { Stage3PdfError } from "@/lib/ai/stage3/pdf-text";
import { documentChunkInputSchema,DocumentScanError } from "@/lib/ai/stage3/document-manifest";
import { loadOwnedDocumentPlan } from "@/lib/ai/stage3/document-source";
import { runStage3CandidateExtraction } from "@/lib/ai/stage3/candidate-workflow";
import { attachStage3CandidateMatches } from "@/lib/ai/stage3/matching";
import { assertStage3QuotaReservation } from "@/lib/ai/stage3/usage-quota";
import type { Stage3Span } from "@/lib/ai/stage3/provenance";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const errorMap:Record<string,[number,string,string]>={
  byok_required:[401,"byok","Connect NVIDIA NIM."],byok_expired:[401,"byok","Reconnect NVIDIA NIM."],
  byok_binding_mismatch:[401,"byok","Reconnect NVIDIA NIM."],
  invalid_byok_cookie:[401,"byok","Reconnect NVIDIA NIM."],
  byok_unavailable:[503,"byok","NVIDIA BYOK unavailable."],
  key_rejected:[401,"nvidia","NVIDIA rejected key."],
  provider_forbidden:[403,"nvidia","Provider access denied."],
  unsupported_model:[400,"byok","Unsupported model."],
  unsupported_provider:[400,"byok","Only NVIDIA NIM is supported."],
  malformed_output:[422,"nvidia","Invalid structured candidate output."],
  nvidia_output_exhausted:[422,"nvidia","NVIDIA output limit reached."],
  provider_rate_limited:[429,"nvidia","NVIDIA rate limit reached."],
  rate_limited:[429,"quota","CİTEM hourly AI quota exhausted."],
  quota_unavailable:[503,"quota","CİTEM quota gate unavailable."],
  provider_unreachable:[502,"nvidia","NVIDIA is unavailable."],
  provider_error:[502,"nvidia","NVIDIA rejected the request."],
  timeout:[504,"nvidia","NVIDIA request timed out."],
  unsupported_asset:[422,"source","Original ready PDF required."],
  stage3_not_found:[404,"source","Source unavailable."],
  context_too_large:[413,"source","Document text too large."],
  pdf_text_unavailable:[422,"source","No extractable PDF text."],
  pdf_invalid:[422,"source","PDF invalid."],
  pdf_too_large:[413,"source","PDF too large."],
  pdf_document_too_large:[413,"source","Document exceeds extraction cap."],
  pdf_page_out_of_range:[422,"source","Page out of range."],
  pdf_runtime_unavailable:[503,"source","PDF runtime unavailable."],
  document_chunk_limit:[422,"source","Document exceeds 24 chunks. Select a smaller range."],
  document_empty:[422,"source","No extractable text."],
  stale_document_chunk:[409,"source","Document has changed. Restart scan."],
};
function errResponse(e:unknown){
  if(e instanceof z.ZodError)return noStore({code:"invalid_request",stage:"request",error:"Invalid chunk selection."},{status:400});
  const code=e instanceof AiError || e instanceof Stage3ContextError ||
    e instanceof Stage3PdfError || e instanceof DocumentScanError?e.code:
    e instanceof Error?e.message:"request_failed";
  const [status,stage,error]=errorMap[code]??[500,"request","Processing failed."];
  return noStore({code:errorMap[code]?code:"request_failed",stage,error},{status});
}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    validateOrigin(req);
    const input=documentChunkInputSchema.parse(await readJsonLimited(req,4096));
    const {id}=await params;
    const owned=await requireOwnedProject(id);
    if(!byokEnabled())throw new AiError("byok_unavailable");
    const cookie=(await cookies()).get(BYOK_COOKIE)?.value;
    if(!cookie)throw new AiError("byok_required");
    const credential=decryptCredential(cookie,{kind:"user",id:owned.user.id});
    if(credential.providerId!=="nvidia_nim")throw new AiError("unsupported_provider");
    if(!validateProviderModel("nvidia_nim",credential.model))throw new AiError("unsupported_model");
    const reader=createStage3ReadContext(owned);
    const {manifest,chunks}=await loadOwnedDocumentPlan(reader,input.sourceId,input.assetId,input.selection);
    if(manifest.fingerprint!==input.fingerprint)throw new AiError("stale_document_chunk");
    const chunk=chunks.find(c=>c.chunkId===input.chunkId);
    if(!chunk)throw new AiError("stale_document_chunk");
    const spans:Stage3Span[]=chunk.pieces.map((piece,i)=>({
      token:"DOC_P"+String(piece.page).padStart(3,"0")+"_C"+String(i+1).padStart(2,"0"),
      text:piece.text,page:piece.page,kind:"PDF",sourceId:input.sourceId,assetId:input.assetId,
    }));
    const sourceTitle=String((await reader.readSource(input.sourceId)).title??"").slice(0,240);
    const cfg=getAiConfig();
    const inputChars=JSON.stringify({sourceTitle,excerpts:spans.map(s=>({source_token:s.token,text:s.text}))}).length;
    if(inputChars>cfg.maxInputChars)throw new AiError("context_too_large");
    const {data:eventId,error:reservationError}=await owned.supabase.rpc("reserve_ai_usage_event",{
      p_project_id:owned.projectId,p_workflow:"stage3_processing",p_input_chars:inputChars,
      p_window_minutes:cfg.rateLimitWindowMinutes,p_max_requests:cfg.stage3RateLimitRequests,
      p_max_input_chars:cfg.stage3RateLimitInputChars,
    });
    assertStage3QuotaReservation(eventId,reservationError);
    try{
      const result=await runStage3CandidateExtraction({sourceTitle,spans},
        messages=>byokChat("nvidia_nim",credential.model,credential.apiKey,messages,"generation"));
      const enriched={...result,candidates:await attachStage3CandidateMatches(owned,result.candidates)};
      await owned.supabase.rpc("complete_ai_usage_event",{
        p_event_id:eventId,p_status:"SUCCEEDED",p_output_chars:JSON.stringify(enriched).length,
      });
      return noStore({chunkId:chunk.chunkId,result:enriched,notice:"Not saved. Analyst review required."});
    }catch(e){
      await owned.supabase.rpc("complete_ai_usage_event",{
        p_event_id:eventId,p_status:"FAILED",p_output_chars:0,
      });
      throw e;
    }
  }catch(e){return errResponse(e);}
}
