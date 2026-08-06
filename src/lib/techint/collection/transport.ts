import "server-only";

import { CollectionError } from "./errors";

type JsonRequest = {
  url: URL;
  allowedHost: string;
  allowedPath: string;
  maxBytes: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
};

export type BoundedJsonResponse = {
  status: number;
  json: unknown | null;
  etag?: string;
  lastModified?: string;
};

export async function fetchBoundedJson(input: JsonRequest): Promise<BoundedJsonResponse> {
  if (input.url.protocol !== "https:" || input.url.hostname !== input.allowedHost || input.url.pathname !== input.allowedPath) {
    throw new CollectionError("SOURCE_NOT_AVAILABLE", "The source endpoint is not in the fixed adapter allowlist.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 15000);
  try {
    const response = await (input.fetchImpl ?? fetch)(input.url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "CITEM-TechINT/1.0 (+fixed-read-only-source-collector)",
        ...input.headers,
      },
    });
    if (response.status >= 300 && response.status < 400) {
      throw new CollectionError("HTTP_STATUS", "Source redirects are not permitted.");
    }
    if (response.status === 429) throw new CollectionError("RATE_LIMITED", "The source rate limit was reached.");
    if (response.status === 304) {
      return {
        status: 304,
        json: null,
        etag: response.headers.get("etag") ?? undefined,
        lastModified: response.headers.get("last-modified") ?? undefined,
      };
    }
    if (!response.ok) throw new CollectionError("HTTP_STATUS", `The source returned HTTP ${response.status}.`);
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("json")) throw new CollectionError("HTTP_CONTENT_TYPE", "The source did not return JSON.");
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > input.maxBytes) throw new CollectionError("HTTP_BODY_TOO_LARGE", "The source response exceeded the configured limit.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > input.maxBytes) throw new CollectionError("HTTP_BODY_TOO_LARGE", "The source response exceeded the configured limit.");
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new CollectionError("INVALID_SOURCE_RESPONSE", "The source returned malformed JSON.");
    }
    return {
      status: response.status,
      json,
      etag: response.headers.get("etag") ?? undefined,
      lastModified: response.headers.get("last-modified") ?? undefined,
    };
  } catch (error) {
    if (error instanceof CollectionError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new CollectionError("HTTP_TIMEOUT", "The source request timed out.");
    }
    throw new CollectionError("HTTP_STATUS", "The fixed source could not be reached.");
  } finally {
    clearTimeout(timer);
  }
}
