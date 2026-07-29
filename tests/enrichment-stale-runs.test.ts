import { describe, expect, it } from "vitest";

import { isStaleEnrichmentRun, staleRunThresholdMs } from "@/lib/enrichment/service";

describe("stale enrichment-run recovery boundary", () => {
  const now = Date.parse("2026-07-29T12:00:00.000Z");

  it("keeps a fresh active run blocked", () => {
    expect(isStaleEnrichmentRun({ requested_at: "2026-07-29T11:58:00.000Z" }, 60_000, now)).toBe(false);
  });

  it.each(["PENDING", "RUNNING"])("recognizes a stale %s run for recovery", () => {
    expect(isStaleEnrichmentRun({ requested_at: "2026-07-29T11:54:59.000Z" }, 60_000, now)).toBe(true);
  });

  it("uses the latest activity and bounds twice the provider timeout", () => {
    expect(staleRunThresholdMs(10_000)).toBe(5 * 60_000);
    expect(staleRunThresholdMs(60 * 60_000)).toBe(30 * 60_000);
    expect(isStaleEnrichmentRun({ requested_at: "2026-07-29T11:00:00.000Z", updated_at: "2026-07-29T11:59:00.000Z" }, 60_000, now)).toBe(false);
  });
});
