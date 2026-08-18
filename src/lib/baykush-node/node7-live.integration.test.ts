import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const liveDescribe = process.env.RUN_NODE7_LIVE_INTEGRATION === "true" ? describe : describe.skip;
type Queries = typeof import("./queries");
let queries: Queries;

function acceptanceRangeNow(): Date {
  // The producer acceptance deliberately places observations at stable minute offsets
  // inside the current UTC hour. A CI run can begin before those offsets occur, so
  // advance only the consumer's explicit bounded query end time. This does not alter
  // producer timestamps or discovery classification; it makes the contract test
  // independent of the workflow's start minute.
  return new Date(Date.now() + 2 * 60 * 60 * 1_000);
}

liveDescribe("CİTEM NODE-7 producer/consumer integration", () => {
  beforeAll(async () => { queries = await import("./queries"); });

  it("consumes deterministic discovery summary and convergence without a threat score", async () => {
    const now = acceptanceRangeNow();
    const summary = await queries.getNodeDiscoverySummary("30d", now);
    expect(summary.apiVersion).toBe("v1");
    expect(summary.data.compositionExpansionCount).toBeGreaterThan(0);
    expect(summary.data.newEntityCount).toBeGreaterThan(0);
    expect("threatScore" in summary.data).toBe(false);

    const convergence = await queries.getNodeConvergence("30d", now);
    expect(convergence.data.length).toBeGreaterThan(0);
    const sameUpstream = convergence.data.filter((item) => item.entityKey === "CVE-2099-7001");
    expect(sameUpstream.some((item) => item.findingType === "SOURCE_SYSTEM_OVERLAP")).toBe(true);
    expect(sameUpstream.some((item) => item.findingType === "MULTI_ORIGIN_CONVERGENCE")).toBe(false);
    const multiOrigin = convergence.data.filter((item) => item.entityKey === "CVE-2099-7004");
    expect(multiOrigin.some((item) => item.findingType === "MULTI_ORIGIN_CONVERGENCE")).toBe(true);
    expect(multiOrigin.some((item) => item.findingType === "CROSS_CLASS_CONVERGENCE")).toBe(true);
  });

  it("preserves effective novelty and positive composition semantics", async () => {
    const now = acceptanceRangeNow();
    const newEntities = await queries.getNodeNewEntities("30d", now);
    expect(newEntities.data.some((item) => item.entityKey === "CVE-2099-7010" && item.findingType === "NEW_ENTITY")).toBe(true);
    expect(newEntities.data.some((item) => item.entityKey === "CVE-2099-7011")).toBe(false);

    const composition = await queries.getNodeComposition("30d", now);
    const finding = composition.data.find((item) => item.entityKey === "CVE-2099-7004");
    expect(finding).toBeTruthy();
    expect(finding?.newUpstreamOriginCount ?? 0).toBeGreaterThan(0);
    expect(finding?.newSourceDefinitionCount ?? 0).toBeGreaterThan(0);
  });

  it("drills from an exact canonical subject to related records and bounded lineage without raw payloads", async () => {
    const related = await queries.getNodeRelatedRecords("CVE", "CVE-2099-7001");
    expect(related.data.relationshipBasis).toBe("EXACT_CANONICAL_ENTITY_OVERLAP");
    expect(related.data.records.length).toBeGreaterThanOrEqual(2);
    expect(new Set(related.data.records.map((record) => record.upstreamOriginKey))).toEqual(new Set(["NODE7_SHARED_ORIGIN"]));

    const lineage = await queries.getNodeEntityLineage("CVE", "CVE-2099-7001");
    expect(lineage.data.nodes.length).toBeGreaterThan(0);
    expect(lineage.data.nodes.length).toBeLessThanOrEqual(100);
    expect(lineage.data.edges.length).toBeLessThanOrEqual(200);
    for (const node of lineage.data.nodes) {
      expect(Object.prototype.hasOwnProperty.call(node.data, "payload")).toBe(false);
    }
  });

  it("consumes an explicit geography map class without interpreting infrastructure as attacker origin", async () => {
    const geography = await queries.getNodeGeographyMap("30d", "OBSERVED_INFRASTRUCTURE_LOCATION", acceptanceRangeNow());
    expect(geography.data.geoClass).toBe("OBSERVED_INFRASTRUCTURE_LOCATION");
    expect(geography.data.countries.length).toBeLessThanOrEqual(250);
    expect(JSON.stringify(geography.data).toLowerCase()).not.toContain("attackerorigin");
  });
});
