import type { TechnicalAnomalyMetric } from "./types";

export const TECHNICAL_ANALYSIS_HISTORY_DAYS = 30;
export const TECHNICAL_ANALYSIS_MAX_SAMPLES = 64;
export const TECHNICAL_ANALYSIS_READY_MIN_SAMPLES = 28;
export const TECHNICAL_ANALYSIS_READY_MIN_SPAN_HOURS = 24 * 7;
export const TECHNICAL_ANALYSIS_PROVISIONAL_MIN_SAMPLES = 14;
export const TECHNICAL_ANALYSIS_PROVISIONAL_MIN_SPAN_HOURS = 72;
export const TECHNICAL_ANALYSIS_SETTLE_MINUTES = 15;
export const TECHNICAL_ANALYSIS_MODIFIED_Z_THRESHOLD = 3.5;
export const TECHNICAL_ANALYSIS_IQR_OUTER_MULTIPLIER = 3;
export const TECHNICAL_ANALYSIS_RELATIVE_DELTA_THRESHOLD = 0.35;

export const minimumAbsoluteDelta: Readonly<Record<TechnicalAnomalyMetric, number>> = {
  OBSERVATION_COUNT: 10,
  DISTINCT_SIGNAL_COUNT: 10,
  STALE_COUNT: 5,
  CONFLICTING_COUNT: 3,
};

export function metricLabel(metric: TechnicalAnomalyMetric) {
  switch (metric) {
    case "OBSERVATION_COUNT": return "Observation volume";
    case "DISTINCT_SIGNAL_COUNT": return "Distinct-signal volume";
    case "STALE_COUNT": return "Stale-observation volume";
    case "CONFLICTING_COUNT": return "Conflicting-observation volume";
  }
}
