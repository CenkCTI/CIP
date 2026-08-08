import type { SupabaseClient } from "@supabase/supabase-js";

export function listTechnicalEntities(client: SupabaseClient, limit = 150) {
  return client
    .from("technical_entities")
    .select("id,entity_kind,canonical_name,canonical_normalized,deterministic_key,indicator_type,origin,status,created_at,updated_at,archived_at")
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 300));
}

export function listTechnicalEntityAliases(client: SupabaseClient, limit = 200) {
  return client
    .from("technical_entity_aliases")
    .select("id,entity_id,entity_kind,display_value,normalized_value,basis,status,source_assertion_id,source_observation_id,source_system,created_at,revoked_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 400));
}

export function listTechnicalEntityResolutions(client: SupabaseClient, limit = 500) {
  return client
    .from("technical_entity_assertion_resolutions")
    .select("id,assertion_id,entity_kind,entity_id,alias_id,status,basis,created_at,updated_at,resolved_at")
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));
}

export function listTechnicalEntityAssertions(client: SupabaseClient, limit = 500) {
  return client
    .from("technical_signal_entity_assertions")
    .select("id,signal_id,source_observation_id,entity_kind,display_value,normalized_value,semantic_role,assertion_basis,confidence,indicator_type,created_at")
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 500));
}

export function listTechnicalEntityAuditEvents(client: SupabaseClient, limit = 100) {
  return client
    .from("technical_entity_audit_events")
    .select("id,entity_id,alias_id,assertion_id,actor_id,action,details,created_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
}

export function listTechnicalSignalLabels(client: SupabaseClient, ids: string[]) {
  if (!ids.length) return Promise.resolve({ data: [], error: null });
  return client.from("technical_signals").select("id,title").in("id", ids.slice(0, 500));
}

export function listTechnicalObservationLabels(client: SupabaseClient, ids: string[]) {
  if (!ids.length) return Promise.resolve({ data: [], error: null });
  return client
    .from("technical_signal_observations")
    .select("id,source_system,source_record_key,source_title")
    .in("id", ids.slice(0, 500));
}
