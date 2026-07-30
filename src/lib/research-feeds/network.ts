import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import ipaddr from "ipaddr.js";
import { Agent, request } from "undici";

import { FeedError } from "./errors";
import { normalizeFeedUrl } from "./url";

export const NETWORK_LIMITS = {
  connectMs: 3_000,
  headersMs: 5_000,
  totalMs: 10_000,
  maxCompressedBytes: 5 * 1024 * 1024,
  maxBytes: 5 * 1024 * 1024,
  maxRedirects: 3,
} as const;

export type Address = { address: string; family: number };
export type Resolver = (host: string, signal: AbortSignal) => Promise<Address[]>;
export type TransportResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array> & { destroy?: () => void };
  cleanup?: () => void | Promise<void>;
};
export type Transport = (
  url: URL,
  address: Address,
  headers: Record<string, string>,
  signal: AbortSignal,
) => Promise<TransportResponse>;

export function isPublicAddress(value: string) {
  try {
    return ipaddr.process(value).range() === "unicast";
  } catch {
    return false;
  }
}

function abortError(code: "DNS_FAILED" | "REQUEST_TIMEOUT", signal: AbortSignal) {
  return signal.aborted ? new FeedError("REQUEST_TIMEOUT") : new FeedError(code);
}

export async function resolvePublic(
  host: string,
  signal: AbortSignal,
  resolver: Resolver = (hostname) => dnsLookup(hostname, { all: true }),
) {
  let answers: Address[];
  try {
    answers = await Promise.race([
      resolver(host, signal),
      new Promise<never>((_, reject) =>
        signal.addEventListener("abort", () => reject(new FeedError("REQUEST_TIMEOUT")), { once: true }),
      ),
    ]);
  } catch {
    throw abortError("DNS_FAILED", signal);
  }
  if (!answers.length || answers.some(({ address }) => !isPublicAddress(address))) {
    throw new FeedError("DNS_BLOCKED");
  }
  return answers[0]!;
}

const pinnedTransport: Transport = async (url, address, headers, signal) => {
  const dispatcher = new Agent({
    connect: {
      timeout: NETWORK_LIMITS.connectMs,
      servername: url.hostname,
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
    },
  });
  try {
    const response = await request(url, {
      dispatcher,
      method: "GET",
      headers,
      signal,
      headersTimeout: NETWORK_LIMITS.headersMs,
    });
    return {
      status: response.statusCode,
      headers: response.headers,
      body: response.body,
      cleanup: async () => {
        response.body.destroy();
        await dispatcher.close();
      },
    };
  } catch (error) {
    await dispatcher.close();
    throw error;
  }
};

function byteLimiter(max: number, code: "RESPONSE_TOO_LARGE") {
  let bytes = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.byteLength;
      callback(bytes > max ? new FeedError(code) : null, chunk);
    },
  });
}

function decoder(encoding: string) {
  if (!encoding || encoding === "identity") return null;
  if (encoding === "gzip") return createGunzip();
  if (encoding === "deflate") return createInflate();
  if (encoding === "br") return createBrotliDecompress();
  throw new FeedError("CONTENT_TYPE_REJECTED", "The response uses an unsupported content encoding.");
}

