import "server-only";

import { z } from "zod";
import { indicatorCanonicalKey } from "@/lib/techint/signals/canonical-key";
import type { JsonValue } from "@/lib/techint/signals/schema";
import { fetchThreatFoxIocs } from "@/lib/ioc-connectors/providers/threatfox/client";
import { decimalProviderId } from "@/lib/ioc-connectors/providers/threatfox/cursor";
import { ThreatFoxError } from "@/lib/ioc-connectors/providers/threatfox/errors";
import { mapThreatFoxItem, ThreatFoxMappingError } from "@/lib/ioc-connectors/providers/threatfox/mapping";
import type { NormalizedCandidate } from "@/lib/ioc-connectors/types";
import { CollectionError } from "../errors";
import { bounded, canonicalInstant, safeIssue } from "../mapping";
import { threatFoxTechIntCursorSchema } from "../schema";
import type { AdapterCollectionResult, MappedTechnicalSignal, TechnicalSourceAdapter } from "../types";

const MAX_ITEMS = 1000;

function indicatorType(candidate: NormalizedCandidate): "IP" | "DOMAIN" | "URL" {
  if (candidate.candidate_type === "IPV4" || candidate.candidate_type === "IPV6") return "IP";
  if (candidate.candidate_type === "DOMAIN" || candidate.candidate_type === "HOSTNAME") return "DOMAIN";
  if (candidate.candidate_type === "URL") return "URL";
  throw new Error("UNSUPPORTED_TECHINT_THREATFOX_TYPE");
}

function safeProviderUrl(value: string | null, id: string) {
  if (value) {
    try {
      const url = new URL(value);
      if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password && value.length <= 2048) return url.toString();
    } catch {
      // Fall through to the fixed public ThreatFox item page.
    }
  }
  return `https://threatfox.abuse.ch/ioc/${encodeURIComponent(id)}/`;
}

function threatFoxCollectionError(error: unknown): CollectionError {
  if (!(error instanceof ThreatFoxError)) {
    return new CollectionError("COLLECTION_FAILED", "ThreatFox collection failed safely.");
  }
  if (["THREATFOX_CREDENTIAL_REQUIRED", "THREATFOX_CREDENTIAL_INVALID", "THREATFOX_AUTH_FAILED"].includes(error.code)) {
    return new CollectionError("SOURCE_NOT_AVAILABLE", "ThreatFox rejected or cannot access the configured Auth-Key. Update it in Technical Sources.", null, error.code);
  }
  if (error.code === "THREATFOX_RATE_LIMITED") {
    return new CollectionError("RATE_LIMITED", "ThreatFox rate-limited this collection attempt.", null, error.code);
  }
  if (error.code === "THREATFOX_TIMEOUT") {
    return new CollectionError("HTTP_TIMEOUT", "ThreatFox did not respond within the bounded request window.", null, error.code);
  }
  if (error.code === "THREATFOX_RESPONSE_TOO_LARGE") {
    return new CollectionError("HTTP_BODY_TOO_LARGE", "ThreatFox returned a response larger than the configured safety bound.", null, error.code);
  }
  if (["THREATFOX_INVALID_JSON", "THREATFOX_INVALID_RESPONSE", "THREATFOX_QUERY_FAILED"].includes(error.code)) {
    return new CollectionError("INVALID_SOURCE_RESPONSE", "ThreatFox returned an invalid IOC response.", null, error.code);
  }
  if (error.code === "THREATFOX_ITEM_LIMIT") {
    return new CollectionError("ITEM_LIMIT_EXCEEDED", "ThreatFox exceeded the bounded item limit.", null, error.code);
  }
  if (error.code === "THREATFOX_HTTP_ERROR") {
    return new CollectionError("HTTP_STATUS", "ThreatFox returned an unsuccessful HTTP response.", null, error.code);
  }
  return new CollectionError("COLLECTION_FAILED", "ThreatFox collection failed safely.", null, error.code);
}

export function threatFoxHighWaterForWindow(rawCursor: unknown, lookbackDays: number) {
  const cursor = threatFoxTechIntCursorSchema.parse(rawCursor);
  if (cursor.lookbackDays !== lookbackDays || !cursor.maxProviderId) return BigInt(0);
  return BigInt(cursor.maxProviderId);
}

