import { describe, expect, it } from "vitest";
import { decodeIocCursor, encodeIocCursor, inboxQuery, iocInboxSchema } from "./schema";
describe("IOC Inbox query state", () => {
  it("validates every filter and preserves it in pagination", () => { const filters = iocInboxSchema.parse({ view: "iocs", ioc_q: "example", ioc_status: "NEW", ioc_type: "DOMAIN", ioc_provider: "10000000-0000-4000-8000-000000000001", ioc_sort: "confidence", ioc_min_confidence: "20", ioc_max_confidence: "90", ioc_port: "absent", ioc_project: "20000000-0000-4000-8000-000000000001" }); const cursor = encodeIocCursor({ sort: "confidence", value: 50, id: "30000000-0000-4000-8000-000000000001" }); const url = inboxQuery(filters, cursor); expect(url).toContain("ioc_provider=10000000"); expect(url).toContain("ioc_sort=confidence"); expect(url).toContain("ioc_cursor="); expect(decodeIocCursor(cursor)).toEqual({ sort: "confidence", value: 50, id: "30000000-0000-4000-8000-000000000001" }); });
  it("rejects malformed filters and cursors", () => { expect(iocInboxSchema.safeParse({ view: "iocs", ioc_sort: "offset" }).success).toBe(false); expect(decodeIocCursor("not-a-cursor")).toBeNull(); });
});

import { adapterResultSchema } from "./schema";

const normalizedThreatFoxCandidate = {
  provider_item_id: "fixture-1", candidate_type: "DOMAIN" as const, normalized_value: "fixture.example",
  original_value: "fixture.example", network_port: null, provider_reference_url: null, threat_type: null,
  malware_family: null, confidence_score: 50, first_seen_at: "2026-08-01T07:35:20.000Z",
  last_seen_at: null, tags: ["THREATFOX"], metadata: { ioc_type: "domain" }, source_fingerprint: "a".repeat(64),
};
const succeededWithReasons = (skip_reason_counts: Record<string, number>, items: unknown[] = [normalizedThreatFoxCandidate]) => ({
  status: "SUCCEEDED" as const, items,
  diagnostics: { received_count: items.length, mapped_count: 1, mapping_skipped_count: items.length - 1, skip_reason_counts },
});

describe("adapter result partial skip diagnostics", () => {
  it("accepts an empty partial reason record", () => expect(adapterResultSchema.parse(succeededWithReasons({})).diagnostics?.skip_reason_counts).toEqual({}));
  it("accepts one known reason", () => expect(adapterResultSchema.parse(succeededWithReasons({ INVALID_IP: 2 })).diagnostics?.skip_reason_counts).toEqual({ INVALID_IP: 2 }));
  it("accepts multiple known reasons", () => expect(adapterResultSchema.safeParse(succeededWithReasons({ INVALID_IP: 2, INVALID_DATE: 1 })).success).toBe(true));
  it("accepts the bounded temporal-order reason", () => expect(adapterResultSchema.safeParse(succeededWithReasons({ INVALID_DATE_ORDER: 1 })).success).toBe(true));
  it("rejects unknown reason keys", () => expect(adapterResultSchema.safeParse(succeededWithReasons({ UNKNOWN_REASON: 1 })).success).toBe(false));
  it.each([0, -1, 1.5, 1001])("rejects invalid reason count %s", count => expect(adapterResultSchema.safeParse(succeededWithReasons({ INVALID_IP: count })).success).toBe(false));
  it("allows diagnostics to be omitted for backward compatibility", () => expect(adapterResultSchema.safeParse({ status: "SUCCEEDED", items: [normalizedThreatFoxCandidate] }).success).toBe(true));
  it("accepts a mapped ThreatFox candidate with empty reasons", () => expect(adapterResultSchema.safeParse(succeededWithReasons({})).success).toBe(true));
  it("accepts a candidate plus a provider skip marker", () => expect(adapterResultSchema.safeParse(succeededWithReasons({ INVALID_IP: 1 }, [normalizedThreatFoxCandidate, { provider_skip_reason: "INVALID_IP" }])).success).toBe(true));
});
