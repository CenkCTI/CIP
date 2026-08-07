import type { SupabaseClient } from "@supabase/supabase-js";

const connectionColumns = "id,source_key,status,settings,cursor_version,interval_minutes,next_run_at,last_started_at,last_succeeded_at,last_failed_at,consecutive_failures,created_at,updated_at";
const runColumns = "id,connection_id,source_key,trigger,status,lease_expires_at,started_at,completed_at,records_seen,records_mapped,signals_created,observations_created,revisions_created,duplicate_observations,supporting_observations,stale_observations,conflicting_observations,skipped_records,failed_records,controlled_error_code,controlled_error_message,created_at";

export function listTechnicalSourceConnections(client: SupabaseClient) {
  return client.from("technical_source_connections").select(connectionColumns).order("source_key");
}

export function listRecentTechnicalCollectionRuns(client: SupabaseClient, limit = 30) {
  return client.from("technical_collection_runs").select(runColumns).order("started_at", { ascending: false }).limit(Math.min(Math.max(limit, 1), 100));
}

export function listRecentTechnicalSourceAuditEvents(client: SupabaseClient, limit = 40) {
  return client
    .from("technical_source_audit_events")
    .select("id,connection_id,source_key,action,details,created_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
}
