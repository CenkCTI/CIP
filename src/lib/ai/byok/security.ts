import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { safeAiErrorCode, safeAiErrorMessage } from "./errors";
export function noStore(data: unknown, init: ResponseInit = {}) { const r = NextResponse.json(data, init); r.headers.set("Cache-Control", "no-store"); return r; }
export function requireJson(req: Request) { if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("json_required"); }
export function validateOrigin(req: Request) { const origin = req.headers.get("origin"); if (!origin) return; const host = req.headers.get("host"); const allowed = process.env.NEXT_PUBLIC_SITE_URL || (host ? `${req.headers.get("x-forwarded-proto") ?? "http"}://${host}` : ""); if (allowed && origin !== allowed) throw new Error("bad_origin"); }
export async function readJsonLimited(req: Request, max = 65536) { requireJson(req); const txt = await req.text(); if (txt.length > max) throw new Error("body_too_large"); return JSON.parse(txt); }
export function safeErr(e: unknown, status=400) { const code = safeAiErrorCode(e); return noStore({ error: safeAiErrorMessage(code), code }, { status: code.includes("rate") ? 429 : code.startsWith("turnstile_") ? 403 : status }); }
export function hmac(value: string, env = "GUEST_SESSION_HMAC_KEY") { const key = process.env[env] || process.env.BYOK_COOKIE_ENCRYPTION_KEY || "dev-only-unsafe"; return crypto.createHmac("sha256", key).update(value).digest("hex"); }
export function randomToken() { return crypto.randomBytes(32).toString("base64url"); }
