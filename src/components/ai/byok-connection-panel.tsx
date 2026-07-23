"use client";
import { useCallback, useEffect, useId, useState, useTransition } from "react";

type Scope = "guest" | "user";
type ByokStatus = { enabled?: boolean; connected?: boolean; state?: string; provider?: string; providerId?: string; model?: string; expiresAt?: string; providers?: { id: string; displayName: string }[]; error?: string };
const providers = [{ id: "openai", displayName: "OpenAI" }, { id: "openrouter", displayName: "OpenRouter" }, { id: "groq", displayName: "Groq" }];
const errorText: Record<string, string> = { key_rejected: "Provider rejected the API key.", provider_rate_limited: "Provider rate limit reached.", timeout: "Provider timed out.", provider_unreachable: "Provider is unreachable.", unsupported_model: "The selected model is unsupported.", byok_unavailable: "BYOK is not enabled on this server.", auth_required: "Sign in to connect BYOK for project workflows.", guest_session_required: "Start an AI demo session before connecting BYOK." };
export function ByokConnectionPanel({ scope, onStatusChange, initialStatus, autoLoad = process.env.NODE_ENV !== "test" }: { scope: Scope; onStatusChange?: (status: ByokStatus) => void; initialStatus?: ByokStatus; autoLoad?: boolean }) {
  const [status, setStatus] = useState<ByokStatus>(initialStatus ?? { connected: false, state: "disconnected", providers });
  const [providerId, setProviderId] = useState("openai");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const id = useId();
  const publish = useCallback((next: ByokStatus) => { setStatus(next); onStatusChange?.(next); }, [onStatusChange]);
  const refresh = useCallback(async () => { try { const r = await fetch("/api/ai/byok/status", { cache: "no-store" }); const j = await r.json(); publish(j); } catch { publish({ connected: false, state: "unavailable", providers }); } }, [publish]);
  useEffect(() => { if (!autoLoad) return; const timer = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(timer); }, [autoLoad, refresh]);
  async function connect() { setMessage("Testing connection. This may consume a very small amount of provider quota."); startTransition(async () => { try { const r = await fetch("/api/ai/byok/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope, providerId, model, apiKey, consent: true }) }); const j = await r.json(); setApiKey(""); if (!r.ok) { setMessage(errorText[j.error] ?? "BYOK connection failed."); publish({ ...status, connected: false, state: j.error }); return; } const next = { ...j, state: "ready", providers, enabled: true }; publish(next); setMessage(`Connected to ${j.provider} / ${j.model}. The key is hidden and held only in the encrypted temporary server session.`); } catch { setApiKey(""); setMessage("Provider is unreachable."); publish({ ...status, connected: false, state: "provider_unreachable" }); } }); }
  async function disconnect() { setMessage("Disconnecting…"); startTransition(async () => { try { const r = await fetch("/api/ai/byok/disconnect", { method: "POST" }); const j = await r.json(); publish({ ...j, providers }); setMessage("Disconnected. The encrypted credential cookie was cleared."); } catch { setMessage("Disconnect failed."); } }); }
  const state = status.connected ? "connected" : status.state ?? "disconnected";
  return <section aria-labelledby={`${id}-heading`} className="card space-y-3" data-testid="byok-connection-panel">
    <h2 id={`${id}-heading`} className="font-semibold text-white">BYOK Provider Connection</h2>
    <p className="text-sm text-amber-200">Your API provider may charge your account. Cyber Research OS does not provide or pay for API usage.</p>
    <p className="text-sm text-slate-300">Selected content will be sent to the chosen provider. The server receives the key once over HTTPS for Test and Connect, then stores it only in an encrypted temporary HttpOnly cookie. Never use a production key with broader permissions than necessary.</p>
    <p className="text-sm text-slate-300">Status: <strong>{state}</strong>{status.provider ? ` — ${status.provider}` : ""}{status.model ? ` / ${status.model}` : ""}{status.expiresAt ? `; expires ${new Date(status.expiresAt).toLocaleString()}` : ""}</p>
    <div className="grid gap-2 md:grid-cols-3">
      <label className="text-sm">Provider<select aria-label="BYOK provider" value={providerId} onChange={(e) => setProviderId(e.target.value)} className="mt-1 w-full rounded bg-slate-950 p-2 text-white">{providers.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select></label>
      <label className="text-sm">Model ID<input aria-label="BYOK model ID" value={model} onChange={(e) => setModel(e.target.value)} maxLength={120} pattern="[A-Za-z0-9._:/+\-]+" placeholder="Explicit supported model" className="mt-1 w-full rounded bg-slate-950 p-2 text-white" /></label>
      <label className="text-sm">API key<input aria-label="BYOK API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" autoComplete="off" placeholder="Paste key for Test and Connect" className="mt-1 w-full rounded bg-slate-950 p-2 text-white" /></label>
    </div>
    <div className="flex flex-wrap gap-2"><button type="button" onClick={connect} disabled={pending || !model || !apiKey} className="rounded bg-cyan-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{pending ? "Working…" : "Test and Connect"}</button><button type="button" onClick={disconnect} disabled={pending || !status.connected} className="rounded border border-slate-700 px-4 py-2 disabled:opacity-50">Disconnect BYOK</button><button type="button" onClick={refresh} className="rounded border border-slate-700 px-4 py-2">Refresh BYOK status</button></div>
    {message && <p role="status" className="text-sm text-cyan-200">{message}</p>}
  </section>;
}
