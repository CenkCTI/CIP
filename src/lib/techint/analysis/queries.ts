import type { SupabaseClient } from "@supabase/supabase-js";

const seriesColumns = "id,series_key,source_key,source_system,signal_type,source_class,observation_basis,semantic_kind,semantics_version,metric_kind,time_axis,granularity,engine_version,created_at,updated_at";
const baselineColumns = "id,series_id,status,as_of,window_start,window_end,sample_count,strict_sample_count,provisional_sample_count,median_value,mad_value,scaled_mad,q1,q3,p10,p90,minimum_value,maximum_value,zero_count,method,input_fingerprint,engine_version,config_version,calculated_at";
const evaluationColumns = "id,series_id,bucket_start,bucket_end,target_value,coverage_status,schedule_known,expected_runs,attempted_runs,successful_runs,failed_runs,running_runs,scheduled_run_count,manual_run_count,test_run_count,baseline_status,baseline_sample_count,baseline_median,baseline_mad,baseline_q1,baseline_q3,method,robust_deviation_score,absolute_delta,relative_delta,direction,state,anomaly_kind,suppression_reason,semantics_version,engine_version,config_version,baseline_fingerprint,input_fingerprint,calculated_at";

export function listTechnicalAnalysisSeries(client: SupabaseClient, limit = 300) {
  return client
    .from("technical_analysis_series")
    .select(seriesColumns)
    .order("source_key")
    .order("signal_type")
    .order("metric_kind")
    .limit(Math.min(Math.max(limit, 1), 500));
}

export function listTechnicalBaselineProfiles(client: SupabaseClient, limit = 300) {
  return client
    .from("technical_baseline_profiles")
    .select(baselineColumns)
    .order("calculated_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));
}

export function listTechnicalAnomalyEvaluations(
  client: SupabaseClient,
  input: { from?: string; limit?: number; state?: string } = {},
) {
  let query = client
    .from("technical_anomaly_evaluations")
    .select(evaluationColumns)
    .order("bucket_start", { ascending: false })
    .order("id", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 300, 1), 500));
  if (input.from) query = query.gte("bucket_start", input.from);
  if (input.state) query = query.eq("state", input.state);
  return query;
}

export function getTechnicalAnomalyEvaluation(client: SupabaseClient, id: string) {
  return client
    .from("technical_anomaly_evaluations")
    .select(evaluationColumns)
    .eq("id", id)
    .maybeSingle();
}

export function getTechnicalAnalysisSeries(client: SupabaseClient, id: string) {
  return client
    .from("technical_analysis_series")
    .select(seriesColumns)
    .eq("id", id)
    .maybeSingle();
}

export function getTechnicalBaselineProfile(client: SupabaseClient, seriesId: string) {
  return client
    .from("technical_baseline_profiles")
    .select(`${baselineColumns},sample_bucket_starts`)
    .eq("series_id", seriesId)
    .maybeSingle();
}

export function listTechnicalSeriesEvaluations(client: SupabaseClient, seriesId: string, limit = 20) {
  return client
    .from("technical_anomaly_evaluations")
    .select(evaluationColumns)
    .eq("series_id", seriesId)
    .order("bucket_start", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
}

export function getTechnicalAnomalyMaintenanceState(client: SupabaseClient) {
  return client
    .from("technical_anomaly_maintenance_state")
    .select("next_maintenance_at,last_series_refresh_at,last_evaluation_at,last_backfill_at,last_compaction_at,updated_at")
    .maybeSingle();
}

export function listTechnicalAnomalyBackfillState(client: SupabaseClient) {
  return client
    .from("technical_anomaly_backfill_state")
    .select("series_id,lower_bound,cursor_at,complete,started_at,completed_at,updated_at")
    .order("complete")
    .order("updated_at");
}
