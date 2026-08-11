import { describe, expect, it } from "vitest";
import {
  boundedTechnicalHistoryWindow,
  floorTechnicalHistoryTime,
  recentTechnicalHistoryWindows,
} from "./buckets";

describe("TechINT historical bucket helpers", () => {
  it("uses UTC epoch boundaries for five-minute buckets", () => {
    expect(floorTechnicalHistoryTime("2026-10-25T01:02:59.999Z", "FIVE_MINUTES").toISOString())
      .toBe("2026-10-25T01:00:00.000Z");
    expect(floorTechnicalHistoryTime("2026-10-25T01:05:00.000Z", "FIVE_MINUTES").toISOString())
      .toBe("2026-10-25T01:05:00.000Z");
  });

  it("keeps hourly and daily boundaries timezone-independent", () => {
    expect(floorTechnicalHistoryTime("2026-03-29T01:59:59.999Z", "HOUR").toISOString())
      .toBe("2026-03-29T01:00:00.000Z");
    expect(floorTechnicalHistoryTime("2026-03-29T23:59:59.999Z", "DAY").toISOString())
      .toBe("2026-03-29T00:00:00.000Z");
  });

  it("caps one maintenance window at 96 buckets", () => {
    const window = boundedTechnicalHistoryWindow({
      from: "2026-08-01T00:00:00Z",
      to: "2026-08-10T00:00:00Z",
      granularity: "HOUR",
      maxBuckets: 96,
    });
    expect(window.bucketCount).toBe(96);
    expect(window.to.toISOString()).toBe("2026-08-05T00:00:00.000Z");
  });

  it("defines bounded recent refresh windows", () => {
    const windows = recentTechnicalHistoryWindows(new Date("2026-08-10T21:00:00Z"));
    expect(windows).toHaveLength(3);
    expect(windows[0]).toMatchObject({ granularity: "FIVE_MINUTES" });
    expect(windows[1]).toMatchObject({ granularity: "HOUR" });
    expect(windows[2]).toMatchObject({ granularity: "DAY" });
  });
});
