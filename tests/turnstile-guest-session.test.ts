import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "@/lib/ai/byok/guest";
import { safeAiErrorMessage } from "@/lib/ai/byok/errors";

function formValue(body: unknown, key: string) {
  return body instanceof FormData ? body.get(key) : null;
}

describe("Turnstile guest session verification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("TURNSTILE_SECRET_KEY", "server-secret");
  });

  it("submits real widget tokens to Cloudflare siteverify without exposing the secret", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ success: true }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyTurnstile("widget-token", "203.0.113.10")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://challenges.cloudflare.com/turnstile/v0/siteverify", expect.objectContaining({ method: "POST", cache: "no-store" }));
    const body = fetchMock.mock.calls[0][1].body;
    expect(formValue(body, "response")).toBe("widget-token");
    expect(formValue(body, "remoteip")).toBe("203.0.113.10");
    expect(JSON.stringify(await fetchMock.mock.results[0].value)).not.toContain("server-secret");
  });

  it("fails safely for missing, invalid, expired/reused, and unreachable verification", async () => {
    await expect(verifyTurnstile("")).rejects.toThrow("turnstile_missing");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ json: async () => ({ success: false, "error-codes": ["invalid-input-response"], detail: "raw provider detail" }) }));
    await expect(verifyTurnstile("bad-token")).rejects.toThrow("turnstile_rejected");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ json: async () => ({ success: false, "error-codes": ["timeout-or-duplicate"] }) }));
    await expect(verifyTurnstile("used-token")).rejects.toThrow("turnstile_expired");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("network includes raw body")));
    await expect(verifyTurnstile("network-token")).rejects.toThrow("turnstile_unavailable");
    expect(safeAiErrorMessage("turnstile_rejected")).not.toContain("raw provider detail");
  });

  it("fails closed in production when configuration is missing and rejects the dev bypass", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    await expect(verifyTurnstile("widget-token")).rejects.toThrow("turnstile_unavailable");
    await expect(verifyTurnstile("CIP_DEV_TURNSTILE_BYPASS")).rejects.toThrow("turnstile_rejected");
  });

  it("allows the explicit development bypass only outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("TURNSTILE_DEV_BYPASS", "true");
    await expect(verifyTurnstile("CIP_DEV_TURNSTILE_BYPASS")).resolves.toBe(true);
  });
});
