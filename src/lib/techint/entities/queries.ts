import type { SupabaseClient } from "@supabase/supabase-js";

const entityProjection = "id,entity_kind,canonical_name,canonical_normalized,deterministic_key,indicator_type,origin,status,created_at,updated_at,archived_at";
const assertionProjection = "id,signal_id,source_observation_id,entity_kind,display_value,normalized_value,semantic_role,assertion_basis,confidence,indicator_type,created_at";
const resolutionProjection = "id,assertion_id,entity_kind,entity_id,alias_id,status,basis,created_at,updated_at,resolved_at";
const ID_QUERY_CHUNK = 200;

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
    .select(resolutionProjection)
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));
}

export async function listTechnicalEntityResolutionsForAssertions(client: SupabaseClient, assertionIds: string[]) {
  const ids = [...new Set(assertionIds.filter(Boolean))];
  if (!ids.length) return { data: [], error: null };

  const data: Array<Record<string, unknown>> = [];
  for (let index = 0; index < ids.length; index += ID_QUERY_CHUNK) {
    const result = await client
      .from("technical_entity_assertion_resolutions")
      .select(resolutionProjection)
      .in("assertion_id", ids.slice(index, index + ID_QUERY_CHUNK));
    if (result.error) return { data: null, error: result.error };
    data.push(...((result.data ?? []) as Array<Record<string, unknown>>));
  }
  return { data, error: null };
}

export async function listTechnicalEntityAssertions(client: SupabaseClient, limit = 500) {
  const pageSize = Math.min(Math.max(limit, 1), 500);

  // Resolution Control must represent the full analyst-review queue. Keep each PostgREST
  // request bounded, but page through every NEEDS_REVIEW resolution instead of treating
  // 500 rows as a global queue ceiling.
  const reviewIds: string[] = [];
  const seenReviewIds = new Set<string>();
  for (let offset = 0; ; offset += pageSize) {
    const reviewResolutionResult = await client
      .from("technical_entity_assertion_resolutions")
      .select("assertion_id,updated_at")
      .eq("status", "NEEDS_REVIEW")
      .order("updated_at", { ascending: false })
      .order("assertion_id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (reviewResolutionResult.error) return { data: null, error: reviewResolutionResult.error };
    const rows = reviewResolutionResult.data ?? [];
    for (const row of rows) {
      const id = String(row.assertion_id ?? "");
      if (!id || seenReviewIds.has(id)) continue;
      seenReviewIds.add(id);
      reviewIds.push(id);
    }
    if (rows.length < pageSize) break;
  }

  const reviewRank = new Map(reviewIds.map((id, index) => [id, index]));
  const reviewAssertions: Array<Record<string, unknown>> = [];
  for (let index = 0; index < reviewIds.length; index += ID_QUERY_CHUNK) {
    const reviewAssertionResult = await client
      .from("technical_signal_entity_assertions")
      .select(assertionProjection)
      .in("id", reviewIds.slice(index, index + ID_QUERY_CHUNK));
    if (reviewAssertionResult.error) return { data: null, error: reviewAssertionResult.error };
    reviewAssertions.push(...((reviewAssertionResult.data ?? []) as Array<Record<string, unknown>>));
  }
  reviewAssertions.sort(
    (left, right) =>
      (reviewRank.get(String(left.id)) ?? Number.MAX_SAFE_INTEGER) -
      (reviewRank.get(String(right.id)) ?? Number.MAX_SAFE_INTEGER),
  );

  // Also include one bounded slice of the newest assertions. Normally post-sync
  // reconciliation has already assigned them a resolution status; retaining this slice
  // keeps recovery visibility for a freshly written assertion if post-processing failed.
  const latestAssertionResult = await client
    .from("technical_signal_entity_assertions")
    .select(assertionProjection)
    .order("created_at", { ascending: false })
    .limit(pageSize);
  if (latestAssertionResult.error) return { data: null, error: latestAssertionResult.error };

  const seen = new Set(reviewAssertions.map((row) => String(row.id)));
  const data = [...reviewAssertions];
  for (const row of (latestAssertionResult.data ?? []) as Array<Record<string, unknown>>) {
    const id = String(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    data.push(row);
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
