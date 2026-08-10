import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { TechnicalHistoryGranularity, TechnicalHistoryTimeAxis } from "./buckets";

const rollupResultSchema = z.object({
  buckets_processed: z.number().int().nonnegative(),
  rows_written: z.number().int().nonnegative(),
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
}).passthrough();

const maintenanceClaimSchema = z.object({
  due: z.boolean(),
  wait_seconds: z.number().int().nonnegative(),
  backfill_phase: z.number().int().min(0).max(8),
  compact_due: z.boolean(),
});

const backfillResultSchema = z.object({
  complete: z.boolean(),
  empty: z.boolean(),
  buckets_processed: z.number().int().nonnegative(),
}).passthrough();

const compactionResultSchema = z.object({
  activity_deleted: z.number().int().nonnegative(),
  coverage_deleted: z.number().int().nonnegative(),
});

function trustedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("TechINT historical maintenance is not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function rpc(name: string, parameters: Record<string, unknown>) {
  const { data, error } = await trustedClient().rpc(name, parameters);
  if (error) throw new Error("TECHINT_HISTORY_RPC_FAILED");
  return data;
}

export async function claimTechnicalHistoryMaintenance(ownerId: string, now: string) {
  const data = await rpc("claim_technical_history_maintenance", {
    p_owner: z.uuid().parse(ownerId),
    p_now: z.iso.datetime({ offset: true }).parse(now),
  });
  return maintenanceClaimSchema.parse(data);
}

export async function refreshTechnicalActivityBuckets(input: {
  ownerId: string;
  granularity: TechnicalHistoryGranularity;
  timeAxis: TechnicalHistoryTimeAxis;
  from: string;
  to: string;
  mode?: "LIVE" | "BACKFILLED" | "RECOMPUTED";
  maxBuckets?: number;
}) {
  const data = await rpc("refresh_technical_activity_buckets", {
    p_owner: z.uuid().parse(input.ownerId),
    p_granularity: input.granularity,
    p_time_axis: input.timeAxis,
    p_from: z.iso.datetime({ offset: true }).parse(input.from),
    p_to: z.iso.datetime({ offset: true }).parse(input.to),
    p_mode: input.mode ?? "RECOMPUTED",
    p_max_buckets: z.number().int().min(1).max(96).parse(input.maxBuckets ?? 96),
  });
  return rollupResultSchema.parse(data);
}

export async function refreshTechnicalCoverageBuckets(input: {
  ownerId: string;
  granularity: TechnicalHistoryGranularity;
  from: string;
  to: string;
  mode?: "LIVE" | "BACKFILLED" | "RECOMPUTED";
  maxBuckets?: number;
}) {
  const data = await rpc("refresh_technical_collection_coverage_buckets", {
    p_owner: z.uuid().parse(input.ownerId),
    p_granularity: input.granularity,
    p_from: z.iso.datetime({ offset: true }).parse(input.from),
    p_to: z.iso.datetime({ offset: true }).parse(input.to),
    p_mode: input.mode ?? "RECOMPUTED",
    p_max_buckets: z.number().int().min(1).max(96).parse(input.maxBuckets ?? 96),
  });
  return rollupResultSchema.parse(data);
}

export async function advanceTechnicalHistoryBackfill(input: {
  ownerId: string;
  historyKind: "ACTIVITY" | "COVERAGE";
  granularity: TechnicalHistoryGranularity;
  timeAxis: TechnicalHistoryTimeAxis;
  maxBuckets?: number;
}) {
  const data = await rpc("advance_technical_history_backfill", {
    p_owner: z.uuid().parse(input.ownerId),
    p_history_kind: input.historyKind,
    p_granularity: input.granularity,
    p_time_axis: input.timeAxis,
    p_max_buckets: z.number().int().min(1).max(96).parse(input.maxBuckets ?? 48),
  });
  return backfillResultSchema.parse(data);
}

export async function compactTechnicalHistory(ownerId: string, now: string) {
  const data = await rpc("compact_technical_history", {
    p_owner: z.uuid().parse(ownerId),
    p_now: z.iso.datetime({ offset: true }).parse(now),
  });
  return compactionResultSchema.parse(data);
}
