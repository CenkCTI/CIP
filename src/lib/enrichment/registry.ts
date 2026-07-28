import "server-only";

import { createFixtureProvider } from "@/lib/enrichment/providers/fixture";
import type { EnrichmentProvider, PublicEnrichmentProvider } from "@/lib/enrichment/types";

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function enabled(value: string | undefined) {
  return value === "true";
}

export function getEnrichmentConfig() {
  return {
    enabled: enabled(process.env.ENRICHMENT_ENABLED),
    fixtureEnabled: enabled(process.env.ENRICHMENT_FIXTURE_ENABLED),
    requestTimeoutMs: boundedInteger(process.env.ENRICHMENT_REQUEST_TIMEOUT_MS, 15000, 1000, 60000),
    cooldownSeconds: boundedInteger(process.env.ENRICHMENT_COOLDOWN_SECONDS, 60, 0, 86400),
    storeRawResponses: enabled(process.env.ENRICHMENT_STORE_RAW_RESPONSES),
    maxRawResponseBytes: boundedInteger(process.env.ENRICHMENT_MAX_RAW_RESPONSE_BYTES, 200000, 1000, 200000),
  };
}

function buildRegistry() {
  const config = getEnrichmentConfig();
  const fixtureEnabled = config.enabled && config.fixtureEnabled;
  const providers: Record<string, EnrichmentProvider> = {
    fixture_cti: createFixtureProvider({
      enabled: fixtureEnabled,
      timeoutMs: config.requestTimeoutMs,
      freshnessSeconds: 3600,
    }),
  };
  return providers;
}

export function getEnrichmentProvider(providerId: string) {
  const provider = buildRegistry()[providerId];
  if (!provider) throw new Error("unsupported_provider");
  return provider;
}

export function publicEnrichmentProviders(): PublicEnrichmentProvider[] {
  return Object.values(buildRegistry())
    .filter((provider) => provider.enabled)
    .map((provider) => ({
      id: provider.id,
      displayName: provider.displayName,
      isSynthetic: provider.isSynthetic,
      supportedIndicatorTypes: provider.supportedIndicatorTypes,
      configured: provider.configured,
      enabled: provider.enabled,
      dataSharingWarning: provider.dataSharingWarning,
    }));
}
