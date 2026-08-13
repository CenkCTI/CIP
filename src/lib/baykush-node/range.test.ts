import { describe, expect, it } from "vitest";
import { resolveGlobalRange } from "./range";

describe("BAYKUSH Node global range", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");

  it("resolves the fixed analyst ranges in UTC", () => {
    expect(resolveGlobalRange("24h", now)).toEqual({ from: "2026-08-12T12:00:00.000Z", to: "2026-08-13T12:00:00.000Z" });
    expect(resolveGlobalRange("7d", now)).toEqual({ from: "2026-08-06T12:00:00.000Z", to: "2026-08-13T12:00:00.000Z" });
    expect(resolveGlobalRange("30d", now)).toEqual({ from: "2026-07-14T12:00:00.000Z", to: "2026-08-13T12:00:00.000Z" });
  });
});
