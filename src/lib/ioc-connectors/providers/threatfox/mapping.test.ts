import { describe, expect, it } from "vitest";
import { mapThreatFoxItem, parseThreatFoxDate, ThreatFoxMappingError } from "./mapping";

const base = { id: "42", ioc: "example.com", ioc_type: "domain", first_seen: "2026-08-01 07:35:20 UTC", last_seen: null, tags: null, confidence_level: 75, malware: "win.test", malware_printable: "Test Malware", reference: "https://example.test/report" };

describe("ThreatFox strict dates", () => {
  it("parses the official UTC format", () => expect(parseThreatFoxDate("2026-08-01 07:35:20 UTC", true)).toBe("2026-08-01T07:35:20.000Z"));
  it.each([
    ["2026-08-01T07:35:20Z", "2026-08-01T07:35:20.000Z"],
    ["2026-08-01T07:35:20.123Z", "2026-08-01T07:35:20.123Z"],
    ["2026-08-01T09:35:20+02:00", "2026-08-01T07:35:20.000Z"],
    ["2026-08-01T02:35:20-05:00", "2026-08-01T07:35:20.000Z"],
  ])("parses strict ISO timestamp %s", (input, expected) => expect(parseThreatFoxDate(input, true)).toBe(expected));
  it("accepts a null optional date", () => expect(parseThreatFoxDate(null)).toBeNull());
  it.each([null, "August 1, 2026", "2026-08-01 07:35:20", "2026-02-30 07:35:20 UTC"])("rejects required or malformed date %s", value => expect(() => parseThreatFoxDate(value, true)).toThrow("INVALID_DATE"));
  it("rejects malformed non-null last_seen", () => expect(() => mapThreatFoxItem({ ...base, last_seen: "not-a-date" })).toThrow("INVALID_DATE"));
});

describe("ThreatFox mapping", () => {
  it("maps official dates and bounded provenance", () => expect(mapThreatFoxItem(base)).toMatchObject({ candidate_type: "DOMAIN", normalized_value: "example.com", provider_item_id: "42", malware_family: "Test Malware", tags: ["THREATFOX"], confidence_score: 75, first_seen_at: "2026-08-01T07:35:20.000Z", last_seen_at: null }));
  it("maps IPv4 and bracketed IPv6 ports", () => {
    expect(mapThreatFoxItem({ ...base, ioc_type: "ip:port", ioc: "192.0.2.44:443" })).toMatchObject({ candidate_type: "IPV4", network_port: 443 });
    expect(mapThreatFoxItem({ ...base, ioc_type: "ip:port", ioc: "[2001:db8::44]:8443" })).toMatchObject({ candidate_type: "IPV6", network_port: 8443 });
  });
  it("maps URLs with deterministic fingerprints", () => { const item = { ...base, ioc_type: "url", ioc: "https://example.com/a" }; expect(mapThreatFoxItem(item).source_fingerprint).toBe(mapThreatFoxItem(item).source_fingerprint); });
  it.each([
    [{ ioc_type: "sha256_hash", ioc: "a".repeat(64) }, "UNSUPPORTED_IOC_TYPE"],
    [{ ioc_type: "ip:port", ioc: "bad:443" }, "INVALID_IP"],
    [{ ioc_type: "ip:port", ioc: "192.0.2.1:99999" }, "INVALID_PORT"],
    [{ first_seen: "not-a-date" }, "INVALID_DATE"],
    [{ confidence_level: 101 }, "INVALID_CONFIDENCE"],
  ])("classifies known malformed record %#", (change, reason) => { try { mapThreatFoxItem({ ...base, ...change }); throw new Error("not thrown"); } catch (error) { expect(error).toBeInstanceOf(ThreatFoxMappingError); expect((error as ThreatFoxMappingError).reason).toBe(reason); } });
  it("omits invalid references and does not extract samples", () => { const item = mapThreatFoxItem({ ...base, reference: "javascript:alert(1)", malware_samples: [{ sha256_hash: "a".repeat(64) }] }); expect(item.provider_reference_url).toBeNull(); expect(item.metadata).not.toHaveProperty("malware_samples"); });
});
