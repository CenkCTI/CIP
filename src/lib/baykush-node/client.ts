import "server-only";
import type { z } from "zod";
import { nodeConfig } from "./config";
import { NodeClientError, safeRetryAfter } from "./errors";

const RETRY_STATUS = new Set([502, 503, 504]);

export async function nodeGet<T>(path: string, schema: z.ZodType<T>, options: { revalidate?: number; fetchImpl?: typeof fetch } = {}): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//")) throw new NodeClientError("INVALID_REQUEST", "Node request path is invalid.");
  let config;
  try { config = nodeConfig(); } catch { throw new NodeClientError("NOT_CONFIGURED", "BAYKUSH Intelligence Node is not configured."); }
  const fetchImpl = options.fetchImpl ?? fetch;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchImpl(`${config.baseUrl}${path}`, {
        method: "GET",
        headers: { authorization: `Bearer ${config.token}`, "x-baykush-client": "CITEM", accept: "application/json" },
        signal: controller.signal,
        next: { revalidate: options.revalidate ?? 60 },
      });
      if (RETRY_STATUS.has(response.status) && attempt === 0) continue;
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        const remote = json && typeof json === "object" && "error" in json ? (json as { error?: { code?: string } }).error?.code : null;
        if (response.status === 401) throw new NodeClientError("UNAUTHORIZED", "Node authentication failed.", 401);
        if (response.status === 403) throw new NodeClientError("FORBIDDEN", "Node credential lacks the required read scope.", 403);
        if (response.status === 429) throw new NodeClientError("RATE_LIMITED", "Node request rate limit was reached.", 429, safeRetryAfter(response.headers.get("retry-after")));
        if (response.status === 400) throw new NodeClientError("INVALID_REQUEST", `Node rejected the bounded request (${remote ?? "INVALID_REQUEST"}).`, 400);
        if (response.status === 404) throw new NodeClientError("NOT_FOUND", "Node resource was not found.", 404);
        throw new NodeClientError("REMOTE_ERROR", "Node returned a controlled service error.", response.status);
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success) throw new NodeClientError("INVALID_RESPONSE", "Node returned an invalid v1 response.");
      return parsed.data;
    } catch (error) {
      if (error instanceof NodeClientError) throw error;
      if (attempt === 1) throw new NodeClientError("UNAVAILABLE", "BAYKUSH Intelligence Node is unavailable.");
    } finally { clearTimeout(timer); }
  }
  throw new NodeClientError("UNAVAILABLE", "BAYKUSH Intelligence Node is unavailable.");
}
