import { afterEach, describe, expect, it } from "vitest";
import { mapCisaKevCatalog } from "./providers/cisa-kev";
import { mapNvdCve, nvdWindow } from "./providers/nvd-cve";
import { mapFixedFeedItems, parseFixedJsonFeed, parseFixedXmlFeed } from "./providers/fixed-feed";
import { testSyntheticAdapter } from "./providers/test-synthetic";
import { listTechnicalSources } from "./registry";
import { fetchBoundedJson } from "./transport";

const originalSynthetic = process.env.TECHINT_TEST_SOURCE_ENABLED;
afterEach(() => {
  if (originalSynthetic === undefined) delete process.env.TECHINT_TEST_SOURCE_ENABLED;
  else process.env.TECHINT_TEST_SOURCE_ENABLED = originalSynthetic;
});

describe("TechINT source registry", () => {
  it("contains the fixed Phase 2.3C production source pack", () => {
    delete process.env.TECHINT_TEST_SOURCE_ENABLED;
    expect(listTechnicalSources().map((source) => source.metadata.key)).toEqual([
      "CISA_KEV",
      "NVD_CVE",
      "FIRST_EPSS",
      "THREATFOX",
      "MALWAREBAZAAR",
    ]);
    process.env.TECHINT_TEST_SOURCE_ENABLED = "true";
    expect(listTechnicalSources().map((source) => source.metadata.key)).toEqual([
      "TEST_SYNTHETIC",
      "CISA_KEV",
      "NVD_CVE",
      "FIRST_EPSS",
      "THREATFOX",
      "MALWAREBAZAAR",
    ]);
    expect(listTechnicalSources().some((source) => source.metadata.key.includes("OTX"))).toBe(false);
  });
});

describe("TEST_SYNTHETIC", () => {
  it("is deterministic, network-free, and introduces a later changed state", async () => {
    const fetchImpl = async () => { throw new Error("network must not be used"); };
    const first = await testSyntheticAdapter.collect({ now: new Date("2099-01-03T00:00:00Z"), cursor: { version: 1, sequence: 0 }, settings: {}, fetchImpl: fetchImpl as typeof fetch });
    const retry = await testSyntheticAdapter.collect({ now: new Date("2099-01-03T00:00:00Z"), cursor: { version: 1, sequence: 1 }, settings: {}, fetchImpl: fetchImpl as typeof fetch });
    const changed = await testSyntheticAdapter.collect({ now: new Date("2099-01-03T00:00:00Z"), cursor: { version: 1, sequence: 2 }, settings: {}, fetchImpl: fetchImpl as typeof fetch });
    expect(first.signals).toEqual(retry.signals);
    expect(changed.signals[0]?.signal.severity).toBe("CRITICAL");
    expect(first.signals.map((item) => item.signal.signalType)).toEqual(expect.arrayContaining(["VULNERABILITY_CHANGE", "ACTIVE_EXPLOITATION", "TECHNICAL_ADVISORY", "TTP_UPDATE"]));
  });
});

describe("CISA KEV mapping", () => {
  it("maps an official-shaped record without inventing severity or confidence", () => {
    const result = mapCisaKevCatalog({
      title: "CISA KEV",
      catalogVersion: "2099.01.01",
      dateReleased: "2099.01.01",
      count: 1,
      vulnerabilities: [{
        cveID: "CVE-2099-10001",
        vendorProject: " Example   Vendor ",
        product: "Example Product",
        vulnerabilityName: "Example vulnerability",
        dateAdded: "2099-01-01",
        shortDescription: "Example description",
        requiredAction: "Apply mitigations.",
        dueDate: "2099-01-22",
        knownRansomwareCampaignUse: "Unknown",
        notes: "",
        cwes: ["CWE-79"],
      }],
    }, "2099-01-02T00:00:00.000Z");
    const signal = result.signals[0]!;
    expect(signal.signal.signalType).toBe("ACTIVE_EXPLOITATION");
    expect(signal.signal.canonicalKey).toBe("cve:CVE-2099-10001");
    expect(signal.signal.severity).toBe("UNKNOWN");
    expect(signal.signal.confidence).toBeNull();
    expect(signal.entityAssertions.map((item) => item.entityKind)).toEqual(["CVE", "VENDOR", "PRODUCT"]);
  });
});

