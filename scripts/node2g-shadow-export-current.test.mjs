import { describe, expect, it } from "vitest";
import { canonicalizeNode2gShadowSnapshot } from "./node2g-shadow-export-current.mjs";

function record(id, score, percentile) {
  return {
    sourceRecordId: id,
    subject: { kind: "CVE", value: id },
    times: { publishedAt: null, effectiveAt: null, upstreamUpdatedAt: null },
    facts: { cve: id, score, percentile, scoreDate: "2099-01-01" },
  };
}

describe("NODE-2G current shadow projection", () => {
  it("reconstructs the deterministic FIRST EPSS top-2500 population from append-only history", () => {
    const records = [];
    for (let i = 0; i < 2500; i += 1) {
      records.push(record(`CVE-2099-${String(10000 + i)}`, 1 - i / 10000, 1 - i / 20000));
    }
    records.push(record("CVE-2099-99990", 0.01, 0.01));
    records.push(record("CVE-2099-99991", 0.02, 0.02));

    const result = canonicalizeNode2gShadowSnapshot({ sourceKey: "FIRST_EPSS", records });
    expect(result.records).toHaveLength(2500);
    expect(result.records.map((item) => item.sourceRecordId)).not.toContain("CVE-2099-99990");
    expect(result.records.map((item) => item.sourceRecordId)).not.toContain("CVE-2099-99991");
  });

  it("uses percentile and CVE identity as deterministic tie breakers", () => {
    const result = canonicalizeNode2gShadowSnapshot({
      sourceKey: "FIRST_EPSS",
      records: [
        record("CVE-2099-0003", 0.9, 0.8),
        record("CVE-2099-0002", 0.9, 0.9),
        record("CVE-2099-0001", 0.9, 0.9),
      ],
    });
    expect(result.records.map((item) => item.sourceRecordId)).toEqual([
      "CVE-2099-0001",
      "CVE-2099-0002",
      "CVE-2099-0003",
    ]);
  });

  it("leaves non-EPSS snapshots untouched", () => {
    const snapshot = { sourceKey: "THREATFOX", records: [record("CVE-2099-0001", 0.5, 0.5)] };
    expect(canonicalizeNode2gShadowSnapshot(snapshot)).toBe(snapshot);
  });
});
