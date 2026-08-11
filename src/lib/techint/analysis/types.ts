export const TECHNICAL_ANALYSIS_ENGINE_VERSION = "2.3F-D-v1" as const;
export const TECHNICAL_ANALYSIS_CONFIG_VERSION = "2.3F-D-config-v1" as const;

export const technicalAnalysisMetrics = [
  "OBSERVATION_COUNT",
  "DISTINCT_SIGNAL_COUNT",
  "CURRENT_COUNT",
  "SUPPORTING_COUNT",
  "STALE_COUNT",
  "CONFLICTING_COUNT",
] as const;

export const technicalAnomalyMetrics = [
  "OBSERVATION_COUNT",
  "DISTINCT_SIGNAL_COUNT",
  "STALE_COUNT",
  "CONFLICTING_COUNT",
] as const;

export const technicalBaselineStatuses = [
  "INSUFFICIENT_HISTORY",
  "PROVISIONAL",
  "READY",
  "INSUFFICIENT_COVERAGE",
  "NOT_APPLICABLE",
] as const;

export const technicalAnomalyStates = [
  "NORMAL",
  "ANOMALOUS",
  "PROVISIONAL_DEVIATION",
  "SUPPRESSED",
] as const;

export const technicalAnomalyDirections = ["HIGH", "LOW", "NONE"] as const;

export const technicalAnomalyMethods = [
  "MAD_MODIFIED_Z",
  "IQR_FALLBACK",
  "CONSTANT_BASELINE",
  "NONE",
] as const;

export const technicalAnomalyKinds = [
  "VOLUME_SPIKE",
  "VOLUME_DROP",
  "DISTINCT_VOLUME_SPIKE",
  "DISTINCT_VOLUME_DROP",
  "STALE_SPIKE",
  "CONFLICTING_SPIKE",
] as const;

export const technicalAnomalySuppressionReasons = [
  "NO_COLLECTION_OPPORTUNITY",
  "NO_COVERAGE",
  "DEGRADED_COVERAGE",
  "PARTIAL_COVERAGE",
  "MANUAL_RUN_PRESENT",
  "TEST_RUN_PRESENT",
  "INSUFFICIENT_HISTORY",
  "PROVISIONAL_BASELINE",
  "SEMANTIC_VERSION_UNSUPPORTED",
  "UNSUPPORTED_SERIES",
  "INSUFFICIENT_COVERAGE",
] as const;

export type TechnicalAnalysisMetric = (typeof technicalAnalysisMetrics)[number];
export type TechnicalAnomalyMetric = (typeof technicalAnomalyMetrics)[number];
export type TechnicalBaselineStatus = (typeof technicalBaselineStatuses)[number];
export type TechnicalAnomalyState = (typeof technicalAnomalyStates)[number];
export type TechnicalAnomalyDirection = (typeof technicalAnomalyDirections)[number];
export type TechnicalAnomalyMethod = (typeof technicalAnomalyMethods)[number];
export type TechnicalAnomalyKind = (typeof technicalAnomalyKinds)[number];
export type TechnicalAnomalySuppressionReason = (typeof technicalAnomalySuppressionReasons)[number];