describe("NVD mapping", () => {
  it("uses the official lastModified timestamp and CVSS precedence", () => {
    const mapped = mapNvdCve({
      id: "CVE-2099-10002",
      sourceIdentifier: "example@example.test",
      published: "2099-01-01T00:00:00.000Z",
      lastModified: "2099-01-02T00:00:00.000Z",
      vulnStatus: "Analyzed",
      descriptions: [{ lang: "en", value: "Example NVD description" }],
      metrics: { cvssMetricV31: [{ cvssData: { version: "3.1", baseScore: 9.8, baseSeverity: "CRITICAL", vectorString: "CVSS:3.1/AV:N" } }] },
      weaknesses: [{ descriptions: [{ lang: "en", value: "CWE-79" }] }],
      references: [{ url: "https://example.test/reference", source: "example" }],
      configurations: [],
    }, "2099-01-03T00:00:00.000Z");
    expect(mapped.signal.canonicalKey).toBe("cve:CVE-2099-10002");
    expect(mapped.signal.severity).toBe("CRITICAL");
    expect(mapped.signal.effectiveAt).toBe("2099-01-02T00:00:00.000Z");
    expect(mapped.entityAssertions).toHaveLength(1);
  });

  it("uses a bounded last-modified window with overlap", () => {
    const result = nvdWindow(new Date("2099-01-02T00:00:00.000Z"), { version: 1, lastModifiedWatermark: "2099-01-01T12:00:00.000Z" }, 24);
    expect(result.start).toBe("2099-01-01T11:55:00.000Z");
    expect(result.end).toBe("2099-01-02T00:00:00.000Z");
  });
});

describe("fixed advisory parser foundation", () => {
  it("rejects XML DTD/entity input", () => {
    expect(() => parseFixedXmlFeed('<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><rss/>')).toThrow("INVALID_SOURCE_RESPONSE");
  });

  it("parses RSS and JSON Feed items with stable identity", () => {
    const rss = parseFixedXmlFeed("<rss><channel><item><guid>a-1</guid><title>CVE-2099-10001 advisory</title><description>Details</description><link>https://example.test/a-1</link><pubDate>Fri, 01 Jan 2099 00:00:00 GMT</pubDate></item></channel></rss>");
    const json = parseFixedJsonFeed({ version: "https://jsonfeed.org/version/1.1", items: [{ id: "j-1", title: "Advisory", content_text: "CVE-2099-10002", date_published: "2099-01-01T00:00:00Z" }] });
    expect(rss).toHaveLength(1);
    expect(json).toHaveLength(1);
    const mapped = mapFixedFeedItems("fixed-test", "https://example.test/feed", [...rss, ...json], "2099-01-02T00:00:00.000Z");
    expect(mapped.signals).toHaveLength(2);
    expect(mapped.signals.flatMap((item) => item.entityAssertions)).toHaveLength(2);
  });
});

describe("fixed-host transport", () => {
  it("rejects a hostname outside the adapter allowlist before fetching", async () => {
    await expect(fetchBoundedJson({
      url: new URL("https://evil.example/data.json"),
      allowedHost: "www.cisa.gov",
      allowedPath: "/data.json",
      maxBytes: 1000,
      fetchImpl: (async () => { throw new Error("must not fetch"); }) as typeof fetch,
    })).rejects.toMatchObject({ code: "SOURCE_NOT_AVAILABLE" });
  });
});

describe("source settings and scheduler bounds", () => {
  it("rejects out-of-contract source intervals and settings", async () => {
    const { sourceSettingsInputSchema } = await import("./schema");
    expect(sourceSettingsInputSchema.safeParse({ sourceKey: "TEST_SYNTHETIC", intervalMinutes: 1 }).success).toBe(false);
    expect(sourceSettingsInputSchema.safeParse({ sourceKey: "CISA_KEV", intervalMinutes: 59 }).success).toBe(false);
    expect(sourceSettingsInputSchema.safeParse({ sourceKey: "NVD_CVE", intervalMinutes: 120, initialLookbackHours: 169 }).success).toBe(false);
    expect(sourceSettingsInputSchema.safeParse({ sourceKey: "FIRST_EPSS", intervalMinutes: 360, minimumEpss: 1.01 }).success).toBe(false);
    expect(sourceSettingsInputSchema.safeParse({ sourceKey: "THREATFOX", intervalMinutes: 120, lookbackDays: 8 }).success).toBe(false);
    expect(sourceSettingsInputSchema.safeParse({ sourceKey: "MALWAREBAZAAR", intervalMinutes: 120, lookbackDays: 1 }).success).toBe(false);
  });

  it("caps TechINT scheduler configuration", async () => {
    const { techIntSchedulerConfig } = await import("./scheduler");
    expect(techIntSchedulerConfig({ TECHINT_SCHEDULER_ENABLED: "true" } as unknown as NodeJS.ProcessEnv)).toEqual({ enabled: true, batchSize: 5, concurrency: 2 });
    expect(() => techIntSchedulerConfig({ TECHINT_SYNC_BATCH_SIZE: "11" } as unknown as NodeJS.ProcessEnv)).toThrow("INVALID_TECHINT_SCHEDULER_CONFIGURATION");
    expect(() => techIntSchedulerConfig({ TECHINT_SYNC_CONCURRENCY: "5" } as unknown as NodeJS.ProcessEnv)).toThrow("INVALID_TECHINT_SCHEDULER_CONFIGURATION");
  });
});

