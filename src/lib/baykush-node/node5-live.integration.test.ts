import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const liveDescribe = process.env.RUN_NODE5_LIVE_INTEGRATION === "true" ? describe : describe.skip;

type Queries = typeof import("./queries");
let queries: Queries;

liveDescribe("CİTEM BAYKUSH Node live integration", () => {
  beforeAll(async () => {
    queries = await import("./queries");
  });

  it("reads the expanded admitted source inventory from a real Node v1 API", async () => {
    const sources = await queries.getNodeSources();
    expect(sources.apiVersion).toBe("v1");
    expect(sources.data).toHaveLength(13);

    const keys = new Set(sources.data.map((source) => source.sourceKey));
    for (const expected of [
      "FEODO_TRACKER",
      "SSLBL_CERTIFICATE",
      "GITHUB_ADVISORY_REVIEWED",
      "MITRE_ATTACK_ENTERPRISE",
      "JVN_IPEDIA",
      "CISA_ICS_CSAF",
      "CERT_EU_SECURITY_ADVISORY",
      "SIEMENS_PRODUCTCERT_CSAF",
    ]) {
      expect(keys.has(expected)).toBe(true);
    }
    expect(keys.has("TEST_SYNTHETIC")).toBe(false);
    expect(keys.has("URLHAUS")).toBe(false);
  });

  it("parses real source health without sending a CİTEM owner identity", async () => {
    const now = new Date();
    const status = await queries.getNodeSourceStatus("24h", now);
    expect(status.apiVersion).toBe("v1");
    expect(status.data).toHaveLength(13);
    expect(status.data.every((source) => source.authority === "BAYKUSH_INTELLIGENCE_NODE")).toBe(true);
    expect(status.data.some((source) => source.sourceKey === "GITHUB_ADVISORY_REVIEWED")).toBe(true);
  });

  it("consumes all Global View metrics through the real bounded batching contract", async () => {
    const now = new Date();
    const measurements = await queries.getNodeMeasurements("24h", now);
    expect(measurements.apiVersion).toBe("v1");
    expect(measurements.meta).toEqual({ batchCount: 3, maxMeasurementsPerRequest: 8 });
    expect(measurements.data).toHaveLength(queries.GLOBAL_MEASUREMENTS.length);
    expect(queries.GLOBAL_MEASUREMENTS).toHaveLength(18);

    const actual = new Set(measurements.data.map((series) => series.measurement.measurementKey));
    expect(actual).toEqual(new Set(queries.GLOBAL_MEASUREMENTS));

    for (const series of measurements.data) {
      expect(series.measurement.represents.length).toBeGreaterThan(0);
      expect(series.measurement.doesNotRepresent.length).toBeGreaterThan(0);
      for (const point of series.points) {
        if (!point.materialized && point.coverage.status === "NO_COVERAGE") {
          expect(point.value).toBeNull();
        }
      }
    }
  });

  it("reads real canonical Node evidence without exposing raw-storage internals", async () => {
    const records = await queries.getNodeRecords("sourceKey=GITHUB_ADVISORY_REVIEWED&limit=5");
    expect(records.apiVersion).toBe("v1");
    expect(records.data.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(records.data);
    expect(serialized).not.toContain("payload_sha256");
    expect(serialized).not.toContain("raw_source_records");
  });
});
