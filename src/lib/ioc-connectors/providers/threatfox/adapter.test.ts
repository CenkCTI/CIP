import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildThreatFoxResult, mapThreatFoxWindow } from "./adapter";
import { ThreatFoxError } from "./errors";

const base = { first_seen: "2026-08-01 07:35:20 UTC", last_seen: null, tags: null, confidence_level: 50 };
const fixture = [
  { ...base, id: "1", ioc_type: "domain", ioc: "example.com" },
  { ...base, id: "2", ioc_type: "url", ioc: "https://example.com/path" },
  { ...base, id: "3", ioc_type: "ip:port", ioc: "192.0.2.44:443" },
  { ...base, id: "4", ioc_type: "ip:port", ioc: "[2001:db8::44]:8443" },
];

describe("ThreatFox window accounting", () => {
  const invalidOrder = { ...base, id: "temporal-order-test", ioc_type: "ip:port", ioc: "198.51.100.17:5776", first_seen: "2026-08-01 08:50:33 UTC", last_seen: "2026-08-01 08:16:40 UTC", confidence_level: 100 };
  it("maps an official four-type fixture", () => { const result = mapThreatFoxWindow(fixture); expect(result.mapped.map(item => item.candidate_type)).toEqual(["DOMAIN", "URL", "IPV4", "IPV6"]); expect(result.diagnostics).toEqual({ received_count: 4, eligible_count: 4, already_seen_count: 0, mapped_count: 4, mapping_skipped_count: 0, skip_reason_counts: {} }); });
  it("preserves valid items and counts a known malformed item", () => { const result = mapThreatFoxWindow([...fixture, { ...base, id: "5", ioc_type: "ip:port", ioc: "bad:443" }]); expect(result.mapped).toHaveLength(4); expect(result.skipped).toEqual([{ provider_skip_reason: "INVALID_IP" }]); expect(result.diagnostics).toMatchObject({ received_count: 5, eligible_count: 5, already_seen_count: 0, mapped_count: 4, mapping_skipped_count: 1, skip_reason_counts: { INVALID_IP: 1 } }); });
  it("aborts on unexpected mapper errors", () => expect(() => mapThreatFoxWindow([fixture[0]], () => { throw new Error("PROGRAMMING_FAILURE"); })).toThrow("PROGRAMMING_FAILURE"));
  it("fails a non-empty zero-mapping response", () => expect(() => mapThreatFoxWindow([{ ...base, id: "5", ioc_type: "unknown", ioc: "ignored" }])).toThrow("THREATFOX_MAPPING_FAILED"));
  it("allows a legitimately empty response", () => expect(mapThreatFoxWindow([]).diagnostics).toEqual({ received_count: 0, eligible_count: 0, already_seen_count: 0, mapped_count: 0, mapping_skipped_count: 0, skip_reason_counts: {} }));
  it("fails rather than truncating over the item limit with safe diagnostics", () => { let error: unknown; try { mapThreatFoxWindow(Array.from({ length: 1001 }, () => fixture[0])); } catch (caught) { error = caught; } expect(error).toBeInstanceOf(ThreatFoxError); expect(error).toMatchObject({ code: "THREATFOX_ITEM_LIMIT", diagnostics: { received_count: 1001 } }); expect(JSON.stringify(error)).not.toContain("example.com"); expect(JSON.stringify(error)).not.toContain("Auth-Key"); });
  it("succeeds with three valid records and one temporal-order skip", () => {
    const result = buildThreatFoxResult([fixture[0], fixture[1], fixture[2], invalidOrder]);
    expect(result.status).toBe("SUCCEEDED");
    expect(result.diagnostics).toEqual({ received_count: 4, eligible_count: 4, already_seen_count: 0, mapped_count: 3, mapping_skipped_count: 1, skip_reason_counts: { INVALID_DATE_ORDER: 1 } });
    expect(result.items.filter(item => "candidate_type" in item)).toHaveLength(3);
    expect(result.items).toContainEqual({ provider_skip_reason: "INVALID_DATE_ORDER" });
    expect(JSON.stringify(result.items)).not.toContain("198.51.100.17");
  });
  it("fails safely when every record has invalid temporal order", () => {
    let error: unknown;
    try { buildThreatFoxResult([invalidOrder, { ...invalidOrder, id: "temporal-order-test-2", ioc: "203.0.113.8:443" }]); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(ThreatFoxError);
    expect(error).toMatchObject({ code: "THREATFOX_MAPPING_FAILED", diagnostics: { received_count: 2, mapping_skipped_count: 2, skip_reason_counts: { INVALID_DATE_ORDER: 2 } } });
    expect(JSON.stringify(error)).not.toContain("198.51.100.17");
    expect(JSON.stringify(error)).not.toContain("2026-08-01");
  });
});

describe("ThreatFox incremental delta",()=>{
 const item=(id:string,ioc=`id-${id}.example`,first_seen="2026-08-01 07:35:20 UTC")=>({...base,id,ioc_type:"domain",ioc,first_seen});
 const cursor=(id:string,date="2026-08-01T08:00:00.000Z")=>JSON.stringify({schema_version:2,provider:"THREATFOX",max_id:id,max_first_seen:date});
 it("does not map an identical second bounded window",()=>{const mapper=vi.fn((raw:unknown)=>{throw new Error(String(raw))});const result=buildThreatFoxResult([item("1"),item("2")],cursor("2"),mapper as never);expect(result).toMatchObject({status:"NOT_MODIFIED",items:[],diagnostics:{received_count:2,eligible_count:0,already_seen_count:2,mapped_count:0,mapping_skipped_count:0}});expect(mapper).not.toHaveBeenCalled();});
 it("maps only a five-record delta and skips one anomaly",()=>{const old=Array.from({length:6},(_,i)=>item(String(i+1)));const delta=[item("7"),item("8"),item("9"),item("10"),{...item("11"),ioc:"bad:443",ioc_type:"ip:port"}];const result=buildThreatFoxResult([...old,...delta],cursor("6"));expect(result).toMatchObject({status:"SUCCEEDED",diagnostics:{received_count:11,eligible_count:5,already_seen_count:6,mapped_count:4,mapping_skipped_count:1}});expect(result.items).toHaveLength(5);});
 it("keeps a late-arriving higher ID eligible",()=>expect(buildThreatFoxResult([item("8","late.example","2026-07-01 00:00:00 UTC")],cursor("7")).diagnostics.eligible_count).toBe(1));
 it("advances past a high-ID temporal anomaly so it is skipped once",()=>{const invalid={...item("99"),first_seen:"2026-08-01 08:50:33 UTC",last_seen:"2026-08-01 08:16:40 UTC"};const first=buildThreatFoxResult([invalid],cursor("98"));expect(first).toMatchObject({status:"SUCCEEDED",diagnostics:{mapped_count:0,mapping_skipped_count:1}});expect(buildThreatFoxResult([invalid],first.nextCursor)).toMatchObject({status:"NOT_MODIFIED",items:[]});});
 it("fails an all-invalid bootstrap without a cursor",()=>expect(()=>buildThreatFoxResult([{...item("1"),ioc_type:"unknown"}])).toThrow("THREATFOX_MAPPING_FAILED"));
 it("aborts an unexpected mapper exception without producing a cursor",()=>expect(()=>buildThreatFoxResult([item("2")],cursor("1"),()=>{throw new Error("PROGRAMMING_FAILURE")})).toThrow("PROGRAMMING_FAILURE"));
});
