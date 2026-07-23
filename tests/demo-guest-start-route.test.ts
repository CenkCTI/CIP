import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const verifyMock = vi.fn();
const createMock = vi.fn();
vi.mock("@/lib/ai/byok/guest", () => ({
  verifyTurnstile: verifyMock,
  createGuestSession: createMock,
}));

describe("/api/demo/guest/start", () => {
  beforeEach(() => {
    verifyMock.mockReset();
    createMock.mockReset();
    createMock.mockResolvedValue({ id: "guest-id", expiresAt: "2026-07-24T00:00:00.000Z" });
  });

  it("creates a guest session only after a verified Turnstile token", async () => {
    verifyMock.mockResolvedValue(true);
    const { POST } = await import("@/app/api/demo/guest/start/route");
    const req = new Request("https://example.com/api/demo/guest/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.44" }, body: JSON.stringify({ turnstileToken: "real-widget-token" }) });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ started: true, expiresAt: "2026-07-24T00:00:00.000Z" });
    expect(verifyMock).toHaveBeenCalledWith("real-widget-token", "203.0.113.44");
    expect(createMock).toHaveBeenCalledWith("203.0.113.44");
    expect(JSON.stringify(json)).not.toContain("real-widget-token");
  });

  it("does not create a session when Turnstile verification fails", async () => {
    verifyMock.mockRejectedValue(new Error("turnstile_rejected"));
    const { POST } = await import("@/app/api/demo/guest/start/route");
    const req = new Request("https://example.com/api/demo/guest/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ turnstileToken: "bad-token" }) });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json).toMatchObject({ code: "turnstile_rejected" });
    expect(JSON.stringify(json)).not.toContain("bad-token");
    expect(createMock).not.toHaveBeenCalled();
  });
});
