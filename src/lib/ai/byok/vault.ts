import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { getByokProvider, modelIdSchema, type ByokProviderId } from "./providers";
export const BYOK_COOKIE = "cip_byok";
export const GUEST_COOKIE = "cip_guest";
const payloadSchema = z.object({ v: z.literal(1), providerId: z.enum(["openai","openrouter","groq"]), model: modelIdSchema, apiKey: z.string().min(8).max(4096), exp: z.number().int(), binding: z.object({ kind: z.enum(["user","guest"]), id: z.string().min(8).max(128) }).strict() }).strict();
export type ByokBinding = { kind: "user"|"guest"; id: string };
export type ByokCredential = z.infer<typeof payloadSchema>;
function key() { const raw = process.env.BYOK_COOKIE_ENCRYPTION_KEY ?? ""; const buf = /^[A-Za-z0-9+/]+={0,2}$/.test(raw) ? Buffer.from(raw, "base64") : Buffer.from(raw, "hex"); if (buf.length < 32) throw new Error("byok_not_configured"); return buf.subarray(0,32); }
export function byokEnabled() { return process.env.BYOK_ENABLED === "true" && Boolean(process.env.BYOK_COOKIE_ENCRYPTION_KEY); }
export function ttlSeconds() { const m = Number(process.env.BYOK_SESSION_TTL_MINUTES ?? 480); return Math.min(24*3600, Math.max(300, Math.trunc(m)*60)); }
export function encryptCredential(input: { providerId: ByokProviderId; model: string; apiKey: string; binding: ByokBinding; now?: number }) { getByokProvider(input.providerId); const exp = (input.now ?? Date.now()) + ttlSeconds()*1000; const payload = payloadSchema.parse({ v: 1, providerId: input.providerId, model: input.model, apiKey: input.apiKey, exp, binding: input.binding }); const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv); const ct = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]); const tag = cipher.getAuthTag(); return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ct.toString("base64url")}`; }
export function decryptCredential(value: string, binding: ByokBinding, now = Date.now()) { const parts = value.split("."); if (parts.length !== 4 || parts[0] !== "v1") throw new Error("invalid_byok_cookie"); const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(parts[1], "base64url")); decipher.setAuthTag(Buffer.from(parts[2], "base64url")); const raw = Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8"); const payload = payloadSchema.parse(JSON.parse(raw)); if (payload.exp <= now) throw new Error("byok_expired"); if (payload.binding.kind !== binding.kind || payload.binding.id !== binding.id) throw new Error("byok_binding_mismatch"); return payload; }
export async function setByokCookie(value: string) { (await cookies()).set(BYOK_COOKIE, value, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/api/ai", maxAge: ttlSeconds() }); }
export async function clearByokCookie() { (await cookies()).set(BYOK_COOKIE, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/api/ai", maxAge: 0 }); }
