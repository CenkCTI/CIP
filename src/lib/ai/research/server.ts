import "server-only";
import {cookies} from "next/headers";
import {AiError} from "@/lib/ai/client";
import {BYOK_COOKIE,byokEnabled,decryptCredential} from "@/lib/ai/byok/vault";
import {validateProviderModel} from "@/lib/ai/byok/providers";
import {getAiConfig} from "@/lib/ai/config";
import {assertStage3QuotaReservation} from "@/lib/ai/stage3/usage-quota";
import {noStore} from "@/lib/ai/byok/security";
import type {requireOwnedProject} from "@/lib/projects/ownership";

type Owned=Awaited<ReturnType<typeof requireOwnedProject>>;
export async function requireResearchByok(owned:Owned){
  if(!byokEnabled())throw new AiError("byok_unavailable");
  const cookie=(await cookies()).get(BYOK_COOKIE)?.value;
  if(!cookie)throw new AiError("byok_required");
  const credential=decryptCredential(cookie,{kind:"user",id:owned.user.id});
  if(credential.providerId!=="nvidia_nim")throw new AiError("unsupported_provider");
  if(!validateProviderModel("nvidia_nim",credential.model))throw new AiError("unsupported_model");
  return credential;
}
export async function withResearchQuota<T>(owned:Owned,inputChars:number,job:()=>Promise<T>):Promise<T>{
  const config=getAiConfig();
  if(inputChars>config.maxInputChars)throw new AiError("context_too_large");
  const {data:eventId,error}=await owned.supabase.rpc("reserve_ai_usage_event",{
    p_project_id:owned.projectId,p_workflow:"stage3_processing",
    p_input_chars:inputChars,p_window_minutes:config.rateLimitWindowMinutes,
    p_max_requests:config.stage3RateLimitRequests,
    p_max_input_chars:config.stage3RateLimitInputChars,
  });
  assertStage3QuotaReservation(eventId,error);
  try{
    const result=await job();
    await owned.supabase.rpc("complete_ai_usage_event",{
      p_event_id:eventId,p_status:"SUCCEEDED",p_output_chars:JSON.stringify(result).length,
    });
    return result;
  }catch(e){
    await owned.supabase.rpc("complete_ai_usage_event",{
      p_event_id:eventId,p_status:"FAILED",p_output_chars:0,
    });
    throw e;
  }
}
const codes:Record<string,[number,string]>={
  byok_unavailable:[503,"NVIDIA BYOK is not configured."],
  byok_required:[401,"Connect NVIDIA NIM."],
  byok_expired:[401,"Reconnect NVIDIA NIM."],
  byok_binding_mismatch:[401,"BYOK credential is not valid for this user."],
  invalid_byok_cookie:[401,"Reconnect NVIDIA NIM."],
  unsupported_provider:[403,"NVIDIA NIM is required."],
  unsupported_model:[400,"Unsupported NVIDIA model."],
  rate_limited:[429,"CİTEM hourly request quota reached."],
  quota_unavailable:[503,"AI quota service unavailable."],
  provider_rate_limited:[429,"NVIDIA rate limited the request."],
  provider_unreachable:[502,"NVIDIA is unreachable."],
  provider_error:[502,"NVIDIA provider error."],
  malformed_output:[422,"AI response failed verification."],
  context_too_large:[413,"Source context exceeds safe limits."],
  timeout:[504,"AI request timed out."],
  bad_origin:[403,"Request origin rejected."],
  json_required:[415,"JSON request required."],
  body_too_large:[413,"Request too large."],
  stage3_not_found:[404,"Source not found."],
  unsupported_asset:[422,"A READY ORIGINAL PDF is required."],
  pdf_text_unavailable:[422,"No source text available."],
  search_not_configured:[503,"Search gateway unavailable: configure BRAVE_SEARCH_API_KEY on the server."],
  search_unavailable:[502,"Search provider unavailable."],
  search_rate_limited:[429,"Search provider rate limit reached."],
  search_invalid_response:[502,"Search provider returned invalid results."],
  web_url_blocked:[422,"The web address is not a permitted public HTTPS URL."],
  web_dns_blocked:[422,"Web destination is not a public address."],
  web_timeout:[504,"Fetching web content timed out."],
  web_fetch_failed:[502,"Unable to read web page."],
  web_content_unsupported:[422,"Unsupported or unsafe web content."],
  web_too_large:[413,"Web page is too large."],
  web_redirect_blocked:[422,"Web redirect rejected."],
  web_no_text:[422,"No readable content found."],
};
export function researchError(e:unknown){
  const code=e&&typeof e==="object"&&"code" in e&&typeof e.code==="string"?e.code:
    e instanceof Error?e.message:"request_failed";
  if(e&&typeof e==="object"&&"issues" in e)
    return noStore({code:"invalid_request",stage:"request",error:"Invalid research request."},{status:400});
  if(code==="Investigation not found")
    return noStore({code:"not_found",stage:"ownership",error:"Investigation not found."},{status:404});
  const match=codes[code];
  // Disclose only fixed diagnostics, never content, URL, key or upstream errors.
  return noStore({code:match?code:"request_failed",
    stage:code.startsWith("search_")?"search":code.startsWith("web_")?"fetch":"research",
    error:match?.[1]??"Research request failed."},{status:match?.[0]??500});
}
