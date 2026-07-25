import "server-only";
import { z } from "zod";
export const byokProviderIds = ["openai", "openrouter", "groq", "nvidia_nim"] as const;
export type ByokProviderId = (typeof byokProviderIds)[number];
export type ByokProvider = { id: ByokProviderId; displayName: string; baseUrl: string; modelsPath: string; chatPath: string; timeoutMs: number; headers: Record<string,string>; supportsJsonObject: boolean; supportsModels: boolean; disableFallback?: Record<string, unknown>; modelAllowlist?: readonly string[] };
export const modelIdSchema = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:/+-]+$/).refine((v) => !v.includes("://") && !v.includes("//"), "Model ID must not be a URL.");
export const apiKeySchema = z.string().trim().min(8).max(4096);
export const nvidiaNimModelAllowlist = ["nvidia/nemotron-3-super-120b-a12b", "nvidia/nemotron-3-nano-30b-a3b", "nvidia/nemotron-3-ultra-550b-a55b", "nvidia/llama-3.1-nemotron-nano-8b-v1", "nvidia/llama-3.3-nemotron-super-49b-v1.5", "openai/gpt-oss-120b", "qwen/qwen3-coder-480b-a35b-instruct", "qwen/qwen3-next-80b-a3b-instruct", "moonshotai/kimi-k2-instruct"] as const;
export const byokProviders: Record<ByokProviderId, ByokProvider> = {
  openai: { id: "openai", displayName: "OpenAI", baseUrl: "https://api.openai.com/v1", modelsPath: "/models", chatPath: "/chat/completions", timeoutMs: 60000, headers: {}, supportsJsonObject: true, supportsModels: true },
  openrouter: { id: "openrouter", displayName: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", modelsPath: "/models", chatPath: "/chat/completions", timeoutMs: 60000, headers: { "HTTP-Referer": "https://cyber-research-os.example", "X-Title": "Cyber Research OS BYOK" }, supportsJsonObject: true, supportsModels: true, disableFallback: { provider: { allow_fallbacks: false } } },
  groq: { id: "groq", displayName: "Groq", baseUrl: "https://api.groq.com/openai/v1", modelsPath: "/models", chatPath: "/chat/completions", timeoutMs: 60000, headers: {}, supportsJsonObject: true, supportsModels: true },
  nvidia_nim: { id: "nvidia_nim", displayName: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1", modelsPath: "/models", chatPath: "/chat/completions", timeoutMs: 90000, headers: {}, supportsJsonObject: false, supportsModels: false, modelAllowlist: nvidiaNimModelAllowlist },
};
export function getByokProvider(id: string) { if (!byokProviderIds.includes(id as ByokProviderId)) throw new Error("unsupported_provider"); return byokProviders[id as ByokProviderId]; }
export function fixedProviderUrl(provider: ByokProvider, path: string) { const url = new URL(provider.baseUrl); if (url.protocol !== "https:" || url.username || url.password) throw new Error("invalid_provider_registry"); return `${url.origin}${url.pathname.replace(/\/$/, "")}${path}`; }
export function publicProviderList() { return byokProviderIds.map((id) => ({ id, displayName: byokProviders[id].displayName, supportsModels: byokProviders[id].supportsModels, modelAllowlist: byokProviders[id].modelAllowlist ?? [] })); }
export function validateProviderModel(providerId: ByokProviderId, model: string) { const parsed = modelIdSchema.safeParse(model); if (!parsed.success) return false; const allowlist = byokProviders[providerId].modelAllowlist; return !allowlist || allowlist.includes(parsed.data); }
export function parseModelList(providerId: ByokProviderId, body: unknown) { const arr = Array.isArray((body as { data?: unknown[] })?.data) ? (body as { data: unknown[] }).data : []; return arr.map((x) => String((x as { id?: unknown }).id ?? "")).filter((id) => modelIdSchema.safeParse(id).success).slice(0, 100).map((id) => ({ id, label: id, providerId })); }
