import { afterEach, describe, expect, it, vi } from "vitest";
import { mapFirstEpssRecord, mapFirstEpssResponse, firstEpssAdapter } from "./providers/first-epss";
import { mapThreatFoxCandidate } from "./providers/threatfox";
import { mapMalwareBazaarRecord, malwareBazaarAdapter } from "./providers/malwarebazaar";
import { fetchMalwareBazaarMetadata } from "./abusech-transport";
import { normalizeProviderItem } from "@/lib/ioc-connectors/normalize";
import { listTechnicalSources } from "./registry";

const originalSynthetic = process.env.TECHINT_TEST_SOURCE_ENABLED;
afterEach(() => {
  vi.restoreAllMocks();
  if (originalSynthetic === undefined) delete process.env.TECHINT_TEST_SOURCE_ENABLED;
  else process.env.TECHINT_TEST_SOURCE_ENABLED = originalSynthetic;
});

describe("Phase 2.3C source-pack registry", () => {
  it("registers only implemented production sources plus the gated synthetic source", () => {
    delete process.env.TECHINT_TEST_SOURCE_ENABLED;
    expect(listTechnicalSources().map((source) => source.metadata.key)).toEqual([
      "CISA_KEV",
      "NVD_CVE",
      "FIRST_EPSS",
      "THREATFOX",
      "MALWAREBAZAAR",
    ]);
    process.env.TECHINT_TEST_SOURCE_ENABLED = "true";
    expect(listTechnicalSources().map((source) => source.metadata.key)).toContain("TEST_SYNTHETIC");
    expect(listTechnicalSources().some((source) => source.metadata.key.includes("URLHAUS"))).toBe(false);
    expect(listTechnicalSources().some((source) => source.metadata.key.includes("MITRE"))).toBe(false);
  });
});

describe("FIRST EPSS", () => {
  const row = { cve: "CVE-2099-10001", epss: "0.820000000", percentile: "0.990000000", date: "2099-01-01" };

  it("keeps EPSS as provider scoring context rather than analyst confidence or CVE severity", () => {
    const mapped = mapFirstEpssRecord(row, "2099-01-02T00:00:00.000Z", "Fri, 02 Jan 2099 01:00:00 GMT");
    expect(mapped.signal.signalType).toBe("PROVIDER_ALERT");
    expect(mapped.signal.canonicalKey).toBe("report:first-epss:CVE-2099-10001");
    expect(mapped.signal.confidence).toBeNull();
    expect(mapped.signal.severity).toBe("UNKNOWN");
    expect(mapped.signal.facts).toMatchObject({ epss: 0.82, percentile: 0.99 });
    expect(mapped.entityAssertions[0]).toMatchObject({ entityKind: "CVE", normalizedValue: "CVE-2099-10001" });
  });

  it("skips malformed rows without rejecting the bounded response", () => {
    const result = mapFirstEpssResponse({ total: 2, offset: 0, limit: 2000, data: [row, { ...row, epss: "1.2" }] }, "2099-01-02T00:00:00.000Z");
    expect(result.recordsSeen).toBe(2);
    expect(result.recordsMapped).toBe(1);
    expect(result.issues[0]?.code).toBe("INVALID_EPSS_RECORD");
  });

  it("uses conditional collection and the fixed FIRST endpoint", async () => {
    const fetchImpl = vi.fn(async (input: URL | RequestInfo | Request) => {
      const url = new URL(String(input));
      expect(url.hostname).toBe("api.first.org");
      expect(url.pathname).toBe("/data/v1/epss");
      expect(url.searchParams.get("sort")).toBe("-epss");
      return new Response(JSON.stringify({ total: 1, offset: 0, limit: 2000, data: [row] }), {
        status: 200,
        headers: { "content-type": "application/json", "last-modified": "Fri, 02 Jan 2099 01:00:00 GMT" },
      });
    });
    const result = await firstEpssAdapter.collect({ now: new Date("2099-01-02T02:00:00Z"), cursor: { version: 1 }, settings: { minimumEpss: 0.1 }, fetchImpl: fetchImpl as typeof fetch });
    expect(result.signals).toHaveLength(1);
    expect(result.nextCursor).toMatchObject({ version: 1, lastModified: "Fri, 02 Jan 2099 01:00:00 GMT" });
  });
});

