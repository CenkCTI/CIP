import "server-only";

import { authenticateTechnicalCollector } from "@/lib/techint/collection/trusted-collection-client";
import {
  recentTechnicalHistoryWindows,
  technicalHistoryTimeAxes,
  type TechnicalHistoryGranularity,
  type TechnicalHistoryTimeAxis,
} from "./buckets";
import {
  advanceTechnicalHistoryBackfill,
  claimTechnicalHistoryMaintenance,
  compactTechnicalHistory,
  refreshTechnicalActivityBuckets,
  refreshTechnicalCoverageBuckets,
} from "./trusted-history-client";

type BackfillTask = {
  historyKind: "ACTIVITY" | "COVERAGE";
  granularity: TechnicalHistoryGranularity;
  timeAxis: TechnicalHistoryTimeAxis;
};

const BACKFILL_TASKS: readonly BackfillTask[] = [
  { historyKind: "ACTIVITY", granularity: "FIVE_MINUTES", timeAxis: "INGESTION_TIME" },
  { historyKind: "ACTIVITY", granularity: "FIVE_MINUTES", timeAxis: "SOURCE_EFFECTIVE_TIME" },
  { historyKind: "ACTIVITY", granularity: "HOUR", timeAxis: "INGESTION_TIME" },
  { historyKind: "ACTIVITY", granularity: "HOUR", timeAxis: "SOURCE_EFFECTIVE_TIME" },
  { historyKind: "ACTIVITY", granularity: "DAY", timeAxis: "INGESTION_TIME" },
  { historyKind: "ACTIVITY", granularity: "DAY", timeAxis: "SOURCE_EFFECTIVE_TIME" },
  { historyKind: "COVERAGE", granularity: "FIVE_MINUTES", timeAxis: "INGESTION_TIME" },
  { historyKind: "COVERAGE", granularity: "HOUR", timeAxis: "INGESTION_TIME" },
  { historyKind: "COVERAGE", granularity: "DAY", timeAxis: "INGESTION_TIME" },
] as const;

export type TechnicalHistoryMaintenanceResult =
  | { authorized: false }
  | {
      authorized: true;
      enabled: boolean;
      due: boolean;
      waitSeconds: number;
      activityBucketsProcessed: number;
      coverageBucketsProcessed: number;
      backfillBucketsProcessed: number;
      backfillComplete: boolean | null;
      compacted: boolean;
    };

export async function runTechnicalHistoryMaintenance(
  token: string,
  now: Date = new Date(),
): Promise<TechnicalHistoryMaintenanceResult> {
  const collector = await authenticateTechnicalCollector(token);
  if (!collector) return { authorized: false };
  if (!collector.enabled) {
    return {
      authorized: true,
      enabled: false,
      due: false,
      waitSeconds: collector.poll_interval_seconds,
      activityBucketsProcessed: 0,
      coverageBucketsProcessed: 0,
      backfillBucketsProcessed: 0,
      backfillComplete: null,
      compacted: false,
    };
  }

  const nowIso = now.toISOString();
  const claim = await claimTechnicalHistoryMaintenance(collector.owner_id, nowIso);
  if (!claim.due) {
    return {
      authorized: true,
      enabled: true,
      due: false,
      waitSeconds: claim.wait_seconds,
      activityBucketsProcessed: 0,
      coverageBucketsProcessed: 0,
      backfillBucketsProcessed: 0,
      backfillComplete: null,
      compacted: false,
    };
  }

  let activityBucketsProcessed = 0;
  let coverageBucketsProcessed = 0;
  for (const window of recentTechnicalHistoryWindows(now)) {
    for (const timeAxis of technicalHistoryTimeAxes) {
      const activity = await refreshTechnicalActivityBuckets({
        ownerId: collector.owner_id,
        granularity: window.granularity,
        timeAxis,
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        mode: "LIVE",
        maxBuckets: 96,
      });
      activityBucketsProcessed += activity.buckets_processed;
    }
    const coverage = await refreshTechnicalCoverageBuckets({
      ownerId: collector.owner_id,
      granularity: window.granularity,
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      mode: "LIVE",
      maxBuckets: 96,
    });
    coverageBucketsProcessed += coverage.buckets_processed;
  }

  const backfillTask = BACKFILL_TASKS[claim.backfill_phase];
  const backfill = await advanceTechnicalHistoryBackfill({
    ownerId: collector.owner_id,
    historyKind: backfillTask.historyKind,
    granularity: backfillTask.granularity,
    timeAxis: backfillTask.timeAxis,
    maxBuckets: 48,
  });

  let compacted = false;
  if (claim.compact_due) {
    await compactTechnicalHistory(collector.owner_id, nowIso);
    compacted = true;
  }

  return {
    authorized: true,
    enabled: true,
    due: true,
    waitSeconds: claim.wait_seconds,
    activityBucketsProcessed,
    coverageBucketsProcessed,
    backfillBucketsProcessed: backfill.buckets_processed,
    backfillComplete: backfill.complete,
    compacted,
  };
}
