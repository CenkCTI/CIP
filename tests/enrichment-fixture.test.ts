import { afterEach, describe, expect, it, vi } from "vitest";

import { createFixtureProvider } from "@/lib/enrichment/providers/fixture";
import {
  getEnrichmentProvider,
  publicEnrichmentProviders,
} from "@/lib/enrichment/registry";
import { providerResponseSchema } from "@/lib/enrichment/types";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

async function query(type: "DOMAIN" | "IP" | "URL" | "HASH", value: string) {
  const provider = createFixtureProvider({
    enabled: true,
    timeoutMs: 15000,
    freshnessSeconds: 3600,
  });
  const response = await provider.query({
    indicatorType: type,
    canonicalValue: value,
    signal: new AbortController().signal,
    context: {
      projectId: "11111111-1111-4111-8111-111111111111",
      indicatorId: "22222222-2222-4222-8222-222222222222",
      maxResults: 12,
    },
  });
  return providerResponseSchema.parse(response);
}

describe("deterministic fixture provider", () => {
  it("is enabled only through server environment flags", () => {
    process.env.ENRICHMENT_ENABLED = "false";
    process.env.ENRICHMENT_FIXTURE_ENABLED = "true";
    expect(publicEnrichmentProviders()).toEqual([]);

    process.env.ENRICHMENT_ENABLED = "true";
    process.env.ENRICHMENT_FIXTURE_ENABLED = "true";
    expect(publicEnrichmentProviders().map((provider) => provider.id)).toEqual([
      "fixture_cti",
    ]);
  });

  it("exposes only safe public provider metadata", () => {
    process.env.ENRICHMENT_ENABLED = "true";
    process.env.ENRICHMENT_FIXTURE_ENABLED = "true";
    const provider = publicEnrichmentProviders()[0] as Record<string, unknown>;
    expect(provider.displayName).toBe("Deterministic Test Provider");
    expect(provider.isSynthetic).toBe(true);
    expect(provider).not.toHaveProperty("fixedBaseUrl");
    expect(provider).not.toHaveProperty("apiKey");
    expect(provider).not.toHaveProperty("headers");
  });

  it("supports only the bounded fixture Indicator types", () => {
    process.env.ENRICHMENT_ENABLED = "true";
    process.env.ENRICHMENT_FIXTURE_ENABLED = "true";
    const provider = getEnrichmentProvider("fixture_cti");
    expect(provider.supportedIndicatorTypes).toEqual([
      "DOMAIN",
      "IP",
      "URL",
      "HASH",
    ]);
    expect(provider.supportedIndicatorTypes).not.toContain("FILE");
  });

  it("returns deterministic domain results without network access", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const first = await query("DOMAIN", "secure-energy.example");
    const second = await query("DOMAIN", "secure-energy.example");
    expect(second).toEqual(first);
    expect(first.results[0].normalized.related_indicators[0]).toEqual({
      type: "IP",
      value: "192.0.2.10",
      relationship: "resolves_to",
    });
    expect(first.results[0].normalized.synthetic_notice).toContain(
      "TEST / SYNTHETIC",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["IP", "192.0.2.10", "NETWORK"],
    ["IP", "2001:db8::10", "NETWORK"],
    ["HASH", "44d88612fea8a8f36de82e1278abb02f", "MALWARE"],
    ["URL", "https://secure-energy.example/login", "REPUTATION"],
  ] as const)("returns validated %s fixture data", async (type, value, category) => {
    const response = await query(type, value);
    expect(response.results[0].category).toBe(category);
    expect(response.results.length).toBeLessThanOrEqual(12);
    expect(response.results[0].normalized.schema_version).toBe(1);
    expect(response.results[0].normalized.synthetic_notice).toContain("SYNTHETIC");
  });

  it("aborts before producing a result when the signal is already cancelled", async () => {
    const provider = createFixtureProvider({ enabled: true, timeoutMs: 15000, freshnessSeconds: 3600 });
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.query({
        indicatorType: "DOMAIN",
        canonicalValue: "secure-energy.example",
        signal: controller.signal,
        context: {
          projectId: "11111111-1111-4111-8111-111111111111",
          indicatorId: "22222222-2222-4222-8222-222222222222",
          maxResults: 12,
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
