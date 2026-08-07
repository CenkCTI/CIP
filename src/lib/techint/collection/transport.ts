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

const ALLOWED_ADAPTER_HEADERS = new Set(["if-none-match", "if-modified-since", "apikey"]);

function requestHeaders(values: Record<string, string> | undefined) {
  const headers = new Headers({
    accept: "application/json",
    "user-agent": "CITEM-TechINT/1.0 (+fixed-read-only-source-collector)",
  });
  for (const [name, value] of Object.entries(values ?? {})) {
    const normalizedName = name.toLowerCase();
    if (!ALLOWED_ADAPTER_HEADERS.has(normalizedName) || /[\r\n]/.test(value)) {
      throw new CollectionError("SOURCE_NOT_AVAILABLE", "The adapter requested a forbidden HTTP header.");
    }
    headers.set(name, value);
  }
  return headers;
}

function contentTypeIsJson(value: string) {
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

export async function fetchBoundedJson(input: JsonRequest): Promise<BoundedJsonResponse> {
  if (
    input.url.protocol !== "https:" ||
    input.url.hostname !== input.allowedHost ||
    input.url.pathname !== input.allowedPath ||
    input.url.username ||
    input.url.password
  ) {
    throw new CollectionError("SOURCE_NOT_AVAILABLE", "The source endpoint is not in the fixed adapter allowlist.");
  }
  if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes < 1) {
    throw new CollectionError("COLLECTION_FAILED", "The adapter response limit is invalid.");
  }

  const headers = requestHeaders(input.headers);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 15000);
  try {
    const response = await (input.fetchImpl ?? fetch)(input.url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers,
    });

    if (response.status === 304) {
      return {
        status: 304,
        json: null,
        etag: response.headers.get("etag") ?? undefined,
        lastModified: response.headers.get("last-modified") ?? undefined,
      };
    }
    if (response.status >= 300 && response.status < 400) {
      throw new CollectionError("HTTP_STATUS", "Source redirects are not permitted.");
    }
    if (response.status === 429) throw new CollectionError("RATE_LIMITED", "The source rate limit was reached.");
    if (!response.ok) throw new CollectionError("HTTP_STATUS", `The source returned HTTP ${response.status}.`);

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentTypeIsJson(contentType)) {
      throw new CollectionError("HTTP_CONTENT_TYPE", "The source did not return JSON.");
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength !== null) {
      if (!/^\d+$/.test(contentLength)) {
        throw new CollectionError("INVALID_SOURCE_RESPONSE", "The source returned an invalid Content-Length header.");
      }
      if (Number(contentLength) > input.maxBytes) {
        throw new CollectionError("HTTP_BODY_TOO_LARGE", "The source response exceeded the configured limit.");
      }
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > input.maxBytes) {
      throw new CollectionError("HTTP_BODY_TOO_LARGE", "The source response exceeded the configured limit.");
    }

    let json: unknown;
    try {
      const body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      json = JSON.parse(body);
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
    if (error instanceof Error && error.name === "AbortError") {
      throw new CollectionError("HTTP_TIMEOUT", "The source request timed out.");
    }
    throw new CollectionError("HTTP_STATUS", "The fixed source could not be reached.");
  } finally {
    clearTimeout(timer);
  }
}
