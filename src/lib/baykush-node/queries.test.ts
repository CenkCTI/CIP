import { beforeEach, describe, expect, it, vi } from "vitest";

const { nodeGet } = vi.hoisted(() => ({ nodeGet: vi.fn() }));
vi.mock("./client", () => ({ nodeGet }));

import { GLOBAL_MEASUREMENTS, getNodeMeasurements, getNodeSourceStatus } from "./queries";

describe("BAYKUSH Node global query ownership boundary", () => {
  beforeEach(() => nodeGet.mockReset().mockResolvedValue({
    apiVersion: "v1",
    generatedAt: "2026-08-13T00:00:00.000Z",
    data: [],
  }));

  it("never sends a CİTEM user or owner identifier and keeps measurement batches within the Node limit", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const now = new Date("2026-08-13T12:00:00.000Z");

    await getNodeSourceStatus("24h", now);
    await getNodeMeasurements("24h", now);

    expect(nodeGet).toHaveBeenCalledTimes(3);
    for (const [path] of nodeGet.mock.calls as [string, ...unknown[]][]) {
      expect(path).not.toContain(userId);
      expect(path).not.toMatch(/(?:owner|user)(?:Id|_id)?=/i);
    }

    expect(nodeGet.mock.calls[0]?.[0]).toMatch(/^\/v1\/sources\/status\?from=/);
    const measurementPaths=(nodeGet.mock.calls.slice(1) as [string, ...unknown[]][]).map(([path])=>path);
    expect(measurementPaths).toHaveLength(2);

    const requestedKeys=measurementPaths.flatMap(path=>new URL(path,"https://node.invalid").searchParams.getAll("measurementKey"));
    expect(new Set(requestedKeys)).toEqual(new Set(GLOBAL_MEASUREMENTS));
    for(const path of measurementPaths){
      const url=new URL(path,"https://node.invalid");
      expect(url.searchParams.getAll("measurementKey").length).toBeLessThanOrEqual(8);
      expect(url.searchParams.get("resolution")).toBe("AUTO");
    }
  });

  it("merges bounded measurement responses without weakening per-request schema validation", async () => {
    nodeGet
      .mockResolvedValueOnce({apiVersion:"v1",generatedAt:"2026-08-13T12:00:01.000Z",data:[{measurement:{measurementKey:"batch-one"}}]})
      .mockResolvedValueOnce({apiVersion:"v1",generatedAt:"2026-08-13T12:00:02.000Z",data:[{measurement:{measurementKey:"batch-two"}}]});

    const result=await getNodeMeasurements("24h",new Date("2026-08-13T12:00:00.000Z"));

    expect(nodeGet).toHaveBeenCalledTimes(2);
    expect(result.generatedAt).toBe("2026-08-13T12:00:02.000Z");
    expect(result.data.map(item=>item.measurement.measurementKey)).toEqual(["batch-one","batch-two"]);
    expect(result.meta).toEqual({batchCount:2,maxMeasurementsPerRequest:8});
  });
});
