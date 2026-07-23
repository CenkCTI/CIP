import { z } from "zod";

export const aiWorkflows = ["summarize_research","extract_indicators","extract_entities","suggest_mitre_mapping","generate_report_draft","translate_document"] as const;
export type AiWorkflow = (typeof aiWorkflows)[number];
export type AiStatusKind = "disabled" | "configuration_required" | "reachable" | "unreachable" | "error";
export type AiSafeStatus = { status: AiStatusKind; enabled: boolean; configured: boolean; provider: "ollama"; model?: string; message: string };

const bool = (v: string | undefined) => v?.toLowerCase() === "true";
const intEnv = (name: string, fallback: number, min: number, max: number) => {
  const n = Number(process.env[name] ?? fallback);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};
export function getAiConfig() {
  return {
    enabled: bool(process.env.AI_ENABLED),
    provider: process.env.AI_PROVIDER || "ollama",
    baseUrl: process.env.AI_BASE_URL || "http://127.0.0.1:11434/v1",
    model: process.env.AI_MODEL || "",
    apiKey: process.env.AI_API_KEY || "",
    timeoutMs: intEnv("AI_REQUEST_TIMEOUT_MS", 120000, 1000, 180000),
    maxInputChars: intEnv("AI_MAX_INPUT_CHARS", 60000, 1000, 200000),
    maxOutputTokens: intEnv("AI_MAX_OUTPUT_TOKENS", 4096, 256, 8192),
    rateLimitRequests: intEnv("AI_RATE_LIMIT_REQUESTS", 10, 1, 100),
    rateLimitInputChars: intEnv("AI_RATE_LIMIT_INPUT_CHARS", 200000, 1000, 1000000),
    rateLimitWindowMinutes: intEnv("AI_RATE_LIMIT_WINDOW_MINUTES", 60, 1, 1440),
  };
}
const privateHosts = [/^127\./, /^10\./, /^192\.168\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[0-1])\./];
function isLoopback(host: string) { return host === "localhost" || host === "::1" || host === "[::1]" || host.startsWith("127."); }
export function validateAiEndpoint(baseUrl: string, nodeEnv = process.env.NODE_ENV) {
  let url: URL;
  try { url = new URL(baseUrl); } catch { return { ok: false as const, reason: "AI_BASE_URL is malformed." }; }
  if (url.username || url.password) return { ok: false as const, reason: "AI_BASE_URL must not contain credentials." };
  if (!url.pathname.endsWith("/v1")) return { ok: false as const, reason: "AI_BASE_URL must point to an OpenAI-compatible /v1 endpoint." };
  const host = url.hostname;
  if (url.protocol === "http:") {
    if (nodeEnv === "production") return { ok: false as const, reason: "Production AI endpoints must use HTTPS." };
    if (!isLoopback(host)) return { ok: false as const, reason: "Plain HTTP is allowed only for local loopback development." };
  } else if (url.protocol !== "https:") return { ok: false as const, reason: "AI_BASE_URL must use http or https." };
  if (nodeEnv === "production" && (isLoopback(host) || privateHosts.some((r) => r.test(host)))) return { ok: false as const, reason: "Production AI endpoint is not reachable from Vercel when it is local/private." };
  return { ok: true as const, url };
}
export function getAiSafeStatus(config = getAiConfig()): AiSafeStatus {
  if (!config.enabled) return { status: "disabled", enabled: false, configured: false, provider: "ollama", message: "AI is disabled." };
  if (config.provider !== "ollama") return { status: "configuration_required", enabled: true, configured: false, provider: "ollama", message: "AI_PROVIDER must be ollama for Phase 6." };
  if (!config.model) return { status: "configuration_required", enabled: true, configured: false, provider: "ollama", message: "AI_MODEL must match an installed local Ollama model." };
  const endpoint = validateAiEndpoint(config.baseUrl);
  if (!endpoint.ok) return { status: "configuration_required", enabled: true, configured: false, provider: "ollama", model: config.model, message: endpoint.reason };
  return { status: "unreachable", enabled: true, configured: true, provider: "ollama", model: config.model, message: "Provider has not been checked yet." };
}
export const aiWorkflowSchema = z.enum(aiWorkflows);
