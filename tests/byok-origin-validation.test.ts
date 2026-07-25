import { beforeEach, describe, expect, it, vi } from "vitest";

import { validateOrigin } from "@/lib/ai/byok/security";

function request(headers: Record<string, string>) {
  return new Request("https://preview.example/api/ai/byok/connect", {
    method: "POST",
    headers,
  });
}

describe("BYOK origin validation", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the active Vercel preview host even when NEXT_PUBLIC_SITE_URL points elsewhere", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://cip-omega.vercel.app");

    expect(() =>
      validateOrigin(
        request({
          origin: "https://preview.example",
          host: "internal.example",
          "x-forwarded-host": "preview.example",
          "x-forwarded-proto": "https",
          "sec-fetch-site": "same-origin",
        }),
      ),
    ).not.toThrow();
  });

  it("accepts an exact same-origin request using the Host header", () => {
    expect(() =>
      validateOrigin(
        request({
          origin: "https://preview.example",
          host: "preview.example",
          "x-forwarded-proto": "https",
        }),
      ),
    ).not.toThrow();
  });

  it("rejects an origin that matches neither the request host nor configured site", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://cip-omega.vercel.app");

    expect(() =>
      validateOrigin(
        request({
          origin: "https://attacker.example",
          host: "preview.example",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toThrow("bad_origin");
  });

  it("rejects browser requests explicitly marked cross-site", () => {
    expect(() =>
      validateOrigin(
        request({
          origin: "https://preview.example",
          host: "preview.example",
          "x-forwarded-proto": "https",
          "sec-fetch-site": "cross-site",
        }),
      ),
    ).toThrow("bad_origin");
  });

  it("rejects malformed origins", () => {
    expect(() =>
      validateOrigin(
        request({
          origin: "not-an-origin",
          host: "preview.example",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toThrow("bad_origin");
  });
});
