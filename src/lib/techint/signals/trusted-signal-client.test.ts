import { describe, expect, it } from "vitest";
import { safeRecorderRpcCode, safeRecorderSqlState } from "./trusted-signal-client";

describe("Technical Signal recorder diagnostics", () => {
  it("retains any valid five-character SQLSTATE without exposing arbitrary text", () => {
    expect(safeRecorderSqlState("23514")).toBe("23514");
    expect(safeRecorderSqlState("42P10")).toBe("42P10");
    expect(safeRecorderSqlState("P0001")).toBe("P0001");
    expect(safeRecorderSqlState("22001")).toBe("22001");
    expect(safeRecorderSqlState("PGRST116")).toBeNull();
    expect(safeRecorderSqlState("constraint technical_signals_secret")).toBeNull();
    expect(safeRecorderSqlState(null)).toBeNull();
  });

  it("retains only structured PostgREST codes", () => {
    expect(safeRecorderRpcCode("PGRST116")).toBe("PGRST116");
    expect(safeRecorderRpcCode("PGRST202")).toBe("PGRST202");
    expect(safeRecorderRpcCode("23514")).toBeNull();
    expect(safeRecorderRpcCode("PGRST116 confidential detail")).toBeNull();
    expect(safeRecorderRpcCode(null)).toBeNull();
  });
});
