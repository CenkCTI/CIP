import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { getByokProvider, modelIdSchema, type ByokProviderId } from "./providers";
export const BYOK_COOKIE = "cip_byok";
export const GUEST_COOKIE = "cip_guest";
export const BYOK_COOKIE_PATH = "/api";
export const LEGACY_BYOK_COOKIE_PATH = "/api/ai";
const payloadSchema = z.object({ v: z.literal(1), providerId: z.enum(["openai","openrouter","groq","nvidia_nim"]), model: modelIdSchema, apiKey: z.string().min(8).max(4096), exp: z.number().int(), binding: z.object({ kind: z.enum(["user","guest"]), id: z.string().min(8).max(128) }).strict() }).strict();
export type ByokBinding = { kind: "user"|"guest"; id: string };
export type ByokCredential = z.infer<typeof payloadSchema>;
function key() { const raw = process.env.BYOK_COOKIE_ENCRYPTION_KEY ?? ""; const buf = /^[A-Za-z0-9+/]+={0,2}$/.test(raw) ? Buffer.from(raw, "base64") : Buffer.from(raw, "hex"); if (buf.length < 32) throw new Error("byok_not_configured"); return buf.subarray(0,32); }
export function byokEnabled() { return process.env.BYOK_ENABLED === "true" && Boolean(process.env.BYOK_COOKIE_ENCRYPTION_KEY); }
export function ttlSeconds() { const m = Number(process.env.BYOK_SESSION_TTL_MINUTES ?? 480); return Math.min(24*3600, Math.max(300, Math.trunc(m)*60)); }
export function encryptCredential(input: { providerId: ByokProviderId; model: string; apiKey: string; binding: ByokBinding; now?: number }) { getByokProvider(input.providerId); const exp = (input.now ?? Date.now()) + ttlSeconds()*1000; const payload = payloadSchema.parse({ v: 1, providerId: input.providerId, model: input.model, apiKey: input.apiKey, exp, binding: input.binding }); const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv); const ct = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]); const tag = cipher.getAuthTag(); return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ct.toString("base64url")}`; }
export function decryptCredential(value: string, binding: ByokBinding, now = Date.now()) { const parts = value.split("."); if (parts.length !== 4 || parts[0] !== "v1") throw new Error("invalid_byok_cookie"); const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(parts[1], "base64url")); decipher.setAuthTag(Buffer.from(parts[2], "base64url")); const raw = Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8"); const payload = payloadSchema.parse(JSON.parse(raw)); if (payload.exp <= now) throw new Error("byok_expired"); if (payload.binding.kind !== binding.kind || payload.binding.id !== binding.id) throw new Error("byok_binding_mismatch"); return payload; }
export function byokCookieOptions(maxAge: number, path = BYOK_COOKIE_PATH) { return { httpOnly: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", path, maxAge }; }
export async function setByokCookie(value: string) { const store = await cookies(); store.set(BYOK_COOKIE, "", byokCookieOptions(0, LEGACY_BYOK_COOKIE_PATH)); store.set(BYOK_COOKIE, value, byokCookieOptions(ttlSeconds(), BYOK_COOKIE_PATH)); }
export async function clearByokCookie() { const store = await cookies(); store.set(BYOK_COOKIE, "", byokCookieOptions(0, BYOK_COOKIE_PATH)); store.set(BYOK_COOKIE, "", byokCookieOptions(0, LEGACY_BYOK_COOKIE_PATH)); }
