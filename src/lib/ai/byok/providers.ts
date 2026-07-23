import "server-only";
import { z } from "zod";
export const byokProviderIds = ["openai", "openrouter", "groq"] as const;
export type ByokProviderId = (typeof byokProviderIds)[number];
export type ByokProvider = { id: ByokProviderId; displayName: string; baseUrl: string; modelsPath: string; chatPath: string; timeoutMs: number; headers: Record<string,string>; supportsJsonObject: boolean; supportsModels: boolean; disableFallback?: Record<string, unknown> };
export const modelIdSchema = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:/+-]+$/).refine((v) => !v.includes("://") && !v.includes("//"), "Model ID must not be a URL.");
export const apiKeySchema = z.string().trim().min(8).max(4096);
export const byokProviders: Record<ByokProviderId, ByokProvider> = {
  openai: { id: "openai", displayName: "OpenAI", baseUrl: "https://api.openai.com/v1", modelsPath: "/models", chatPath: "/chat/completions", timeoutMs: 60000, headers: {}, supportsJsonObject: true, supportsModels: true },
  openrouter: { id: "openrouter", displayName: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", modelsPath: "/models", chatPath: "/chat/completions", timeoutMs: 60000, headers: { "HTTP-Referer": "https://cyber-research-os.example", "X-Title": "Cyber Research OS BYOK" }, supportsJsonObject: true, supportsModels: true, disableFallback: { provider: { allow_fallbacks: false } } },
  groq: { id: "groq", displayName: "Groq", baseUrl: "https://api.groq.com/openai/v1", modelsPath: "/models", chatPath: "/chat/completions", timeoutMs: 60000, headers: {}, supportsJsonObject: true, supportsModels: true },
};
export function getByokProvider(id: string) { if (!byokProviderIds.includes(id as ByokProviderId)) throw new Error("unsupported_provider"); return byokProviders[id as ByokProviderId]; }
export function fixedProviderUrl(provider: ByokProvider, path: string) { const url = new URL(provider.baseUrl); if (url.protocol !== "https:" || url.username || url.password) throw new Error("invalid_provider_registry"); return `${url.origin}${url.pathname.replace(/\/$/, "")}${path}`; }
export function publicProviderList() { return byokProviderIds.map((id) => ({ id, displayName: byokProviders[id].displayName, supportsModels: byokProviders[id].supportsModels })); }
export function parseModelList(providerId: ByokProviderId, body: unknown) { const arr = Array.isArray((body as { data?: unknown[] })?.data) ? (body as { data: unknown[] }).data : []; return arr.map((x) => String((x as { id?: unknown }).id ?? "")).filter((id) => modelIdSchema.safeParse(id).success).slice(0, 100).map((id) => ({ id, label: id, providerId })); }
