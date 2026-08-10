import { describe, expect, it } from "vitest";
import { TECHINT_PRIORITY_ENGINE_VERSION, evaluateGlobalPriority } from "./engine";

describe("Phase 2.3E Global Priority", () => {
  it("produces critical technical priority from KEV, exploitation, EPSS, freshness and multi-source support", () => {
    const result = evaluateGlobalPriority({
      lifecycle: "ACTIVE",
      severity: "CRITICAL",
      firstSeenAt: "2026-08-10T08:00:00Z",
      evaluatedAt: "2026-08-10T10:00:00Z",
      sourceSystems: ["cisa-kev", "nvd", "first-epss"],
      isKev: true,
      confirmedActiveExploitation: true,
      epss: 0.96,
      epssPercentile: 0.995,
      vendorAdvisory: true,
    });

    expect(result.priority).toBe("CRITICAL");
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      "CISA_KEV",
      "CONFIRMED_ACTIVE_EXPLOITATION",
      "EPSS_VERY_HIGH",
      "EPSS_PERCENTILE_99",
      "FRESH_LT_24H",
      "MULTI_SOURCE_3_PLUS",
    ]));
  });

  it("does not turn source severity CRITICAL alone into global CRITICAL priority", () => {
    const result = evaluateGlobalPriority({
      lifecycle: "ACTIVE",
      severity: "CRITICAL",
      firstSeenAt: "2026-07-01T00:00:00Z",
      evaluatedAt: "2026-08-10T10:00:00Z",
      sourceSystems: ["nvd"],
    });
    expect(result.priority).not.toBe("CRITICAL");
    expect(result.internalScore).toBe(15);
    expect(result.reasonCodes).toEqual(["TECHNICAL_SEVERITY_CRITICAL"]);
  });

  it("is deterministic and preserves the engine version", () => {
    const input = {
      lifecycle: "ACTIVE" as const,
      severity: "HIGH" as const,
      firstSeenAt: "2026-08-09T12:00:00Z",
      evaluatedAt: "2026-08-10T10:00:00Z",
      sourceSystems: ["nvd", "vendor"],
      epss: 0.7,
      epssPercentile: 0.97,
      revisionNumber: 2,
      revisionUpdatedAt: "2026-08-10T09:00:00Z",
    };
    expect(evaluateGlobalPriority(input)).toEqual(evaluateGlobalPriority(input));
    expect(evaluateGlobalPriority(input).engineVersion).toBe(TECHINT_PRIORITY_ENGINE_VERSION);
  });
});
