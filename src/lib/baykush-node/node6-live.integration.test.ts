import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const liveDescribe = process.env.RUN_NODE6_LIVE_INTEGRATION === "true" ? describe : describe.skip;

type Queries = typeof import("./queries");
type Routing = typeof import("./routing");
let queries: Queries;
let routing: Routing;

liveDescribe("CİTEM NODE-6 real RIPE integration", () => {
  beforeAll(async () => {
    queries = await import("./queries");
    routing = await import("./routing");
  });

  it("consumes a real RIPE RIS Live routing head through the NODE-6.3 status contract", async () => {
    const response = await queries.getNodeRoutingStatus();
    expect(response.apiVersion).toBe("v1");
    expect(response.data.sourceKey).toBe("RIPE_RIS_BGP");
    expect(response.data.authority).toBe("BAYKUSH_INTELLIGENCE_NODE");
    expect(response.data.upstreamOrigin).toBe("RIPE_RIS");
    expect(response.data.attribution).toMatch(/RIPE/i);

    expect(response.data.stream.heartbeatFreshness).toBe("FRESH");
    expect(response.data.stream.latestSessionStatus).toBe("STREAMING");
    expect(response.data.stream.messagesObserved).not.toBeNull();
    expect(response.data.stream.segmentsPersisted).not.toBeNull();
    expect(BigInt(response.data.stream.messagesObserved ?? "0")).toBeGreaterThan(0n);
    expect(BigInt(response.data.stream.segmentsPersisted ?? "0")).toBeGreaterThan(0n);
    expect(response.data.stream.latestSourceObservedAt).not.toBeNull();
    expect(response.data.stream.latestNodeReceivedAt).not.toBeNull();

    const latest = response.data.latest;
    expect(latest).not.toBeNull();
    if (!latest) throw new Error("Expected a current routing head from real RIPE RIS Live traffic");
    expect(latest.acquisitionBasis).toBe("LIVE_STREAM");
    expect(latest.acquisitionChannel).toBe("RIS_LIVE_WEBSOCKET");
    expect(BigInt(latest.updateMessages)).toBeGreaterThan(0n);
    expect(latest.rrcCount).toBeGreaterThan(0);
    expect(latest.captureProfileKey).not.toBeNull();
    expect(latest.captureProfileVersion).not.toBeNull();
    expect(latest.captureProfileRrcCount ?? 0).toBeGreaterThan(0);
    expect(["COMPLETE", "PARTIAL", "DEGRADED"]).toContain(latest.liveCollectionCoverage);
    expect(["AVAILABLE", "PARTIAL"]).toContain(latest.dataAvailability);

    const serialized = JSON.stringify(response);
    for (const forbidden of [
      "staging_key",
      "stagingKey",
      "RECOVERY_STAGING_DIR",
      "DATABASE_URL",
      "BAYKUSH_NODE_API_TOKEN",
      "/var/lib/baykush",
      "decoderCommand",
      "stackTrace",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("consumes all seven routing measurement contracts through Node-owned AUTO resolution", async () => {
    const measurements = await queries.getNodeMeasurements("24h", new Date());
    const routingSeries = routing.routingSeries(measurements.data);
    expect(routingSeries).toHaveLength(routing.ROUTING_MEASUREMENTS.length);
    expect(new Set(routingSeries.map((series) => series.measurement.measurementKey)))
      .toEqual(new Set(routing.ROUTING_MEASUREMENTS));

    for (const series of routingSeries) {
      expect(["FIVE_MINUTES", "HOUR", "DAY"]).toContain(series.resolution);
      expect(series.measurement.timeAxis).toBe("SOURCE_OBSERVED_TIME");
      expect(series.measurement.represents.length).toBeGreaterThan(0);
      expect(series.measurement.doesNotRepresent.length).toBeGreaterThan(0);
      expect(series.points.length).toBeGreaterThan(0);
      for (const point of series.points) {
        if (!point.materialized && point.coverage.status === "NO_COVERAGE") {
          expect(point.value).toBeNull();
        }
      }
    }
  });
});
