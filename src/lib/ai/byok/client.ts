import "server-only";
import { AiError, type AiMessage } from "../client";
import { fixedProviderUrl, getByokProvider, type ByokProviderId } from "./providers";
export async function byokChat(providerId: ByokProviderId, model: string, apiKey: string, messages: AiMessage[], kind: "connection_test"|"generation" = "generation") {
 const p = getByokProvider(providerId); const ctrl = new AbortController(); const timer = setTimeout(()=>ctrl.abort(), p.timeoutMs);
 try { const res = await fetch(fixedProviderUrl(p,p.chatPath), { method:"POST", headers:{ "content-type":"application/json", authorization:`Bearer ${apiKey}`, ...p.headers }, body: JSON.stringify({ model, messages, temperature: 0.1, max_tokens: kind === "connection_test" ? 16 : 4096, ...(p.supportsJsonObject ? { response_format:{ type:"json_object" } } : {}), ...p.disableFallback, stream:false }), signal: ctrl.signal, cache:"no-store", redirect:"error" });
 if (!res.ok) throw new AiError(res.status===401?"key_rejected":res.status===403?"provider_forbidden":res.status===404?"unsupported_model":res.status===429?"provider_rate_limited":res.status>=500?"provider_unreachable":"provider_error");
 const body = await res.json().catch(()=>null) as { choices?: { message?: { content?: string } }[] } | null; const content = body?.choices?.[0]?.message?.content; if (!content) throw new AiError("malformed_output"); return content;
 } catch(e) { if (e instanceof AiError) throw e; if ((e as Error).name === "AbortError") throw new AiError("timeout"); throw new AiError("provider_unreachable"); } finally { clearTimeout(timer); }
}
export async function listProviderModels(providerId: ByokProviderId, apiKey: string) { const p = getByokProvider(providerId); const ctrl = new AbortController(); const timer = setTimeout(()=>ctrl.abort(), Math.min(p.timeoutMs,10000)); try { const res = await fetch(fixedProviderUrl(p,p.modelsPath), { headers:{ authorization:`Bearer ${apiKey}`, ...p.headers }, signal: ctrl.signal, cache:"no-store", redirect:"error" }); if (!res.ok) throw new AiError(res.status===401?"key_rejected":"provider_error"); return await res.json(); } finally { clearTimeout(timer); } }
