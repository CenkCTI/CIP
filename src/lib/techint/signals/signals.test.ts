import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { attackCanonicalKey, canonicalSnapshotFingerprint, indicatorCanonicalKey, normalizeCveId, reportCanonicalKey, sourceObservationIdentity, technicalSignalInputSchema, recordTechnicalSignalInputSchema } from ".";

describe("Phase 2.3B technical signal helpers", () => {
  it("builds stable provider-independent canonical keys", () => {
    expect(normalizeCveId(" cve-2026-1234 ")).toBe("CVE-2026-1234");
    expect(attackCanonicalKey("t1059.001")).toBe("attack:T1059.001");
    expect(reportCanonicalKey("Manual_Test", "REC-1")).toBe("report:manual_test:REC-1");
  });
  it("normalizes indicator subtypes conservatively and preserves URL path/query case", () => {
    expect(indicatorCanonicalKey("DOMAIN", "Example.COM")).toBe("indicator:DOMAIN:example.com");
    expect(indicatorCanonicalKey("HASH", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe("indicator:HASH:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(indicatorCanonicalKey("URL", "HTTPS://Example.COM/CasePath?Token=ABC")).toBe("indicator:URL:https://example.com/CasePath?Token=ABC");
  });
  it("generates deterministic snapshot and observation fingerprints independent of object key order", () => {
    expect(canonicalSnapshotFingerprint({ b: 2, a: { d: 4, c: 3 } })).toBe(canonicalSnapshotFingerprint({ a: { c: 3, d: 4 }, b: 2 }));
    expect(sourceObservationIdentity({ sourceSystem: " Provider ", sourceRecordKey: "REC", sourceRevisionKey: "1", sourceFingerprint: "a".repeat(64) })).toBe(sourceObservationIdentity({ sourceSystem: "provider", sourceRecordKey: "REC", sourceRevisionKey: "1", sourceFingerprint: "a".repeat(64) }));
  });
  it("enforces strict Zod bounds and Phase 2.3B assertion basis", () => {
    expect(() => technicalSignalInputSchema.parse({ signal_type: "TECHNICAL_REPORT", canonical_key: "report:x:y", title: "x", effective_at: "2026-08-05T00:00:00Z", facts: { x: "a".repeat(70_000) } })).toThrow();
    expect(() => recordTechnicalSignalInputSchema.parse({ owner_id: "00000000-0000-0000-0000-000000000001", signal: { signal_type: "IOC_OBSERVATION", canonical_key: "indicator:URL:https://example.test/Path?Q=A", title: "t", effective_at: "2026-08-05T00:00:00Z" }, observation: { source_family: "MANUAL_TEST", source_system: "manual", source_record_key: "1", source_url: "https://user:pass@example.test" }, entity_assertions: [{ entity_kind: "TAG", display_value: "x", semantic_role: "MENTIONS", assertion_basis: "AI_SUGGESTED" }] })).toThrow();
  });
  it("keeps trusted client server-only and contains no provider/network/AI implementation", () => {
    const trusted = readFileSync("src/lib/techint/signals/trusted-signal-client.ts", "utf8");
    expect(trusted.startsWith('import "server-only";')).toBe(true);
    expect(trusted).toContain("record_technical_signal");
    const files = ["src/lib/techint/signals/canonical-key.ts", "src/lib/techint/signals/fingerprints.ts", "src/lib/techint/signals/schema.ts", "src/lib/techint/signals/trusted-signal-client.ts"].map((p) => readFileSync(p, "utf8")).join("\n");
    expect(files).not.toMatch(/ThreatFox|OTX|NVD|EPSS|KEV|fetch\(|XMLHttpRequest|openai|ai brief/i);
  });
});