export function mapThreatFoxCandidate(candidate: NormalizedCandidate, receivedAt: string): MappedTechnicalSignal {
  const type = indicatorType(candidate);
  if (candidate.normalized_value.length > 500) throw new Error("THREATFOX_INDICATOR_TOO_LONG");
  const canonicalKey = indicatorCanonicalKey(type, candidate.normalized_value);
  const firstSeen = candidate.first_seen_at ? canonicalInstant(candidate.first_seen_at) : null;
  const lastSeen = candidate.last_seen_at ? canonicalInstant(candidate.last_seen_at) : null;
  const effectiveAt = lastSeen ?? firstSeen ?? receivedAt;
  const facts = { indicatorType: type, indicatorValue: candidate.normalized_value };
  const sourceSnapshot = {
    ...facts,
    providerItemId: candidate.provider_item_id,
    originalValue: bounded(candidate.original_value, 1000),
    networkPort: candidate.network_port,
    threatType: candidate.threat_type ? bounded(candidate.threat_type, 500) : null,
    malwareFamily: candidate.malware_family ? bounded(candidate.malware_family, 500) : null,
    providerConfidence: candidate.confidence_score,
    firstSeen,
    lastSeen,
    tags: candidate.tags.slice(0, 50).map((tag) => bounded(tag, 100)),
    metadata: candidate.metadata as Record<string, JsonValue>,
  };
  const assertions: MappedTechnicalSignal["entityAssertions"] = [
    {
      entityKind: "INDICATOR",
      displayValue: bounded(candidate.original_value, 500),
      normalizedValue: candidate.normalized_value,
      semanticRole: "SUBJECT",
      assertionBasis: "PROVIDER_ASSERTED",
      confidence: candidate.confidence_score,
      indicatorType: type,
    },
  ];
  if (candidate.malware_family) {
    assertions.push({
      entityKind: "MALWARE",
      displayValue: bounded(candidate.malware_family, 500),
      normalizedValue: bounded(candidate.malware_family, 500),
      semanticRole: "RELATED_TO",
      assertionBasis: "PROVIDER_ASSERTED",
      confidence: candidate.confidence_score,
    });
  }
  return {
    signal: {
      signalType: "IOC_OBSERVATION",
      canonicalKey,
      title: bounded(`IOC observation: ${type} ${candidate.normalized_value}`, 500),
      summary: "A source-backed IOC observation collected from a fixed technical provider.",
      lifecycle: "ACTIVE",
      severity: "UNKNOWN",
      confidence: null,
      facts,
      publishedAt: firstSeen,
      observedAt: lastSeen ?? firstSeen,
      effectiveAt,
    },
    observation: {
      sourceFamily: "IOC_PROVIDER",
      sourceSystem: "threatfox",
      sourceRecordKey: candidate.provider_item_id,
      sourceRevisionKey: candidate.source_fingerprint.slice(0, 200),
      sourceUrl: safeProviderUrl(candidate.provider_reference_url, candidate.provider_item_id),
      sourceTitle: bounded(`ThreatFox IOC ${candidate.provider_item_id}`, 500),
      sourcePublishedAt: firstSeen,
      sourceModifiedAt: lastSeen,
      sourceObservedAt: lastSeen ?? firstSeen,
      receivedAt,
      effectiveAt,
      sourceSnapshot,
    },
    entityAssertions: assertions,
  };
}

export const threatFoxTechnicalAdapter: TechnicalSourceAdapter = {
  metadata: {
    key: "THREATFOX",
    displayName: "ThreatFox → TechINT",
    description: "Uses an encrypted server-side ThreatFox Auth-Key configured directly in Technical Sources to emit source-backed IOC Technical Signals.",
    sourceFamily: "IOC_PROVIDER",
    defaultIntervalMinutes: 120,
    minimumIntervalMinutes: 60,
    maximumIntervalMinutes: 1440,
    manual: true,
    scheduled: true,
    credentialRequirement: "TECHINT_MANAGED_CREDENTIAL",
    fixedHosts: ["threatfox-api.abuse.ch"],
    settingsFields: [{ name: "lookbackDays", label: "Lookback days", type: "integer", minimum: 1, maximum: 7, defaultValue: 1 }],
  },
  async collect(context): Promise<AdapterCollectionResult> {
    if (!context.credential) {
      throw new CollectionError("SOURCE_NOT_AVAILABLE", "Configure the ThreatFox Auth-Key in Technical Sources before synchronizing.");
    }
    const cursor = threatFoxTechIntCursorSchema.parse(context.cursor);
    const settings = z.object({ lookbackDays: z.number().int().min(1).max(7).optional().default(1) }).strict().parse(context.settings);
    let raw: unknown;
    try {
      raw = await fetchThreatFoxIocs(context.credential, settings.lookbackDays);
    } catch (error) {
      throw threatFoxCollectionError(error);
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new CollectionError("INVALID_SOURCE_RESPONSE", "ThreatFox returned an invalid response.");
    }
    const response = raw as { query_status?: unknown; data?: unknown };
    if (response.query_status !== "ok" || !Array.isArray(response.data)) {
      throw new CollectionError("INVALID_SOURCE_RESPONSE", "ThreatFox did not return an IOC data set.");
    }
    if (response.data.length > MAX_ITEMS) throw new CollectionError("ITEM_LIMIT_EXCEEDED", "ThreatFox exceeded the bounded item limit.");

    const zero = BigInt(0);
    const currentMax = threatFoxHighWaterForWindow(cursor, settings.lookbackDays);
    let nextMax = currentMax;
    const eligible: unknown[] = [];
    for (const item of response.data) {
      const id = item && typeof item === "object" && !Array.isArray(item) ? decimalProviderId((item as { id?: unknown }).id) : null;
      if (!id) continue;
      const numeric = BigInt(id);
      if (numeric > nextMax) nextMax = numeric;
      if (numeric > currentMax) eligible.push(item);
    }

    const signals: MappedTechnicalSignal[] = [];
    const issues = [];
    const receivedAt = context.now.toISOString();
    for (const item of eligible) {
      try {
        signals.push(mapThreatFoxCandidate(mapThreatFoxItem(item), receivedAt));
      } catch (error) {
        const rawId = item && typeof item === "object" && !Array.isArray(item) ? decimalProviderId((item as { id?: unknown }).id) : null;
        const code = error instanceof ThreatFoxMappingError ? `THREATFOX_${error.reason}` : "INVALID_THREATFOX_RECORD";
        issues.push(safeIssue(code, "A ThreatFox record was skipped before Technical Signal recording.", rawId));
      }
    }

    return {
      recordsSeen: eligible.length,
      recordsMapped: signals.length,
      signals,
      issues: issues.slice(0, 100),
      nextCursor: {
        version: 1,
        lookbackDays: settings.lookbackDays,
        ...(nextMax > zero ? { maxProviderId: nextMax.toString() } : {}),
      },
    };
  },
};
