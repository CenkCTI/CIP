import "server-only";
import { z } from "zod";

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  BAYKUSH_NODE_BASE_URL: z.url(),
  BAYKUSH_NODE_API_TOKEN: z.string().min(32).max(4096),
  BAYKUSH_NODE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).optional(),
});

export function nodeConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = baseSchema.safeParse(env);
  if (!parsed.success) throw new Error("BAYKUSH_NODE_NOT_CONFIGURED");
  const production = parsed.data.NODE_ENV === "production";
  const url = new URL(parsed.data.BAYKUSH_NODE_BASE_URL);
  const localhost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  const notOrigin = Boolean(url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== ""));
  if (notOrigin || (production && (url.protocol !== "https:" || localhost || parsed.data.BAYKUSH_NODE_TIMEOUT_MS === undefined)) ||
      (!production && !["http:", "https:"].includes(url.protocol))) {
    throw new Error("BAYKUSH_NODE_NOT_CONFIGURED");
  }
  return {
    baseUrl: url.href.replace(/\/$/, ""),
    token: parsed.data.BAYKUSH_NODE_API_TOKEN,
    timeoutMs: parsed.data.BAYKUSH_NODE_TIMEOUT_MS ?? 9000,
  };
}
