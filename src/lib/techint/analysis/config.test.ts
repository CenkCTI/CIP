import { describe, expect, it } from "vitest";
import {
  TECHNICAL_ANALYSIS_HISTORY_DAYS,
  TECHNICAL_ANALYSIS_MAX_SAMPLES,
  TECHNICAL_ANALYSIS_MODIFIED_Z_THRESHOLD,
  TECHNICAL_ANALYSIS_PROVISIONAL_MIN_SAMPLES,
  TECHNICAL_ANALYSIS_READY_MIN_SAMPLES,
  minimumAbsoluteDelta,
} from "./config";
import { TECHNICAL_ANALYSIS_CONFIG_VERSION, TECHNICAL_ANALYSIS_ENGINE_VERSION, technicalAnomalyMetrics } from "./types";

describe("Phase 2.3F-D deterministic analysis configuration", () => {
  it("keeps the engine and config explicitly versioned", () => {
    expect(TECHNICAL_ANALYSIS_ENGINE_VERSION).toBe("2.3F-D-v1");
    expect(TECHNICAL_ANALYSIS_CONFIG_VERSION).toBe("2.3F-D-config-v1");
  });

  it("keeps baseline work bounded", () => {
    expect(TECHNICAL_ANALYSIS_HISTORY_DAYS).toBe(30);
    expect(TECHNICAL_ANALYSIS_MAX_SAMPLES).toBe(64);
    expect(TECHNICAL_ANALYSIS_PROVISIONAL_MIN_SAMPLES).toBe(14);
    expect(TECHNICAL_ANALYSIS_READY_MIN_SAMPLES).toBe(28);
  });

  it("uses robust deviation rather than a probability interpretation", () => {
    expect(TECHNICAL_ANALYSIS_MODIFIED_Z_THRESHOLD).toBe(3.5);
    expect(technicalAnomalyMetrics).toEqual([
      "OBSERVATION_COUNT",
      "DISTINCT_SIGNAL_COUNT",
      "STALE_COUNT",
      "CONFLICTING_COUNT",
    ]);
  });

  it("requires minimum absolute movement before anomaly emission", () => {
    expect(minimumAbsoluteDelta).toEqual({
      OBSERVATION_COUNT: 10,
      DISTINCT_SIGNAL_COUNT: 10,
      STALE_COUNT: 5,
      CONFLICTING_COUNT: 3,
    });
  });
});
