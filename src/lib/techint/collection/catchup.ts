import type { TechnicalSourceKey } from "./types";

export type CatchUpCapability = {
  mode: "CURSOR_WINDOW" | "BOUNDED_LOOKBACK" | "CURRENT_SNAPSHOT" | "LATEST_SNAPSHOT" | "NOT_APPLICABLE";
  label: string;
  detail: string;
  fullGapRecovery: boolean;
  maxRecoverableGapHours: number | null;
};

export function technicalSourceCatchUpCapability(
  sourceKey: TechnicalSourceKey,
  settings: Record<string, unknown> = {},
): CatchUpCapability {
  if (sourceKey === "TEST_SYNTHETIC") {
    return {
      mode: "NOT_APPLICABLE",
      label: "Test source",
      detail: "Synthetic test data is not part of continuous collection.",
      fullGapRecovery: false,
      maxRecoverableGapHours: null,
    };
  }

  if (sourceKey === "NVD_CVE") {
    return {
      mode: "CURSOR_WINDOW",
      label: "Durable cursor window",
      detail: "Resumes from the last successful NVD last-modified watermark with a five-minute overlap. Windows are bounded to 120 days and replay remains idempotent.",
      fullGapRecovery: true,
      maxRecoverableGapHours: 120 * 24,
    };
  }

  if (sourceKey === "THREATFOX") {
    const lookback = typeof settings.lookbackDays === "number" && Number.isInteger(settings.lookbackDays)
      ? Math.min(7, Math.max(1, settings.lookbackDays))
      : 1;
    return {
      mode: "BOUNDED_LOOKBACK",
      label: `Bounded lookback · ${lookback}d`,
      detail: "Replays the configured ThreatFox lookback and advances a provider-ID high-water mark. Gaps inside the configured window can be recovered; older provider history is not guaranteed.",
      fullGapRecovery: true,
      maxRecoverableGapHours: lookback * 24,
    };
  }

  if (sourceKey === "CISA_KEV") {
    return {
      mode: "CURRENT_SNAPSHOT",
      label: "Current snapshot",
      detail: "A reconnect fetches the current KEV catalog. Current state is recovered, but intermediate catalog states that existed only while offline cannot be reconstructed.",
      fullGapRecovery: false,
      maxRecoverableGapHours: null,
    };
  }

  if (sourceKey === "FIRST_EPSS") {
    return {
      mode: "CURRENT_SNAPSHOT",
      label: "Current snapshot",
      detail: "A reconnect refreshes the current bounded EPSS snapshot. Intermediate EPSS states missed while offline are not reconstructed.",
      fullGapRecovery: false,
      maxRecoverableGapHours: null,
    };
  }

  return {
    mode: "LATEST_SNAPSHOT",
    label: "Latest bounded snapshot",
    detail: "MalwareBazaar returns the latest bounded metadata set. Continuous collection reduces gaps, but a long offline interval can exceed the provider snapshot and cannot be guaranteed recoverable.",
    fullGapRecovery: false,
    maxRecoverableGapHours: null,
  };
}
