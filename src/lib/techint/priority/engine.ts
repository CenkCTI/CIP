export const TECHINT_PRIORITY_ENGINE_VERSION = "2.3E-v1";

export const globalPriorityLevels = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type GlobalPriorityLevel = (typeof globalPriorityLevels)[number];

export type GlobalPriorityReason =
  | "CISA_KEV"
  | "CONFIRMED_ACTIVE_EXPLOITATION"
  | "EPSS_VERY_HIGH"
  | "EPSS_HIGH"
  | "EPSS_PERCENTILE_99"
  | "EPSS_PERCENTILE_95"
  | "TECHNICAL_SEVERITY_CRITICAL"
  | "TECHNICAL_SEVERITY_HIGH"
  | "TECHNICAL_SEVERITY_MEDIUM"
  | "FRESH_LT_24H"
  | "FRESH_LT_7D"
  | "MULTI_SOURCE_3_PLUS"
  | "MULTI_SOURCE"
  | "VENDOR_ADVISORY"
  | "MATERIAL_REVISION"
  | "HIGH_SOURCE_CONFIDENCE"
  | "NON_ACTIVE_LIFECYCLE";

export type GlobalPriorityInput = {
  lifecycle: "ACTIVE" | "RETRACTED" | "SUPERSEDED" | "ARCHIVED";
  severity: "UNKNOWN" | "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  firstSeenAt: string | Date;
  evaluatedAt?: string | Date;
  sourceSystems?: string[];
  isKev?: boolean;
  confirmedActiveExploitation?: boolean;
  epss?: number | null;
  epssPercentile?: number | null;
  vendorAdvisory?: boolean;
  revisionNumber?: number;
  revisionUpdatedAt?: string | Date | null;
  sourceConfidence?: number | null;
};

export type GlobalPriorityResult = {
  priority: GlobalPriorityLevel;
  internalScore: number;
  reasonCodes: GlobalPriorityReason[];
  engineVersion: typeof TECHINT_PRIORITY_ENGINE_VERSION;
};

function boundedProbability(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function instant(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid priority timestamp.");
  return date;
}

export function globalPriorityForScore(score: number): GlobalPriorityLevel {
  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  if (bounded >= 70) return "CRITICAL";
  if (bounded >= 50) return "HIGH";
  if (bounded >= 30) return "MEDIUM";
  if (bounded >= 15) return "LOW";
  return "INFO";
}

export function evaluateGlobalPriority(input: GlobalPriorityInput): GlobalPriorityResult {
  if (input.lifecycle !== "ACTIVE") {
    return {
      priority: "INFO",
      internalScore: 0,
      reasonCodes: ["NON_ACTIVE_LIFECYCLE"],
      engineVersion: TECHINT_PRIORITY_ENGINE_VERSION,
    };
  }

  let score = 0;
  const reasons: GlobalPriorityReason[] = [];
  const add = (points: number, reason: GlobalPriorityReason) => {
    score += points;
    reasons.push(reason);
  };

  if (input.isKev) add(25, "CISA_KEV");
  if (input.confirmedActiveExploitation) add(20, "CONFIRMED_ACTIVE_EXPLOITATION");

  const epss = boundedProbability(input.epss);
  if (epss !== null && epss >= 0.9) add(15, "EPSS_VERY_HIGH");
  else if (epss !== null && epss >= 0.5) add(8, "EPSS_HIGH");

  const percentile = boundedProbability(input.epssPercentile);
  if (percentile !== null && percentile >= 0.99) add(10, "EPSS_PERCENTILE_99");
  else if (percentile !== null && percentile >= 0.95) add(5, "EPSS_PERCENTILE_95");

  if (input.severity === "CRITICAL") add(15, "TECHNICAL_SEVERITY_CRITICAL");
  else if (input.severity === "HIGH") add(10, "TECHNICAL_SEVERITY_HIGH");
  else if (input.severity === "MEDIUM") add(5, "TECHNICAL_SEVERITY_MEDIUM");

  const now = instant(input.evaluatedAt ?? new Date());
  const firstSeen = instant(input.firstSeenAt);
  const ageHours = Math.max(0, (now.getTime() - firstSeen.getTime()) / 3_600_000);
  if (ageHours < 24) add(10, "FRESH_LT_24H");
  else if (ageHours < 168) add(5, "FRESH_LT_7D");

  const sourceCount = new Set((input.sourceSystems ?? []).map((source) => source.trim().toLowerCase()).filter(Boolean)).size;
  if (sourceCount >= 3) add(10, "MULTI_SOURCE_3_PLUS");
  else if (sourceCount >= 2) add(7, "MULTI_SOURCE");

  if (input.vendorAdvisory) add(5, "VENDOR_ADVISORY");

  const revisionUpdatedAt = input.revisionUpdatedAt ? instant(input.revisionUpdatedAt) : now;
  const revisionAgeHours = Math.max(0, (now.getTime() - revisionUpdatedAt.getTime()) / 3_600_000);
  if ((input.revisionNumber ?? 1) > 1 && revisionAgeHours < 24) add(5, "MATERIAL_REVISION");

  if (typeof input.sourceConfidence === "number" && input.sourceConfidence >= 80) add(5, "HIGH_SOURCE_CONFIDENCE");

  const internalScore = Math.max(0, Math.min(100, score));
  return {
    priority: globalPriorityForScore(internalScore),
    internalScore,
    reasonCodes: reasons,
    engineVersion: TECHINT_PRIORITY_ENGINE_VERSION,
  };
}

export const globalPriorityReasonLabels: Record<GlobalPriorityReason, string> = {
  CISA_KEV: "Listed in CISA KEV",
  CONFIRMED_ACTIVE_EXPLOITATION: "Active exploitation is confirmed",
  EPSS_VERY_HIGH: "EPSS is very high",
  EPSS_HIGH: "EPSS is high",
  EPSS_PERCENTILE_99: "EPSS percentile is at least 99th",
  EPSS_PERCENTILE_95: "EPSS percentile is at least 95th",
  TECHNICAL_SEVERITY_CRITICAL: "Technical severity is critical",
  TECHNICAL_SEVERITY_HIGH: "Technical severity is high",
  TECHNICAL_SEVERITY_MEDIUM: "Technical severity is medium",
  FRESH_LT_24H: "First observed within 24 hours",
  FRESH_LT_7D: "First observed within 7 days",
  MULTI_SOURCE_3_PLUS: "Supported by at least three source systems",
  MULTI_SOURCE: "Supported by multiple source systems",
  VENDOR_ADVISORY: "Vendor advisory context is available",
  MATERIAL_REVISION: "The technical signal materially changed recently",
  HIGH_SOURCE_CONFIDENCE: "Source-backed confidence is high",
  NON_ACTIVE_LIFECYCLE: "Signal is not active",
};

export function globalPriorityReasonLabel(reason: string) {
  return globalPriorityReasonLabels[reason as GlobalPriorityReason] ?? reason.replaceAll("_", " ").toLowerCase();
}
