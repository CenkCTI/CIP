import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GlobalPriorityLevel } from "@/lib/techint/priority/engine";
import type { ProfileMatchQuality, ProfileRelevanceLevel } from "@/lib/techint/matching/engine";
import type { TechnicalProfileMatchLifecycle } from "./schema";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;
const PENDING_ASSERTION_DETAIL_LIMIT = 250;

type SignalRow = {
  id: string;
  title: string;
  summary: string;
  signal_type: string;
  lifecycle: string;
  severity: string;
  first_seen_at: string;
  last_seen_at: string;
  updated_at: string;
};

type PriorityRow = {
  id: string;
  signal_id: string;
  priority: GlobalPriorityLevel;
  internal_score: number;
  reason_codes: string[];
  source_systems: string[];
  context_snapshot: Record<string, unknown>;
  engine_version: string;
  evaluated_at: string;
};

type MatchRow = {
  id: string;
  signal_id: string;
  profile_id: string;
  relevance: ProfileRelevanceLevel;
  match_quality: ProfileMatchQuality;
  lifecycle: TechnicalProfileMatchLifecycle;
  internal_score: number;
  reason_codes: string[];
  matched_profile_item_ids: string[];
  matched_entity_ids: string[];
  matched_assertion_ids: string[];
  pending_assertion_ids: string[];
  matched_evidence_count: number;
  pending_identity_count: number;
  snoozed_until: string | null;
  engine_version: string;
  first_matched_at: string;
  last_matched_at: string;
  evaluated_at: string;
};

export type GlobalAgendaItem = PriorityRow & { signal: SignalRow };
export type PendingIdentity = { id: string; entityKind: string; displayValue: string };
export type ProfileFeedItem = MatchRow & {
  signal: SignalRow;
  globalPriority: PriorityRow | null;
  pendingIdentities: PendingIdentity[];
};

function pagination(page: number, pageSize: number) {
  const safePage = Number.isInteger(page) && page >= 0 ? page : 0;
  const safeSize = Number.isInteger(pageSize) ? Math.max(1, Math.min(MAX_PAGE_SIZE, pageSize)) : DEFAULT_PAGE_SIZE;
  return { page: safePage, pageSize: safeSize, from: safePage * safeSize, to: safePage * safeSize + safeSize - 1 };
}

export async function listGlobalTechnicalAgenda(
  supabase: SupabaseClient,
  options: { page?: number; pageSize?: number } = {},
) {
  const bounds = pagination(options.page ?? 0, options.pageSize ?? DEFAULT_PAGE_SIZE);
  const { data, error, count } = await supabase
    .from("technical_signal_global_priorities")
    .select("id,signal_id,priority,internal_score,reason_codes,source_systems,context_snapshot,engine_version,evaluated_at", { count: "exact" })
    .order("internal_score", { ascending: false })
    .order("evaluated_at", { ascending: false })
    .range(bounds.from, bounds.to);
  if (error) return { items: [] as GlobalAgendaItem[], total: 0, ...bounds, error };

  const priorities = (data ?? []) as PriorityRow[];
  const signalIds = priorities.map((row) => row.signal_id);
  if (!signalIds.length) return { items: [] as GlobalAgendaItem[], total: count ?? 0, ...bounds, error: null };

  const { data: signalData, error: signalError } = await supabase
    .from("technical_signals")
    .select("id,title,summary,signal_type,lifecycle,severity,first_seen_at,last_seen_at,updated_at")
    .in("id", signalIds);
  if (signalError) return { items: [] as GlobalAgendaItem[], total: count ?? 0, ...bounds, error: signalError };

  const signals = new Map(((signalData ?? []) as SignalRow[]).map((signal) => [signal.id, signal]));
  const items = priorities.flatMap((priority) => {
    const signal = signals.get(priority.signal_id);
    return signal ? [{ ...priority, signal }] : [];
  });
  return { items, total: count ?? items.length, ...bounds, error: null };
}

export async function listIntelProfileSignalFeed(
  supabase: SupabaseClient,
  profileId: string,
  options: { page?: number; pageSize?: number } = {},
) {
  const bounds = pagination(options.page ?? 0, options.pageSize ?? DEFAULT_PAGE_SIZE);
  const { data, error, count } = await supabase
    .from("technical_signal_profile_matches")
    .select("id,signal_id,profile_id,relevance,match_quality,lifecycle,internal_score,reason_codes,matched_profile_item_ids,matched_entity_ids,matched_assertion_ids,pending_assertion_ids,matched_evidence_count,pending_identity_count,snoozed_until,engine_version,first_matched_at,last_matched_at,evaluated_at", { count: "exact" })
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .order("internal_score", { ascending: false })
    .order("last_matched_at", { ascending: false })
    .range(bounds.from, bounds.to);
  if (error) return { items: [] as ProfileFeedItem[], total: 0, ...bounds, error };

  const matches = (data ?? []) as MatchRow[];
  const signalIds = [...new Set(matches.map((row) => row.signal_id))];
  if (!signalIds.length) return { items: [] as ProfileFeedItem[], total: count ?? 0, ...bounds, error: null };

  const [signalsResult, prioritiesResult] = await Promise.all([
    supabase.from("technical_signals").select("id,title,summary,signal_type,lifecycle,severity,first_seen_at,last_seen_at,updated_at").in("id", signalIds),
    supabase.from("technical_signal_global_priorities").select("id,signal_id,priority,internal_score,reason_codes,source_systems,context_snapshot,engine_version,evaluated_at").in("signal_id", signalIds),
  ]);
  if (signalsResult.error) return { items: [] as ProfileFeedItem[], total: count ?? 0, ...bounds, error: signalsResult.error };

  const pendingIds = [...new Set(matches.flatMap((match) => match.pending_assertion_ids ?? []))].slice(0, PENDING_ASSERTION_DETAIL_LIMIT);
  const pendingResult = pendingIds.length
    ? await supabase.from("technical_signal_entity_assertions").select("id,entity_kind,display_value").in("id", pendingIds)
    : { data: [], error: null };

  const signals = new Map(((signalsResult.data ?? []) as SignalRow[]).map((signal) => [signal.id, signal]));
  const priorities = new Map(((prioritiesResult.data ?? []) as PriorityRow[]).map((priority) => [priority.signal_id, priority]));
  const pending = new Map(
    ((pendingResult.data ?? []) as Array<{ id: string; entity_kind: string; display_value: string }>).map((row) => [
      row.id,
      { id: row.id, entityKind: row.entity_kind, displayValue: row.display_value } satisfies PendingIdentity,
    ]),
  );

  const items = matches.flatMap((match) => {
    const signal = signals.get(match.signal_id);
    if (!signal) return [];
    return [{
      ...match,
      signal,
      globalPriority: priorities.get(match.signal_id) ?? null,
      pendingIdentities: (match.pending_assertion_ids ?? []).flatMap((id) => pending.get(id) ? [pending.get(id)!] : []),
    }];
  });

  return { items, total: count ?? items.length, ...bounds, error: null };
}
