import "server-only";
import type { IocProviderAdapter, NormalizedCandidate, ProviderSkipReason } from "../../types";
import { fetchThreatFoxIocs, testThreatFoxConnection } from "./client";
import { ThreatFoxError } from "./errors";
import { mapThreatFoxItem, ThreatFoxMappingError } from "./mapping";

const MAX_ITEMS = 1000;
type Mapper = typeof mapThreatFoxItem;
export function mapThreatFoxWindow(data: unknown[], mapper: Mapper = mapThreatFoxItem) {
  if (data.length > MAX_ITEMS) throw new ThreatFoxError("THREATFOX_ITEM_LIMIT", false, undefined, { received_count: data.length });
  const mapped: NormalizedCandidate[] = [];
  const skipped: Array<{ provider_skip_reason: ProviderSkipReason }> = [];
  const skipReasonCounts: Partial<Record<ProviderSkipReason, number>> = {};
  for (const rawItem of data) {
    try { mapped.push(mapper(rawItem)); }
    catch (error) {
      if (!(error instanceof ThreatFoxMappingError)) throw error;
      skipped.push({ provider_skip_reason: error.reason });
      skipReasonCounts[error.reason] = (skipReasonCounts[error.reason] ?? 0) + 1;
    }
  }
  if (data.length > 0 && mapped.length === 0) throw new ThreatFoxError("THREATFOX_MAPPING_FAILED", false, undefined, { received_count: data.length, mapping_skipped_count: skipped.length, skip_reason_counts: skipReasonCounts });
  return { mapped, skipped, diagnostics: { received_count: data.length, mapped_count: mapped.length, mapping_skipped_count: skipped.length, skip_reason_counts: skipReasonCounts } };
}

export function buildThreatFoxResult(data: unknown[], mapper: Mapper = mapThreatFoxItem) {
  const { mapped, skipped, diagnostics } = mapThreatFoxWindow(data, mapper);
  const first = mapped.map(item => item.first_seen_at).filter(Boolean).sort().at(-1) ?? null;
  const ids = mapped.map(item => Number(item.provider_item_id)).filter(Number.isFinite);
  return { status: "SUCCEEDED" as const, items: [...mapped, ...skipped], diagnostics, nextCursor: JSON.stringify({ schema_version: 1, max_id: ids.length ? Math.max(...ids) : null, max_first_seen: first }) };
}

export const threatFoxAdapter: IocProviderAdapter = {
  key: "THREATFOX", displayName: "ThreatFox Community API", credentialRequired: true,
  supportedTypes: ["DOMAIN", "IPV4", "IPV6", "URL"], supportsScheduling: true, testConnection: testThreatFoxConnection,
  async sync({ credential, settings, signal }) {
    if (!credential) throw new ThreatFoxError("THREATFOX_CREDENTIAL_REQUIRED");
    const raw = await fetchThreatFoxIocs(credential, Number(settings.lookback_days ?? 1), signal);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ThreatFoxError("THREATFOX_INVALID_RESPONSE");
    const response = raw as { query_status?: unknown; data?: unknown };
    if (typeof response.query_status !== "string" || response.query_status.length > 100) throw new ThreatFoxError("THREATFOX_INVALID_RESPONSE");
    if (response.query_status !== "ok") throw new ThreatFoxError("THREATFOX_QUERY_FAILED");
    if (!Array.isArray(response.data)) throw new ThreatFoxError("THREATFOX_INVALID_RESPONSE");
    return buildThreatFoxResult(response.data);
  },
};
