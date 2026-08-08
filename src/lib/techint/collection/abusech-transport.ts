import "server-only";

import { CollectionError } from "./errors";

const MALWAREBAZAAR_URL = new URL("https://mb-api.abuse.ch/api/v1/");
const ALLOWED_MALWAREBAZAAR_QUERIES = new Set(["get_recent"]);

function contentTypeIsJson(value: string) {
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return mediaType === "application/json" || mediaType.endsWith("+json") || mediaType === "text/json";
}

export async function fetchMalwareBazaarMetadata(input: {
  credential: string;
  selector: "time" | "100";
  fetchImpl?: typeof fetch;
}) {
  const credential = input.credential.trim();
  if (!credential || credential.length > 1000 || /[\r\n]/.test(credential)) {
    throw new CollectionError("SOURCE_NOT_AVAILABLE", "The MalwareBazaar server credential is unavailable.");
  }
  const query = "get_recent";
  if (!ALLOWED_MALWAREBAZAAR_QUERIES.has(query)) {
    throw new CollectionError("SOURCE_NOT_AVAILABLE", "The MalwareBazaar query is not allowlisted.");
  }
  const body = new URLSearchParams({ query, selector: input.selector }).toString();
  if (Buffer.byteLength(body) > 256) throw new CollectionError("COLLECTION_FAILED", "The MalwareBazaar request exceeded its bound.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await (input.fetchImpl ?? fetch)(MALWAREBAZAAR_URL, {
      method: "POST",
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "CITEM-TechINT/1.0 (+fixed-read-only-source-collector)",
        "Auth-Key": credential,
      },
      body,
    });
    if (response.status >= 300 && response.status < 400) throw new CollectionError("HTTP_STATUS", "Source redirects are not permitted.");
    if (response.status === 429) throw new CollectionError("RATE_LIMITED", "The source rate limit was reached.");
    if (response.status === 401 || response.status === 403) throw new CollectionError("SOURCE_NOT_AVAILABLE", "The MalwareBazaar server credential was rejected.");
    if (!response.ok) throw new CollectionError("HTTP_STATUS", `The source returned HTTP ${response.status}.`);
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentTypeIsJson(contentType)) throw new CollectionError("HTTP_CONTENT_TYPE", "The source did not return JSON.");
    const declared = response.headers.get("content-length");
    const maxBytes = 8 * 1024 * 1024;
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
      throw new CollectionError("HTTP_BODY_TOO_LARGE", "The source response exceeded the configured limit.");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new CollectionError("HTTP_BODY_TOO_LARGE", "The source response exceeded the configured limit.");
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return JSON.parse(text) as unknown;
    } catch {
      throw new CollectionError("INVALID_SOURCE_RESPONSE", "The source returned malformed JSON.");
    }
  } catch (error) {
    if (error instanceof CollectionError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new CollectionError("HTTP_TIMEOUT", "The source request timed out.");
    throw new CollectionError("HTTP_STATUS", "The fixed source could not be reached.");
  } finally {
    clearTimeout(timer);
  }
}