async function readBounded(response: TransportResponse) {
  const rawEncoding = String(response.headers["content-encoding"] ?? "").trim().toLowerCase();
  if (rawEncoding.includes(",")) throw new FeedError("CONTENT_TYPE_REJECTED");
  const chunks: Buffer[] = [];
  const sink = new Writable({ write(chunk: Buffer, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
  try {
    const source = Readable.from(response.body);
    const compressedLimit = byteLimiter(NETWORK_LIMITS.maxCompressedBytes, "RESPONSE_TOO_LARGE");
    const decodedLimit = byteLimiter(NETWORK_LIMITS.maxBytes, "RESPONSE_TOO_LARGE");
    const decoded = decoder(rawEncoding);
    if (decoded) await pipeline(source, compressedLimit, decoded, decodedLimit, sink);
    else await pipeline(source, compressedLimit, decodedLimit, sink);
  } catch (error) {
    if (error instanceof FeedError) throw error;
    throw new FeedError("CONTENT_TYPE_REJECTED", "The compressed feed response is invalid.");
  }
  return Buffer.concat(chunks);
}

function controlledHeaders(
  current: URL,
  configuredOrigin: string,
  conditional: { etag?: string | null; lastModified?: string | null },
) {
  const headers: Record<string, string> = {
    "user-agent": "CITEM-Research-Feed/1.0",
    accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/plain;q=0.2",
    "accept-encoding": "gzip, deflate, br",
  };
  // Conditional validators belong only to the configured origin. Cross-origin redirects never receive them.
  if (current.origin === configuredOrigin) {
    if (conditional.etag && conditional.etag.length <= 512 && !/[\r\n]/.test(conditional.etag)) {
      headers["if-none-match"] = conditional.etag;
    }
    if (conditional.lastModified && conditional.lastModified.length <= 128 && !/[\r\n]/.test(conditional.lastModified)) {
      headers["if-modified-since"] = conditional.lastModified;
    }
  }
  return headers;
}

export async function fetchFeed(
  storedUrl: string,
  conditional: { etag?: string | null; lastModified?: string | null } = {},
  dependencies: { resolver?: Resolver; transport?: Transport; totalMs?: number } = {},
) {
  let current = normalizeFeedUrl(storedUrl);
  const configuredOrigin = current.origin;
  const visited = new Set<string>();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), dependencies.totalMs ?? NETWORK_LIMITS.totalMs);
  try {
    for (let redirects = 0; ; redirects += 1) {
      if (visited.has(current.href)) throw new FeedError("REDIRECT_BLOCKED");
      visited.add(current.href);
      const address = await resolvePublic(current.hostname, controller.signal, dependencies.resolver);
      let response: TransportResponse | undefined;
      try {
        response = await (dependencies.transport ?? pinnedTransport)(
          current,
          address,
          controlledHeaders(current, configuredOrigin, conditional),
          controller.signal,
        );
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          response.body.destroy?.();
          if (redirects >= NETWORK_LIMITS.maxRedirects) throw new FeedError("TOO_MANY_REDIRECTS");
          let next: URL;
          try {
            next = normalizeFeedUrl(new URL(String(response.headers.location ?? ""), current).toString());
          } catch {
            throw new FeedError("REDIRECT_BLOCKED");
          }
          if (current.protocol === "https:" && next.protocol === "http:") throw new FeedError("REDIRECT_BLOCKED");
          current = next;
          continue;
        }
        if (response.status === 304) {
          response.body.destroy?.();
          return { status: 304 as const, finalUrl: current.toString(), bytes: 0, body: "", headers: response.headers };
        }
        if (response.status !== 200) throw new FeedError("HTTP_ERROR");
        const contentType = String(response.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
        if (!["application/rss+xml", "application/atom+xml", "application/xml", "text/xml", "text/plain"].includes(contentType)) {
          throw new FeedError("CONTENT_TYPE_REJECTED");
        }
        const contentLength = Number(response.headers["content-length"] ?? 0);
        if (contentLength > NETWORK_LIMITS.maxCompressedBytes) throw new FeedError("RESPONSE_TOO_LARGE");
        const buffer = await readBounded(response);
        const body = buffer.toString("utf8");
        if (!body.trim()) throw new FeedError("EMPTY_RESPONSE");
        if (contentType === "text/plain" && !body.trimStart().startsWith("<")) throw new FeedError("CONTENT_TYPE_REJECTED");
        return { status: 200 as const, finalUrl: current.toString(), bytes: buffer.byteLength, body, headers: response.headers };
      } catch (error) {
        if (controller.signal.aborted) throw new FeedError("REQUEST_TIMEOUT");
        if (error instanceof FeedError) throw error;
        throw new FeedError("INTERNAL_ERROR");
      } finally {
        response?.body.destroy?.();
        await response?.cleanup?.();
      }
    }
  } finally {
    clearTimeout(timer);
  }
}