describe("ThreatFox TechINT bridge", () => {
  it("uses canonical IOC identity while keeping provider context in the observation", () => {
    const candidate = normalizeProviderItem({
      providerKey: "THREATFOX",
      providerItemId: "123",
      type: "IPV4",
      value: "192.0.2.10:443",
      threat_type: "botnet_cc",
      malware_family: "ExampleMalware",
      confidence_score: 75,
      first_seen_at: "2099-01-01T00:00:00.000Z",
      last_seen_at: "2099-01-02T00:00:00.000Z",
      tags: ["THREATFOX", "example"],
    });
    const mapped = mapThreatFoxCandidate(candidate, "2099-01-03T00:00:00.000Z");
    expect(mapped.signal.signalType).toBe("IOC_OBSERVATION");
    expect(mapped.signal.canonicalKey).toBe("indicator:IP:192.0.2.10");
    expect(mapped.signal.facts).toEqual({ indicatorType: "IP", indicatorValue: "192.0.2.10" });
    expect(mapped.signal.confidence).toBeNull();
    expect(mapped.observation.sourceSnapshot).toMatchObject({ networkPort: 443, providerConfidence: 75, malwareFamily: "ExampleMalware" });
    expect(mapped.entityAssertions[0]).toMatchObject({ entityKind: "INDICATOR", indicatorType: "IP", confidence: 75 });
  });
});

describe("MalwareBazaar metadata-only source", () => {
  const item = {
    sha256_hash: "a".repeat(64),
    sha1_hash: "b".repeat(40),
    md5_hash: "c".repeat(32),
    first_seen: "2099-01-01 00:00:00 UTC",
    last_seen: "2099-01-02 00:00:00 UTC",
    file_name: "example.bin",
    file_size: 1234,
    file_type: "exe",
    file_type_mime: "application/x-dosexec",
    signature: "ExampleFamily",
    reporter: "example",
    tags: ["exe", "test"],
  };

  it("maps only metadata and hash assertions", () => {
    const mapped = mapMalwareBazaarRecord(item, "2099-01-03T00:00:00.000Z");
    expect(mapped.signal.signalType).toBe("MALWARE_ACTIVITY");
    expect(mapped.signal.canonicalKey).toBe(`report:malwarebazaar:${"a".repeat(64)}`);
    expect(mapped.entityAssertions[0]).toMatchObject({ entityKind: "INDICATOR", indicatorType: "HASH", normalizedValue: "a".repeat(64) });
    expect(JSON.stringify(mapped)).not.toContain("get_file");
  });

  it("uses a fixed POST query and never places the Auth-Key in URL/body", async () => {
    const fetchImpl = vi.fn(async (input: URL | RequestInfo | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://mb-api.abuse.ch/api/v1/");
      expect(init?.method).toBe("POST");
      expect(String(init?.body)).toBe("query=get_recent&selector=100");
      expect(String(init?.body)).not.toContain("secret-key");
      expect((init?.headers as Record<string, string>)["Auth-Key"]).toBe("secret-key");
      return new Response(JSON.stringify({ query_status: "ok", data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    await fetchMalwareBazaarMetadata({ credential: "secret-key", selector: "100", fetchImpl: fetchImpl as typeof fetch });
  });

  it("requires a server credential before collection", async () => {
    await expect(malwareBazaarAdapter.collect({ now: new Date(), cursor: { version: 1 }, settings: {}, fetchImpl: fetch })).rejects.toMatchObject({ code: "SOURCE_NOT_AVAILABLE" });
  });
});
