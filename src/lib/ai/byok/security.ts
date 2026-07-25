import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { safeAiErrorCode, safeAiErrorMessage } from "./errors";

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function parseHttpOrigin(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function originFromHost(host: string, protocol: "http" | "https") {
  return parseHttpOrigin(`${protocol}://${host}`);
}

export function noStore(data: unknown, init: ResponseInit = {}) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function requireJson(req: Request) {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new Error("json_required");
  }
}

export function validateOrigin(req: Request) {
  if (req.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") {
    throw new Error("bad_origin");
  }

  const rawOrigin = req.headers.get("origin");
  if (!rawOrigin) return;

  const origin = parseHttpOrigin(rawOrigin);
  if (!origin) throw new Error("bad_origin");

  const forwardedProtocol = firstHeaderValue(req.headers.get("x-forwarded-proto"));
  const protocol: "http" | "https" =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : process.env.NODE_ENV === "production"
        ? "https"
        : "http";

  const allowedOrigins = new Set<string>();
  const requestHosts = [
    firstHeaderValue(req.headers.get("x-forwarded-host")),
    firstHeaderValue(req.headers.get("host")),
  ];

  for (const host of requestHosts) {
    if (!host) continue;
    const requestOrigin = originFromHost(host, protocol);
    if (requestOrigin) allowedOrigins.add(requestOrigin);
  }

  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL
    ? parseHttpOrigin(process.env.NEXT_PUBLIC_SITE_URL)
    : null;
  if (configuredOrigin) allowedOrigins.add(configuredOrigin);

  if (!allowedOrigins.has(origin)) throw new Error("bad_origin");
}

export async function readJsonLimited(req: Request, max = 65_536) {
  requireJson(req);
  const text = await req.text();
  if (text.length > max) throw new Error("body_too_large");
  return JSON.parse(text);
}

export function safeErr(error: unknown, status = 400) {
  const code = safeAiErrorCode(error);
  return noStore(
    { error: safeAiErrorMessage(code), code },
    {
      status: code.includes("rate")
        ? 429
        : code.startsWith("turnstile_")
          ? 403
          : status,
    },
  );
}

export function hmac(value: string, env = "GUEST_SESSION_HMAC_KEY") {
  const key =
    process.env[env] ||
    process.env.BYOK_COOKIE_ENCRYPTION_KEY ||
    "dev-only-unsafe";
  return crypto.createHmac("sha256", key).update(value).digest("hex");
}

export function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}
