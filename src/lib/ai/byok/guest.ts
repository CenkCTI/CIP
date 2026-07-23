import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { GUEST_COOKIE } from "./vault";
import { hmac, randomToken } from "./security";

const turnstileSiteverify = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const turnstileTimeoutMs = 8000;

function turnstileError(code: string) {
  const error = new Error(code);
  error.name = "TurnstileVerificationError";
  return error;
}

export async function verifyTurnstile(token: string, remoteIp?: string | null) {
  if (!token?.trim()) throw turnstileError("turnstile_missing");
  if (process.env.NODE_ENV !== "production" && process.env.TURNSTILE_DEV_BYPASS === "true" && token === "CIP_DEV_TURNSTILE_BYPASS") return true;
  if (process.env.NODE_ENV === "production" && token === "CIP_DEV_TURNSTILE_BYPASS") throw turnstileError("turnstile_rejected");
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) throw turnstileError("turnstile_unavailable");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), turnstileTimeoutMs);
  try {
    const form = new FormData();
    form.append("secret", secret);
    form.append("response", token);
    if (remoteIp) form.append("remoteip", remoteIp);
    const res = await fetch(turnstileSiteverify, { method: "POST", body: form, cache: "no-store", signal: controller.signal });
    const body = await res.json().catch(() => ({})) as { success?: boolean; "error-codes"?: string[] };
    if (body.success === true) return true;
    const codes = Array.isArray(body["error-codes"]) ? body["error-codes"] : [];
    if (codes.includes("timeout-or-duplicate")) throw turnstileError("turnstile_expired");
    throw turnstileError("turnstile_rejected");
  } catch (e) {
    if (e instanceof Error && e.name === "TurnstileVerificationError") throw e;
    if (e instanceof Error && e.name === "AbortError") throw turnstileError("turnstile_timeout");
    throw turnstileError("turnstile_unavailable");
  } finally {
    clearTimeout(timer);
  }
}
export async function createGuestSession(ip?: string) { const token = randomToken(); const tokenHash = hmac(token); const ipHash = ip ? hmac(ip) : null; const supabase = createAdminClient(); const expires = new Date(Date.now()+8*3600*1000).toISOString(); const { data, error } = await supabase.from("guest_ai_sessions").insert({ token_hash: tokenHash, ip_hash: ipHash, expires_at: expires }).select("id,expires_at").single(); if (error) throw new Error("guest_session_failed"); (await cookies()).set(GUEST_COOKIE, token, { httpOnly:true, sameSite:"strict", secure:process.env.NODE_ENV==="production", path:"/", maxAge:8*3600 }); return { id: data.id as string, expiresAt: data.expires_at as string }; }
export async function requireGuestSession() { const token = (await cookies()).get(GUEST_COOKIE)?.value; if (!token) throw new Error("guest_session_required"); const tokenHash = hmac(token); const supabase = createAdminClient(); const { data, error } = await supabase.from("guest_ai_sessions").select("id,status,expires_at,revoked_at").eq("token_hash", tokenHash).single(); if (error || !data || data.status !== "ACTIVE" || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) throw new Error("guest_session_expired"); return { id: data.id as string, tokenHash, supabase }; }
export async function reserveGuestUsage(args:{guestSessionId:string; provider:string; model:string; workflow:string; inputChars:number}) { const supabase = createAdminClient(); const { data, error } = await supabase.rpc("reserve_guest_ai_usage_event", { p_guest_session_id: args.guestSessionId, p_provider: args.provider, p_model: args.model, p_workflow: args.workflow, p_input_chars: args.inputChars, p_max_requests_hour: Number(process.env.GUEST_AI_MAX_REQUESTS_PER_HOUR ?? 5), p_max_requests_day: Number(process.env.GUEST_AI_MAX_REQUESTS_PER_DAY ?? 20), p_max_input_chars: Number(process.env.GUEST_AI_MAX_INPUT_CHARS ?? 12000) }); if (error || !data) throw new Error("guest_limit_reached"); return data as string; }
export async function completeGuestUsage(eventId:string,status:"SUCCEEDED"|"FAILED"|"CANCELLED",outputChars=0){ await createAdminClient().rpc("complete_guest_ai_usage_event",{p_event_id:eventId,p_status:status,p_output_chars:outputChars}); }
