import type { SupabaseClient } from "@supabase/supabase-js";

const activityColumns = "id,granularity,time_axis,bucket_start,bucket_end,source_system,signal_type,observation_count,distinct_signal_count,current_count,supporting_count,stale_count,conflicting_count,calculation_mode,calculated_at";
const coverageColumns = "id,connection_id,source_key,granularity,bucket_start,bucket_end,source_status,schedule_known,expected_runs,attempted_runs,successful_runs,failed_runs,running_runs,records_seen,records_mapped,last_success_at,last_failure_at,last_error_code,coverage_status,calculation_mode,calculated_at";

export function listTechnicalActivityBuckets(
  client: SupabaseClient,
  input: { granularity?: "FIVE_MINUTES" | "HOUR" | "DAY"; timeAxis?: "INGESTION_TIME" | "SOURCE_EFFECTIVE_TIME"; from?: string; limit?: number } = {},
) {
  let query = client
    .from("technical_activity_buckets")
    .select(activityColumns)
    .eq("granularity", input.granularity ?? "HOUR")
    .eq("time_axis", input.timeAxis ?? "INGESTION_TIME")
    .order("bucket_start", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 200, 1), 500));
  if (input.from) query = query.gte("bucket_start", input.from);
  return query;
}

export function listTechnicalCoverageBuckets(
  client: SupabaseClient,
  input: { granularity?: "FIVE_MINUTES" | "HOUR" | "DAY"; from?: string; limit?: number } = {},
) {
  let query = client
    .from("technical_collection_coverage_buckets")
    .select(coverageColumns)
    .eq("granularity", input.granularity ?? "HOUR")
    .order("bucket_start", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 200, 1), 500));
  if (input.from) query = query.gte("bucket_start", input.from);
  return query;
}

export function listTechnicalHistoryBackfillState(client: SupabaseClient) {
  return client
    .from("technical_history_backfill_state")
    .select("history_kind,granularity,time_axis,lower_bound,cursor_at,complete,started_at,completed_at,updated_at")
    .order("history_kind")
    .order("granularity")
    .order("time_axis");
}

export function getTechnicalHistoryMaintenanceState(client: SupabaseClient) {
  return client
    .from("technical_history_maintenance_state")
    .select("next_maintenance_at,last_activity_refresh_at,last_coverage_refresh_at,last_compaction_at,backfill_phase,updated_at")
    .maybeSingle();
}
