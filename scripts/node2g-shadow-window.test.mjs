import { describe, expect, it } from "vitest";
import { explicitShadowWindow, shadowWindowColumn } from "./node2g-shadow-window.mjs";

describe("NODE-2G source-native shadow windows", () => {
  it("uses NVD source_modified_at for last-modified parity", () => {
    expect(shadowWindowColumn("NVD_CVE")).toBe("source_modified_at");
    expect(explicitShadowWindow("NVD_CVE", "2099-01-01T00:00:00Z", "2099-01-01T01:00:00Z")).toEqual({
      start: "2099-01-01T00:00:00.000Z",
      end: "2099-01-01T01:00:00.000Z",
    });
  });

  it("uses source_published_at for moving-source provider first_seen parity", () => {
    expect(shadowWindowColumn("THREATFOX")).toBe("source_published_at");
    expect(shadowWindowColumn("MALWAREBAZAAR")).toBe("source_published_at");
    expect(explicitShadowWindow("THREATFOX", "2099-01-01T00:00:00Z", "2099-01-02T00:00:00Z")).toEqual({
      start: "2099-01-01T00:00:00.000Z",
      end: "2099-01-02T00:00:00.000Z",
    });
    expect(explicitShadowWindow("MALWAREBAZAAR", "2099-01-01T00:00:00Z", "2099-01-01T00:30:00Z")).toEqual({
      start: "2099-01-01T00:00:00.000Z",
      end: "2099-01-01T00:30:00.000Z",
    });
  });

  it("requires an explicit provider first_seen window for moving recent populations", () => {
    expect(() => explicitShadowWindow("THREATFOX", null, null)).toThrow("THREATFOX shadow export requires an explicit provider first_seen window");
    expect(() => explicitShadowWindow("MALWAREBAZAAR", null, null)).toThrow("MALWAREBAZAAR shadow export requires an explicit provider first_seen window");
  });

  it("rejects half-open, invalid, reversed, and unsupported windows", () => {
    expect(() => explicitShadowWindow("THREATFOX", "2099-01-01T00:00:00Z", null)).toThrow("requires both windowStart and windowEnd");
    expect(() => explicitShadowWindow("MALWAREBAZAAR", "2099-01-01T00:00:00Z", null)).toThrow("requires both windowStart and windowEnd");
    expect(() => explicitShadowWindow("MALWAREBAZAAR", "not-a-date", "2099-01-01T00:00:00Z")).toThrow("valid datetimes");
    expect(() => explicitShadowWindow("MALWAREBAZAAR", "2099-01-02T00:00:00Z", "2099-01-01T00:00:00Z")).toThrow("must not be after windowEnd");
    expect(() => explicitShadowWindow("CISA_KEV", "2099-01-01T00:00:00Z", "2099-01-02T00:00:00Z")).toThrow("not supported for CISA_KEV");
  });

  it("leaves optional NVD export unbounded when no explicit window is requested", () => {
    expect(explicitShadowWindow("NVD_CVE", null, null)).toBeNull();
  });
});
