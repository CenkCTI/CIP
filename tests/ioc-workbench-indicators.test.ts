import { describe, expect, it } from "vitest";

import {
  MAX_BULK_IOC_INPUT_CHARS,
  MAX_BULK_IOC_LINES,
  detectHashAlgorithm,
  detectIndicatorType,
  normalizeObservedIndicatorValue,
  parseBulkIndicatorInput,
  safeDefangIndicatorValue,
  validateIndicator,
  validateObservedIndicator,
} from "@/lib/cti/indicators";

describe("IOC Workbench type detection", () => {
  it.each([
    ["192.0.2.10", "IP"],
    ["2001:db8::10", "IP"],
    ["Example.COM", "DOMAIN"],
    ["secure-energy[.]example", "DOMAIN"],
    ["https://example.com/path", "URL"],
    ["hxxp://example[.]com/path", "URL"],
    ["hxxps://example[.]com/path", "URL"],
    ["44d88612fea8a8f36de82e1278abb02f", "HASH"],
    ["a".repeat(40), "HASH"],
    ["b".repeat(64), "HASH"],
    ["Analyst@Example.COM", "EMAIL"],
  ])("detects %s as %s", (value, type) => {
    expect(detectIndicatorType(value)).toBe(type);
  });

  it.each([
    "not an indicator",
    "999.999.999.999",
    "hxxps://bad[.]/path",
    "example",
  ])("does not accept malformed or ambiguous input: %s", (value) => {
    const parsed = parseBulkIndicatorInput(value).rows[0];
    expect(parsed.classification).toBe("INVALID");
  });

  it("keeps FILE and REGISTRY available to manual validation", () => {
    expect(validateIndicator("payload.dll", "FILE")).toBeNull();
    expect(validateIndicator("HKEY_LOCAL_MACHINE\\Software", "REGISTRY")).toBeNull();
  });
});

describe("IOC canonicalization and safe display", () => {
  it("lowercases domains, emails, and hashes", () => {
    expect(normalizeObservedIndicatorValue("Example.COM", "DOMAIN")).toBe(
      "example.com",
    );
    expect(normalizeObservedIndicatorValue("Analyst@Example.COM", "EMAIL")).toBe(
      "analyst@example.com",
    );
    expect(normalizeObservedIndicatorValue("A".repeat(32), "HASH")).toBe(
      "a".repeat(32),
    );
  });

  it("refangs conservative domain and URL forms without losing the observation", () => {
    const domain = validateObservedIndicator({
      type: "DOMAIN",
      value: "secure-energy[.]example",
    });
    expect(domain).toMatchObject({
      observed: "secure-energy[.]example",
      canonical: "secure-energy.example",
      valid: true,
      defangedValue: "secure-energy[.]example",
    });

    const url = validateObservedIndicator({
      type: "URL",
      value: "hxxps://secure-energy[.]example:8443/login?a=1",
    });
    expect(url).toMatchObject({
      observed: "hxxps://secure-energy[.]example:8443/login?a=1",
      canonical: "https://secure-energy.example:8443/login?a=1",
      valid: true,
    });
    expect(url.defangedValue).toBe(
      "hxxps://secure-energy[.]example:8443/login?a=1",
    );
  });

  it("creates safe displays for IPv4 and email", () => {
    expect(safeDefangIndicatorValue("192.0.2.10", "IP")).toBe(
      "192[.]0[.]2[.]10",
    );
    expect(safeDefangIndicatorValue("a@example.com", "EMAIL")).toBe(
      "a@example[.]com",
    );
  });

  it("identifies common hash algorithms", () => {
    expect(detectHashAlgorithm("a".repeat(32))).toBe("MD5");
    expect(detectHashAlgorithm("a".repeat(40))).toBe("SHA-1");
    expect(detectHashAlgorithm("a".repeat(64))).toBe("SHA-256");
  });

  it("rejects credential-bearing URLs", () => {
    const result = validateObservedIndicator({
      type: "URL",
      value: "https://user:secret@example.com/path",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Credential-bearing");
  });

  it("does not salvage an IOC embedded in arbitrary prose", () => {
    const result = validateObservedIndicator({
      type: "DOMAIN",
      value: "PowerShell contacted secure-energy[.]example",
    });
    expect(result.valid).toBe(false);
    expect(result.normalized).toContain("PowerShell");
  });
});

describe("bulk IOC parsing", () => {
  const acceptanceInput = [
    "secure-energy[.]example",
    "hxxps://secure-energy[.]example/login",
    "192.0.2.10",
    "2001:db8::10",
    "44d88612fea8a8f36de82e1278abb02f",
    "secure-energy[.]example",
    "CVE-2026-12345",
    "not an indicator",
  ].join("\n");

  it("preserves source line numbers while ignoring blank lines", () => {
    const result = parseBulkIndicatorInput("\nexample.com\n\n192.0.2.1\n");
    expect(result.rows.map((row) => row.lineNumber)).toEqual([2, 4]);
  });

  it("classifies mixed input without discarding valid rows", () => {
    const result = parseBulkIndicatorInput(acceptanceInput);
    expect(result.rows.map((row) => row.classification)).toEqual([
      "NEW",
      "NEW",
      "NEW",
      "NEW",
      "NEW",
      "DUPLICATE_IN_INPUT",
      "UNSUPPORTED_CVE",
      "INVALID",
    ]);
    expect(result.rows.filter((row) => row.classification === "NEW")).toHaveLength(
      5,
    );
    expect(result.rows[0].observedValue).toBe("secure-energy[.]example");
    expect(result.rows[0].canonicalValue).toBe("secure-energy.example");
  });

  it("does not classify CVEs as Indicators", () => {
    const row = parseBulkIndicatorInput("CVE-2026-12345").rows[0];
    expect(row.classification).toBe("UNSUPPORTED_CVE");
    expect(row.detectedType).toBeNull();
  });

  it("enforces the non-empty line limit", () => {
    const allowed = Array.from(
      { length: MAX_BULK_IOC_LINES },
      (_, index) => `host-${index}.example`,
    ).join("\n");
    expect(parseBulkIndicatorInput(allowed).rows).toHaveLength(
      MAX_BULK_IOC_LINES,
    );

    const tooMany = `${allowed}\nextra.example`;
    expect(() => parseBulkIndicatorInput(tooMany)).toThrow("at most 500");
  });

  it("rejects oversized requests", () => {
    expect(() =>
      parseBulkIndicatorInput("x".repeat(MAX_BULK_IOC_INPUT_CHARS + 1)),
    ).toThrow("must not exceed");
  });
});
