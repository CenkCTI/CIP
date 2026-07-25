import "server-only";
import { AiError, type AiMessage } from "../client";
import { fixedProviderUrl, getByokProvider, type ByokProviderId } from "./providers";

function isNvidiaNemotron(providerId: ByokProviderId, model: string) {
  return providerId === "nvidia_nim" && model.startsWith("nvidia/nemotron-");
}

export function buildByokChatRequest(providerId: ByokProviderId, model: string, messages: AiMessage[], kind: "connection_test"|"generation" = "generation") {
  const p = getByokProvider(providerId);
  return {
    model,
    messages,
    temperature: 0.1,
    max_tokens: providerId === "nvidia_nim" && kind === "connection_test" ? 64 : kind === "connection_test" ? 16 : 4096,
    ...(p.supportsJsonObject ? { response_format: { type: "json_object" } } : {}),
    ...(isNvidiaNemotron(providerId, model) ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    ...p.disableFallback,
    stream: false,
  };
}

export async function byokChat(providerId: ByokProviderId, model: string, apiKey: string, messages: AiMessage[], kind: "connection_test"|"generation" = "generation") {
 const p = getByokProvider(providerId); const ctrl = new AbortController(); const timer = setTimeout(()=>ctrl.abort(), p.timeoutMs);
 try { const res = await fetch(fixedProviderUrl(p,p.chatPath), { method:"POST", headers:{ "content-type":"application/json", authorization:`Bearer ${apiKey}`, ...p.headers }, body: JSON.stringify(buildByokChatRequest(providerId, model, messages, kind)), signal: ctrl.signal, cache:"no-store", redirect:"error" });
 if (!res.ok) throw new AiError(res.status===401?"key_rejected":res.status===403?"provider_forbidden":res.status===404?"unsupported_model":res.status===429?"provider_rate_limited":res.status>=500?"provider_unreachable":"provider_error");
 const body = await res.json().catch(()=>null) as { choices?: { finish_reason?: string; message?: { content?: string; reasoning_content?: unknown } }[] } | null; const choice = body?.choices?.[0]; const content = choice?.message?.content; if (!content) throw new AiError(providerId === "nvidia_nim" && choice?.finish_reason === "length" ? "nvidia_output_exhausted" : "malformed_output"); return content;
 } catch(e) { if (e instanceof AiError) throw e; if ((e as Error).name === "AbortError") throw new AiError("timeout"); throw new AiError("provider_unreachable"); } finally { clearTimeout(timer); }
}
export async function listProviderModels(providerId: ByokProviderId, apiKey: string) { const p = getByokProvider(providerId); const ctrl = new AbortController(); const timer = setTimeout(()=>ctrl.abort(), Math.min(p.timeoutMs,10000)); try { const res = await fetch(fixedProviderUrl(p,p.modelsPath), { headers:{ authorization:`Bearer ${apiKey}`, ...p.headers }, signal: ctrl.signal, cache:"no-store", redirect:"error" }); if (!res.ok) throw new AiError(res.status===401?"key_rejected":"provider_error"); return await res.json(); } finally { clearTimeout(timer); } }
