import "server-only";

import { authenticateTechnicalCollector } from "@/lib/techint/collection/trusted-collection-client";
import { maintainTechnicalAnomalies } from "./trusted-analysis-client";

export type TechnicalAnalysisMaintenanceResult =
  | { authorized: false }
  | {
      authorized: true;
      enabled: boolean;
      due: boolean;
      waitSeconds: number;
      seriesCreated: number;
      recentEvaluated: number;
      backfillEvaluated: number;
      backfillComplete: boolean;
      compacted: boolean;
    };

export async function runTechnicalAnalysisMaintenance(
  token: string,
  now: Date = new Date(),
): Promise<TechnicalAnalysisMaintenanceResult> {
  const collector = await authenticateTechnicalCollector(token);
  if (!collector) return { authorized: false };
  if (!collector.enabled) {
    return {
      authorized: true,
      enabled: false,
      due: false,
      waitSeconds: collector.poll_interval_seconds,
      seriesCreated: 0,
      recentEvaluated: 0,
      backfillEvaluated: 0,
      backfillComplete: false,
      compacted: false,
    };
  }

  const result = await maintainTechnicalAnomalies({
    ownerId: collector.owner_id,
    now: now.toISOString(),
    maxRecent: 20,
    maxBackfill: 12,
  });

  return {
    authorized: true,
    enabled: true,
    ...result,
  };
}
