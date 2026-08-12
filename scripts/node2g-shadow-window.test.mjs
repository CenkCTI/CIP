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

  it("uses ThreatFox source_published_at because CİTEM stores provider first_seen there", () => {
    expect(shadowWindowColumn("THREATFOX")).toBe("source_published_at");
    expect(explicitShadowWindow("THREATFOX", "2099-01-01T00:00:00Z", "2099-01-02T00:00:00Z")).toEqual({
      start: "2099-01-01T00:00:00.000Z",
      end: "2099-01-02T00:00:00.000Z",
    });
  });

  it("rejects half-open, invalid, reversed, and unsupported windows", () => {
    expect(() => explicitShadowWindow("THREATFOX", "2099-01-01T00:00:00Z", null)).toThrow("requires both windowStart and windowEnd");
    expect(() => explicitShadowWindow("THREATFOX", "not-a-date", "2099-01-01T00:00:00Z")).toThrow("valid datetimes");
    expect(() => explicitShadowWindow("THREATFOX", "2099-01-02T00:00:00Z", "2099-01-01T00:00:00Z")).toThrow("must not be after windowEnd");
    expect(() => explicitShadowWindow("CISA_KEV", "2099-01-01T00:00:00Z", "2099-01-02T00:00:00Z")).toThrow("not supported for CISA_KEV");
  });

  it("returns null when no explicit window is requested", () => {
    expect(explicitShadowWindow("THREATFOX", null, null)).toBeNull();
  });
});
