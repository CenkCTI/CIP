import "server-only";

import type { EnrichmentProvider, ProviderResponse } from "@/lib/enrichment/types";
import { providerResponseSchema } from "@/lib/enrichment/types";

const syntheticNotice = "TEST / SYNTHETIC result generated locally by CİTEM. This is not live intelligence.";
const observedAt = "2026-01-01T00:00:00.000Z";

function domainResponse(value: string): ProviderResponse {
  const relatedIp = value === "secure-energy.example" ? "192.0.2.10" : "192.0.2.20";
  return {
    results: [
      {
        category: "DNS",
        normalized: {
          schema_version: 1,
          summary: `Synthetic DNS context for ${value}.`,
          attributes: {
            nameserver: "ns1.example.net",
            record_type: "A",
            ttl_seconds: 300,
          },
          related_indicators: [
            { type: "IP", value: relatedIp, relationship: "resolves_to" },
          ],
          provider_verdict: { label: "synthetic suspicious test record", score: 70 },
          synthetic_notice: syntheticNotice,
        },
        provider_observed_at: observedAt,
        expires_at: null,
        confidence: "MEDIUM",
        sanitized_raw: {
          fixture: true,
          record: "domain-dns-v1",
        },
      },
      {
        category: "REGISTRATION",
        normalized: {
          schema_version: 1,
          summary: `Synthetic registration context for ${value}.`,
          attributes: {
            registrar: "Example Registrar",
            registration_state: "synthetic-active",
          },
          related_indicators: [],
          provider_verdict: null,
          synthetic_notice: syntheticNotice,
        },
        provider_observed_at: observedAt,
        expires_at: null,
        confidence: "LOW",
        sanitized_raw: { fixture: true, record: "domain-registration-v1" },
      },
    ],
  };
}

function ipResponse(value: string): ProviderResponse {
  return {
    results: [
      {
        category: "NETWORK",
        normalized: {
          schema_version: 1,
          summary: `Synthetic network context for ${value}.`,
          attributes: {
            asn: 64500,
            organisation: "Synthetic Hosting",
            network_classification: value.includes(":") ? "documentation-ipv6" : "documentation-ipv4",
          },
          related_indicators: [
            { type: "DOMAIN", value: "secure-energy.example", relationship: "hosts" },
          ],
          provider_verdict: { label: "synthetic suspicious test record", score: 65 },
          synthetic_notice: syntheticNotice,
        },
        provider_observed_at: observedAt,
        expires_at: null,
        confidence: "MEDIUM",
        sanitized_raw: { fixture: true, record: "network-v1" },
      },
    ],
  };
}

function hashResponse(value: string): ProviderResponse {
  return {
    results: [
      {
        category: "MALWARE",
        normalized: {
          schema_version: 1,
          summary: `Synthetic malware context for hash ${value}.`,
          attributes: {
            family: "SyntheticLoader",
            sample_state: "test-only",
          },
          related_indicators: [],
          provider_verdict: { label: "synthetic malicious test record", score: 80 },
          synthetic_notice: syntheticNotice,
        },
        provider_observed_at: observedAt,
        expires_at: null,
        confidence: "MEDIUM",
        sanitized_raw: { fixture: true, record: "hash-malware-v1" },
      },
    ],
  };
}

function urlResponse(value: string): ProviderResponse {
  const parsed = new URL(value);
  return {
    results: [
      {
        category: "REPUTATION",
        normalized: {
          schema_version: 1,
          summary: `Synthetic URL reputation context for ${value}.`,
          attributes: {
            hostname: parsed.hostname,
            path: parsed.pathname,
            classification: "synthetic-phishing",
          },
          related_indicators: [
            { type: "DOMAIN", value: parsed.hostname, relationship: "url_host" },
          ],
          provider_verdict: { label: "synthetic suspicious test record", score: 75 },
          synthetic_notice: syntheticNotice,
        },
        provider_observed_at: observedAt,
        expires_at: null,
        confidence: "MEDIUM",
        sanitized_raw: { fixture: true, record: "url-reputation-v1" },
      },
    ],
  };
}

export function createFixtureProvider(input: {
  enabled: boolean;
  timeoutMs: number;
  freshnessSeconds: number;
}): EnrichmentProvider {
  return {
    id: "fixture_cti",
    displayName: "Deterministic Test Provider",
    isSynthetic: true,
    supportedIndicatorTypes: ["DOMAIN", "IP", "URL", "HASH"],
    configured: input.enabled,
    enabled: input.enabled,
    fixedBaseUrl: null,
    requestTimeoutMs: input.timeoutMs,
    freshnessSeconds: input.freshnessSeconds,
    dataSharingWarning: "No external data sharing. Results are deterministic, local and synthetic.",
    responseSchema: providerResponseSchema,
    async query({ indicatorType, canonicalValue, signal }) {
      if (signal.aborted) throw new DOMException("Enrichment request aborted", "AbortError");
      const response =
        indicatorType === "DOMAIN"
          ? domainResponse(canonicalValue)
          : indicatorType === "IP"
            ? ipResponse(canonicalValue)
            : indicatorType === "HASH"
              ? hashResponse(canonicalValue)
              : urlResponse(canonicalValue);
      return structuredClone(response);
    },
  };
}
