import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { advisoryCanonicalKey, attackCanonicalKey, indicatorCanonicalKey, normalizeCve, reportCanonicalKey, validateCanonicalKey, vulnerabilityCanonicalKey } from "./canonical-key";
import { jsonValueSchema, recordTechnicalSignalResultSchema, recordTechnicalSignalSchema } from "./schema";
import { signalTypes } from "./types";

const input = { actorId: "10000000-0000-4000-8000-000000000001", signal: { signalType: "VULNERABILITY_CHANGE", canonicalKey: "cve:CVE-2026-1234", title: "Changed", summary: "", lifecycle: "ACTIVE", severity: "HIGH", confidence: 80, facts: {}, publishedAt: null, observedAt: null, effectiveAt: "2026-08-05T00:00:00Z" }, observation: { sourceFamily: "MANUAL_TEST", sourceSystem: "synthetic", sourceRecordKey: "one", sourceRevisionKey: null, sourceUrl: "https://example.test/Case?Q=UP", sourceTitle: null, sourcePublishedAt: null, sourceModifiedAt: null, sourceObservedAt: null, receivedAt: "2026-08-05T00:01:00Z", effectiveAt: "2026-08-05T00:00:00Z", sourceSnapshot: {} }, entityAssertions: [] } as const;

class UnsupportedClass { value = "not plain"; }

describe("provider-independent Technical Signal helpers", () => {
  it("normalizes and validates every canonical identity family", () => {
    expect(normalizeCve("cve2026-1234")).toBe("CVE-2026-1234");
    expect(vulnerabilityCanonicalKey("CVE-2026-1234")).toBe("cve:CVE-2026-1234");
    expect(attackCanonicalKey("t1059.001")).toBe("attack:T1059.001");
    expect(reportCanonicalKey(" Vendor ", "Case/UP")).toBe("report:vendor:Case/UP");
    expect(advisoryCanonicalKey("Vendor", "ADV-1")).toBe("advisory:vendor:ADV-1");
    expect(validateCanonicalKey("TTP_UPDATE", "attack:T1059.001")).toBeTruthy();
    expect(() => validateCanonicalKey("VULNERABILITY_CHANGE", "cve:cve-2026-1234")).toThrow();
  });

  it("validates Indicators while preserving URL path and query case", () => {
    expect(indicatorCanonicalKey("DOMAIN", "EXAMPLE.COM")).toBe("indicator:DOMAIN:example.com");
    expect(indicatorCanonicalKey("URL", "https://Example.com/Case?Q=UP")).toContain("/Case?Q=UP");
    expect(() => indicatorCanonicalKey("IP", "not-ip")).toThrow();
  });

  it("accepts only recursive plain JSON-compatible values", () => {
    expect(jsonValueSchema.safeParse({ nested: [null, true, 1.25, "Zażółć 🛡️", { items: [1, 2] }] }).success).toBe(true);
    expect(jsonValueSchema.safeParse(Object.assign(Object.create(null), { valid: "value" })).success).toBe(true);
    for (const invalid of [NaN, Infinity, -Infinity, BigInt(1), new Date(), new Map(), new Set(), Buffer.from("x"), new Uint8Array([1]), new UnsupportedClass(), { missing: undefined }]) {
      expect(() => jsonValueSchema.safeParse(invalid)).not.toThrow();
      expect(jsonValueSchema.safeParse(invalid).success).toBe(false);
    }
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => jsonValueSchema.safeParse(circular)).not.toThrow();
    expect(jsonValueSchema.safeParse(circular).success).toBe(false);
  });

  it("strictly bounds trusted inputs and fails invalid JSON without throwing", () => {
    expect(recordTechnicalSignalSchema.safeParse(input).success).toBe(true);
    expect(recordTechnicalSignalSchema.safeParse({ ...input, extra: true }).success).toBe(false);
    expect(recordTechnicalSignalSchema.safeParse({ ...input, signal: { ...input.signal, facts: { x: "x".repeat(66_000) } } }).success).toBe(false);
    expect(() => recordTechnicalSignalSchema.safeParse({ ...input, signal: { ...input.signal, facts: { value: BigInt(1) } } })).not.toThrow();
    expect(recordTechnicalSignalSchema.safeParse({ ...input, signal: { ...input.signal, facts: { value: BigInt(1) } } }).success).toBe(false);
  });

  it("rejects unsafe URLs, reserved assertion bases, and effective-time mismatch", () => {
    expect(recordTechnicalSignalSchema.safeParse({ ...input, observation: { ...input.observation, sourceUrl: "https://u:p@example.test/x" } }).success).toBe(false);
    expect(recordTechnicalSignalSchema.safeParse({ ...input, observation: { ...input.observation, effectiveAt: "2026-08-05T00:00:01Z" } }).success).toBe(false);
    expect(recordTechnicalSignalSchema.safeParse({ ...input, entityAssertions: [{ entityKind: "TAG", displayValue: "x", normalizedValue: "x", semanticRole: "MENTIONS", assertionBasis: "AI_SUGGESTED" }] }).success).toBe(false);
  });

  it("strictly validates the controlled RPC result", () => {
    const valid = { signal_id: input.actorId, observation_id: "20000000-0000-4000-8000-000000000001", revision_id: null, signal_created: false, observation_created: false, revision_created: false, duplicate_observation: true, disposition: "SUPPORTING", current_revision_number: 1, entity_assertions_created: 0 };
    expect(recordTechnicalSignalResultSchema.safeParse(valid).success).toBe(true);
    expect(recordTechnicalSignalResultSchema.safeParse({ ...valid, current_revision_number: 0 }).success).toBe(false);
    expect(recordTechnicalSignalResultSchema.safeParse({ ...valid, internal: "leak" }).success).toBe(false);
  });

  it("contains only provider-independent signal types", () => {
    expect(signalTypes).toContain("TECHNICAL_REPORT");
    expect(signalTypes.join(" ")).not.toMatch(/THREATFOX|OTX|NVD|KEV/);
  });

  it("keeps the trusted client server-only and free of provider, network, and AI adapters", () => {
    const source = readFileSync("src/lib/techint/signals/trusted-signal-client.ts", "utf8");
    expect(source).toMatch(/^import "server-only";/);
    expect(source).not.toMatch(/fetch\(|ThreatFox|OTX|openai|anthropic/i);
    expect(source).not.toMatch(/fingerprint|observationKey/);
  });
});
