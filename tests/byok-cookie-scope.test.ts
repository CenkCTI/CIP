import { vi } from "vitest";
vi.mock("server-only", () => ({}));
const setMock = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ set: setMock, get: vi.fn() }) }));
import { beforeEach, describe, expect, it } from "vitest";
import { BYOK_COOKIE, BYOK_COOKIE_PATH, LEGACY_BYOK_COOKIE_PATH, byokCookieOptions, clearByokCookie, setByokCookie } from "@/lib/ai/byok/vault";

describe("BYOK cookie route scope", () => {
  beforeEach(() => setMock.mockClear());
  it("uses /api for the current encrypted BYOK cookie", () => {
    expect(byokCookieOptions(123).path).toBe("/api");
    expect(BYOK_COOKIE_PATH).toBe("/api");
  });
  it("expires the legacy /api/ai cookie during reconnect and sets the current /api cookie", async () => {
    await setByokCookie("encrypted-value");
    expect(setMock).toHaveBeenNthCalledWith(1, BYOK_COOKIE, "", expect.objectContaining({ path: LEGACY_BYOK_COOKIE_PATH, maxAge: 0, httpOnly: true, sameSite: "strict" }));
    expect(setMock).toHaveBeenNthCalledWith(2, BYOK_COOKIE, "encrypted-value", expect.objectContaining({ path: BYOK_COOKIE_PATH, httpOnly: true, sameSite: "strict" }));
  });
  it("disconnect clears both current and legacy cookie paths", async () => {
    await clearByokCookie();
    expect(setMock).toHaveBeenCalledWith(BYOK_COOKIE, "", expect.objectContaining({ path: BYOK_COOKIE_PATH, maxAge: 0 }));
    expect(setMock).toHaveBeenCalledWith(BYOK_COOKIE, "", expect.objectContaining({ path: LEGACY_BYOK_COOKIE_PATH, maxAge: 0 }));
  });
});
