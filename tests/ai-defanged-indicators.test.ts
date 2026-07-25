import { describe, expect, it } from "vitest";
import { validateExtractedIndicator } from "@/lib/ai/pure";

describe("defanged IOC normalization for AI extracted indicators", () => {
  it("preserves observed domain text and validates a separate canonical value", () => {
    const result = validateExtractedIndicator({ type: "DOMAIN", value: "update-check[.]example" });
    expect(result).toMatchObject({ observed: "update-check[.]example", normalized: "update-check.example", valid: true, defanged: true });
  });

  it("normalizes hxxps URLs while preserving scheme, host, port, path, and query", () => {
    const result = validateExtractedIndicator({ type: "URL", value: "hxxps://update-check[.]example:8443/payload.dll?a=1&b=two" });
    expect(result).toMatchObject({ observed: "hxxps://update-check[.]example:8443/payload.dll?a=1&b=two", normalized: "https://update-check.example:8443/payload.dll?a=1&b=two", valid: true, defanged: true });
  });

  it("is idempotent for already canonical indicators", () => {
    const once = validateExtractedIndicator({ type: "URL", value: "https://update-check.example/payload.dll" });
    const twice = validateExtractedIndicator({ type: "URL", value: once.normalized });
    expect(once.normalized).toBe("https://update-check.example/payload.dll");
    expect(twice.normalized).toBe(once.normalized);
    expect(twice.valid).toBe(true);
  });

  it("fails closed for malformed defanged domains and URLs", () => {
    expect(validateExtractedIndicator({ type: "DOMAIN", value: "bad[.]" }).valid).toBe(false);
    expect(validateExtractedIndicator({ type: "URL", value: "hxxps://bad[.]/payload.dll" }).valid).toBe(false);
  });

  it("does not aggressively extract indicators from prose or behavior descriptions", () => {
    const prose = validateExtractedIndicator({ type: "DOMAIN", value: "WINWORD -> PowerShell then update-check[.]example" });
    expect(prose.valid).toBe(false);
    expect(prose.normalized).toContain("WINWORD");
  });

  it("does not expose or salvage embedded secrets as valid indicators", () => {
    const result = validateExtractedIndicator({ type: "DOMAIN", value: "sk-live-secret update-check[.]example" });
    expect(result.valid).toBe(false);
    expect(JSON.stringify(result)).not.toContain("update-check.example\",\"valid\":true");
  });
});
