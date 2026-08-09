import type { SupabaseClient } from "@supabase/supabase-js";

const entityProjection = "id,entity_kind,canonical_name,canonical_normalized,deterministic_key,indicator_type,origin,status,created_at,updated_at,archived_at";
const assertionProjection = "id,signal_id,source_observation_id,entity_kind,display_value,normalized_value,semantic_role,assertion_basis,confidence,indicator_type,created_at";

export function listTechnicalEntities(client: SupabaseClient, limit = 150) {
  return client
    .from("technical_entities")
    .select(entityProjection)
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 300));
}

export function listTechnicalEntitiesForKinds(client: SupabaseClient, kinds: string[], limit = 500) {
  if (!kinds.length) return Promise.resolve({ data: [], error: null });
  return client
    .from("technical_entities")
    .select(entityProjection)
    .in("entity_kind", [...new Set(kinds)].slice(0, 13))
    .eq("status", "ACTIVE")
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));
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

export function listTechnicalEntityResolutionsForAssertions(client: SupabaseClient, assertionIds: string[]) {
  if (!assertionIds.length) return Promise.resolve({ data: [], error: null });
  return client
    .from("technical_entity_assertion_resolutions")
    .select("id,assertion_id,entity_kind,entity_id,alias_id,status,basis,created_at,updated_at,resolved_at")
    .in("assertion_id", assertionIds.slice(0, 500));
}

export async function listTechnicalEntityAssertions(client: SupabaseClient, limit = 500) {
  const boundedLimit = Math.min(Math.max(limit, 1), 500);

  // Resolution Control is a decision queue, not a historical assertion browser.
  // Prioritize the actual NEEDS_REVIEW backlog first so old analyst decisions are not
  // hidden, then fill the remaining bounded window with the newest assertions so fresh
  // post-sync cases are visible immediately. The previous oldest-first LIMIT 500 window
  // permanently hid new cases once the table exceeded 500 rows.
  const reviewResolutionResult = await client
    .from("technical_entity_assertion_resolutions")
    .select("assertion_id,updated_at")
    .eq("status", "NEEDS_REVIEW")
    .order("updated_at", { ascending: false })
    .limit(boundedLimit);

  if (reviewResolutionResult.error) return { data: null, error: reviewResolutionResult.error };

  const reviewIds = [...new Set((reviewResolutionResult.data ?? []).map((row) => String(row.assertion_id)).filter(Boolean))];
  const reviewRank = new Map(reviewIds.map((id, index) => [id, index]));
  let reviewAssertions: Array<Record<string, unknown>> = [];

  if (reviewIds.length) {
    const reviewAssertionResult = await client
      .from("technical_signal_entity_assertions")
      .select(assertionProjection)
      .in("id", reviewIds.slice(0, boundedLimit));
    if (reviewAssertionResult.error) return { data: null, error: reviewAssertionResult.error };
    reviewAssertions = ((reviewAssertionResult.data ?? []) as Array<Record<string, unknown>>)
      .sort((left, right) => (reviewRank.get(String(left.id)) ?? Number.MAX_SAFE_INTEGER) - (reviewRank.get(String(right.id)) ?? Number.MAX_SAFE_INTEGER));
  }

  if (reviewAssertions.length >= boundedLimit) return { data: reviewAssertions.slice(0, boundedLimit), error: null };

  const latestAssertionResult = await client
    .from("technical_signal_entity_assertions")
    .select(assertionProjection)
    .order("created_at", { ascending: false })
    .limit(boundedLimit);
  if (latestAssertionResult.error) return { data: null, error: latestAssertionResult.error };

  const seen = new Set(reviewAssertions.map((row) => String(row.id)));
  const data = [...reviewAssertions];
  for (const row of (latestAssertionResult.data ?? []) as Array<Record<string, unknown>>) {
    const id = String(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    data.push(row);
    if (data.length >= boundedLimit) break;
  }

  return { data, error: null };
}

export function listTechnicalEntityAssertionsByIds(client: SupabaseClient, assertionIds: string[]) {
  if (!assertionIds.length) return Promise.resolve({ data: [], error: null });
  return client
    .from("technical_signal_entity_assertions")
    .select(assertionProjection)
    .in("id", assertionIds.slice(0, 500));
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