describe("additional source mapping boundaries", () => {
  it("keeps KEV catalog release provenance out of canonical facts", () => {
    const record = {
      cveID: "CVE-2099-10003",
      vendorProject: "Example Vendor",
      product: "Example Product",
      vulnerabilityName: "Example vulnerability",
      dateAdded: "2099-01-01",
      shortDescription: "Example description",
      requiredAction: "Apply mitigations.",
      dueDate: "2099-01-22",
      knownRansomwareCampaignUse: "Unknown",
      notes: "",
      cwes: ["CWE-79"],
    };
    const first = mapCisaKevCatalog({ catalogVersion: "2099.01.01", dateReleased: "2099.01.01", vulnerabilities: [record] }, "2099-01-02T00:00:00.000Z");
    const later = mapCisaKevCatalog({ catalogVersion: "2099.01.02", dateReleased: "2099.01.02", vulnerabilities: [record] }, "2099-01-03T00:00:00.000Z");
    expect(first.signals[0]?.signal.facts).toEqual(later.signals[0]?.signal.facts);
    expect(first.signals[0]?.observation.sourceSnapshot).not.toEqual(later.signals[0]?.observation.sourceSnapshot);
    expect(first.signals[0]?.signal.effectiveAt).not.toBe(later.signals[0]?.signal.effectiveAt);
  });

  it("skips malformed KEV entries without rejecting the whole catalog", () => {
    const result = mapCisaKevCatalog({ catalogVersion: "2099.01.01", dateReleased: "2099.01.01", vulnerabilities: [{ cveID: "not-a-cve" }] }, "2099-01-02T00:00:00.000Z");
    expect(result.recordsSeen).toBe(1);
    expect(result.recordsMapped).toBe(0);
    expect(result.issues[0]?.code).toBe("INVALID_KEV_RECORD");
  });

  it("maps NVD records without CVSS to UNKNOWN and performs no vendor alias extraction", () => {
    const mapped = mapNvdCve({
      id: "CVE-2099-10004",
      sourceIdentifier: "example@example.test",
      published: "2099-01-01T00:00:00.000Z",
      lastModified: "2099-01-02T00:00:00.000Z",
      vulnStatus: "Awaiting Analysis",
      descriptions: [{ lang: "en", value: "Example NVD description" }],
      metrics: {},
      weaknesses: [],
      references: [{ url: "https://user:secret@example.test/private" }],
      configurations: [],
    }, "2099-01-03T00:00:00.000Z");
    expect(mapped.signal.severity).toBe("UNKNOWN");
    expect(mapped.entityAssertions.map((item) => item.entityKind)).toEqual(["CVE"]);
    expect((mapped.signal.facts as { references: unknown[] }).references).toEqual([]);
  });

  it("skips fixed-feed items with invalid timestamps and strips credential-bearing item URLs", () => {
    expect(parseFixedJsonFeed({ version: "https://jsonfeed.org/version/1.1", items: [{ id: "bad", date_published: "not-a-date" }] })).toEqual([]);
    const mapped = mapFixedFeedItems("fixed-test", "https://example.test/feed", [{
      id: "safe-id",
      title: "Advisory",
      summary: "CVE-2099-10005",
      url: "https://user:secret@example.test/private",
      publishedAt: "2099-01-01T00:00:00.000Z",
      modifiedAt: null,
    }], "2099-01-02T00:00:00.000Z");
    expect(mapped.signals[0]?.observation.sourceUrl).toBe("https://example.test/feed");
  });
});

describe("bounded transport failures", () => {
  const base = {
    url: new URL("https://www.cisa.gov/data.json"),
    allowedHost: "www.cisa.gov",
    allowedPath: "/data.json",
    maxBytes: 100,
  };

  it("rejects redirects", async () => {
    await expect(fetchBoundedJson({ ...base, fetchImpl: (async () => new Response(null, { status: 302 })) as typeof fetch })).rejects.toMatchObject({ code: "HTTP_STATUS" });
  });

  it("rejects unexpected content types", async () => {
    await expect(fetchBoundedJson({ ...base, fetchImpl: (async () => new Response("ok", { status: 200, headers: { "content-type": "text/plain" } })) as typeof fetch })).rejects.toMatchObject({ code: "HTTP_CONTENT_TYPE" });
  });

  it("rejects declared and actual oversized bodies", async () => {
    await expect(fetchBoundedJson({ ...base, fetchImpl: (async () => new Response("{}", { status: 200, headers: { "content-type": "application/json", "content-length": "101" } })) as typeof fetch })).rejects.toMatchObject({ code: "HTTP_BODY_TOO_LARGE" });
    await expect(fetchBoundedJson({ ...base, maxBytes: 2, fetchImpl: (async () => new Response("{\"a\":1}", { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch })).rejects.toMatchObject({ code: "HTTP_BODY_TOO_LARGE" });
  });

  it("sanitizes malformed JSON and rate-limit responses", async () => {
    await expect(fetchBoundedJson({ ...base, fetchImpl: (async () => new Response("{", { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch })).rejects.toMatchObject({ code: "INVALID_SOURCE_RESPONSE" });
    await expect(fetchBoundedJson({ ...base, fetchImpl: (async () => new Response(null, { status: 429 })) as typeof fetch })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
