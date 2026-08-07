import "server-only";

import type { JsonValue } from "@/lib/techint/signals/schema";
import { syntheticCursorSchema } from "../schema";
import type { AdapterCollectionResult, MappedTechnicalSignal, TechnicalSourceAdapter } from "../types";

const receivedAt = "2099-01-03T00:00:00.000Z";

function observation(
  sourceRecordKey: string,
  sourceRevisionKey: string,
  effectiveAt: string,
  sourceSnapshot: Record<string, JsonValue>,
) {
  return {
    sourceFamily: "MANUAL_TEST" as const,
    sourceSystem: "test-synthetic",
    sourceRecordKey,
    sourceRevisionKey,
    sourceUrl: `https://example.test/techint/${sourceRecordKey}`,
    sourceTitle: "Deterministic test Technical Signal",
    sourcePublishedAt: effectiveAt,
    sourceModifiedAt: effectiveAt,
    sourceObservedAt: effectiveAt,
    receivedAt,
    effectiveAt,
    sourceSnapshot,
  };
}

function baseSignals(changed: boolean): MappedTechnicalSignal[] {
  const firstEffective = changed ? "2099-01-02T00:00:00.000Z" : "2099-01-01T00:00:00.000Z";
  const revision = changed ? "2" : "1";
  return [
    {
      signal: {
        signalType: "VULNERABILITY_CHANGE",
        canonicalKey: "cve:CVE-2099-10001",
        title: changed ? "Synthetic vulnerability state changed" : "Synthetic vulnerability published",
        summary: "Synthetic source record used only for deterministic TechINT acceptance.",
        lifecycle: "ACTIVE",
        severity: changed ? "CRITICAL" : "HIGH",
        confidence: null,
        facts: { synthetic: true, state: changed ? "changed" : "initial" },
        publishedAt: "2099-01-01T00:00:00.000Z",
        observedAt: firstEffective,
        effectiveAt: firstEffective,
      },
      observation: observation("CVE-2099-10001", revision, firstEffective, { synthetic: true, revision }),
      entityAssertions: [
        { entityKind: "CVE", displayValue: "CVE-2099-10001", normalizedValue: "CVE-2099-10001", semanticRole: "SUBJECT", assertionBasis: "PROVIDER_ASSERTED", confidence: null },
        { entityKind: "VENDOR", displayValue: "Example Vendor", normalizedValue: "Example Vendor", semanticRole: "AFFECTS", assertionBasis: "PROVIDER_ASSERTED", confidence: null },
        { entityKind: "PRODUCT", displayValue: "Example Product", normalizedValue: "Example Product", semanticRole: "AFFECTS", assertionBasis: "PROVIDER_ASSERTED", confidence: null },
      ],
    },
    {
      signal: {
        signalType: "ACTIVE_EXPLOITATION",
        canonicalKey: "cve:CVE-2099-10002",
        title: "Synthetic active exploitation",
        summary: "Synthetic known-exploitation record for collection acceptance.",
        lifecycle: "ACTIVE",
        severity: "UNKNOWN",
        confidence: null,
        facts: { synthetic: true, knownExploited: true },
        publishedAt: "2099-01-01T00:00:00.000Z",
        observedAt: "2099-01-01T00:00:00.000Z",
        effectiveAt: "2099-01-01T00:00:00.000Z",
      },
      observation: observation("CVE-2099-10002", "1", "2099-01-01T00:00:00.000Z", { synthetic: true, knownExploited: true }),
      entityAssertions: [
        { entityKind: "CVE", displayValue: "CVE-2099-10002", normalizedValue: "CVE-2099-10002", semanticRole: "SUBJECT", assertionBasis: "PROVIDER_ASSERTED", confidence: null },
      ],
    },
    {
      signal: {
        signalType: "TECHNICAL_ADVISORY",
        canonicalKey: "advisory:test-synthetic:advisory-001",
        title: "Synthetic technical advisory",
        summary: "Synthetic advisory content. This is not live intelligence.",
        lifecycle: "ACTIVE",
        severity: "INFO",
        confidence: null,
        facts: { synthetic: true, advisory: "advisory-001" },
        publishedAt: "2099-01-01T00:00:00.000Z",
        observedAt: "2099-01-01T00:00:00.000Z",
        effectiveAt: "2099-01-01T00:00:00.000Z",
      },
      observation: observation("advisory-001", "1", "2099-01-01T00:00:00.000Z", { synthetic: true, advisory: "advisory-001" }),
      entityAssertions: [
        { entityKind: "CVE", displayValue: "CVE-2099-10001", normalizedValue: "CVE-2099-10001", semanticRole: "MENTIONS", assertionBasis: "SYSTEM_EXTRACTED", confidence: null },
      ],
    },
    {
      signal: {
        signalType: "TTP_UPDATE",
        canonicalKey: "attack:T1059.001",
        title: "Synthetic ATT&CK technique update",
        summary: "Synthetic technique-shaped record used for deterministic validation.",
        lifecycle: "ACTIVE",
        severity: "INFO",
        confidence: null,
        facts: { synthetic: true, technique: "T1059.001" },
        publishedAt: "2099-01-01T00:00:00.000Z",
        observedAt: "2099-01-01T00:00:00.000Z",
        effectiveAt: "2099-01-01T00:00:00.000Z",
      },
      observation: observation("T1059.001", "1", "2099-01-01T00:00:00.000Z", { synthetic: true, technique: "T1059.001" }),
      entityAssertions: [
        { entityKind: "ATTACK_TECHNIQUE", displayValue: "T1059.001", normalizedValue: "T1059.001", semanticRole: "SUBJECT", assertionBasis: "PROVIDER_ASSERTED", confidence: null },
      ],
    },
  ];
}

export const testSyntheticAdapter: TechnicalSourceAdapter = {
  metadata: {
    key: "TEST_SYNTHETIC",
    displayName: "Deterministic Test Technical Source",
    description: "Local deterministic source for Preview acceptance. It performs no network requests and is not live intelligence.",
    sourceFamily: "MANUAL_TEST",
    defaultIntervalMinutes: 0,
    minimumIntervalMinutes: 0,
    maximumIntervalMinutes: 0,
    manual: true,
    scheduled: false,
    credentialRequirement: "NONE",
    fixedHosts: [],
    testSynthetic: true,
  },
  async collect(context): Promise<AdapterCollectionResult> {
    const cursor = syntheticCursorSchema.parse(context.cursor);
    const changed = cursor.sequence >= 2;
    const signals = baseSignals(changed);
    return {
      recordsSeen: signals.length,
      recordsMapped: signals.length,
      signals,
      issues: [],
      nextCursor: { version: 1, sequence: cursor.sequence + 1 },
    };
  },
};
