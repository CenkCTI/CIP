import { describe, expect, it } from "vitest";
import { dateOnlyInstant } from "./mapping";
import { mapCisaKevCatalog } from "./providers/cisa-kev";
import { mapNvdCve } from "./providers/nvd-cve";
import { mapFixedFeedItems, parseFixedXmlFeed } from "./providers/fixed-feed";
import { fetchBoundedJson } from "./transport";

describe("Phase 2.3C hardening", () => {
  it("accepts a fixed-source 304 without treating it as a redirect", async () => {
    const result = await fetchBoundedJson({
      url: new URL("https://www.cisa.gov/data.json"),
      allowedHost: "www.cisa.gov",
      allowedPath: "/data.json",
      maxBytes: 1024,
      fetchImpl: (async () =>
        new Response(null, {
          status: 304,
          headers: { etag: '"catalog-v2"', "last-modified": "Thu, 06 Aug 2026 00:00:00 GMT" },
        })) as typeof fetch,
    });
    expect(result).toEqual({
      status: 304,
      json: null,
      etag: '"catalog-v2"',
      lastModified: "Thu, 06 Aug 2026 00:00:00 GMT",
    });
  });

  it("rejects adapter headers outside the fixed allowlist before fetching", async () => {
    let fetched = false;
    await expect(
      fetchBoundedJson({
        url: new URL("https://www.cisa.gov/data.json"),
        allowedHost: "www.cisa.gov",
        allowedPath: "/data.json",
        maxBytes: 1024,
        headers: { authorization: "Bearer forbidden" },
        fetchImpl: (async () => {
          fetched = true;
          return new Response("{}");
        }) as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "SOURCE_NOT_AVAILABLE" });
    expect(fetched).toBe(false);
  });

  it("rejects impossible calendar dates", () => {
    expect(() => dateOnlyInstant("2026-02-29")).toThrow("INVALID_DATE");
    expect(dateOnlyInstant("2028-02-29")).toBe("2028-02-29T00:00:00.000Z");
  });

  it("normalizes offset-free official NVD timestamps as UTC", () => {
    const mapped = mapNvdCve(
      {
        id: "CVE-2099-11001",
        sourceIdentifier: "nvd@example.test",
        published: "2099-01-01T01:02:03.000",
        lastModified: "2099-01-02T04:05:06.000",
        vulnStatus: "Analyzed",
        descriptions: [{ lang: "en", value: "Offset-free timestamp fixture." }],
        metrics: {},
        weaknesses: [],
        references: [],
        configurations: [],
      },
      "2099-01-03T00:00:00.000Z",
    );
    expect(mapped.signal.publishedAt).toBe("2099-01-01T01:02:03.000Z");
    expect(mapped.signal.effectiveAt).toBe("2099-01-02T04:05:06.000Z");
  });

  it("rejects malformed CISA catalog shape and skips impossible entry dates", () => {
    expect(() => mapCisaKevCatalog({}, "2099-01-03T00:00:00.000Z")).toThrow();
    const result = mapCisaKevCatalog(
      {
        catalogVersion: "2099.01.01",
        dateReleased: "2099.01.01",
        vulnerabilities: [
          {
            cveID: "CVE-2099-11002",
            vendorProject: "Example Vendor",
            product: "Example Product",
            vulnerabilityName: "Impossible date fixture",
            dateAdded: "2099-02-30",
            shortDescription: "Must be skipped.",
            requiredAction: "No action.",
            dueDate: "2099-03-01",
            knownRansomwareCampaignUse: "Unknown",
          },
        ],
      },
      "2099-01-03T00:00:00.000Z",
    );
    expect(result.recordsMapped).toBe(0);
    expect(result.issues[0]?.code).toBe("INVALID_KEV_DATE");
  });

  it("parses Atom with stable identity and maps exact CVEs only", () => {
    const items = parseFixedXmlFeed(`
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <id>atom-001</id>
          <title>CVE-2099-11003 advisory</title>
          <summary>Exact CVE mention; CVE-2099-12 is intentionally invalid.</summary>
          <link href="https://example.test/atom-001" />
          <published>2099-01-01T00:00:00Z</published>
          <updated>2099-01-02T00:00:00Z</updated>
        </entry>
      </feed>
    `);
    expect(items).toHaveLength(1);
    const mapped = mapFixedFeedItems(
      "fixed-atom",
      "https://example.test/feed.atom",
      items,
      "2099-01-03T00:00:00.000Z",
    );
    expect(mapped.signals[0]?.signal.canonicalKey).toBe("advisory:fixed-atom:atom-001");
    expect(mapped.signals[0]?.entityAssertions.map((assertion) => assertion.normalizedValue)).toEqual([
      "CVE-2099-11003",
    ]);
  });
});
