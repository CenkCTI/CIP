import { beforeEach, describe, expect, it, vi } from "vitest";

const { nodeGet } = vi.hoisted(() => ({ nodeGet: vi.fn() }));
vi.mock("./client", () => ({ nodeGet }));

import { CORE_GLOBAL_MEASUREMENTS, getNodeMeasurements, getNodeRoutingMeasurements, getNodeRoutingStatus, getNodeSourceStatus } from "./queries";
import { ROUTING_MEASUREMENTS } from "./routing";

describe("BAYKUSH Node global query ownership boundary", () => {
  beforeEach(() => nodeGet.mockReset().mockResolvedValue({apiVersion:"v1",generatedAt:"2026-08-13T00:00:00.000Z",data:[]}));

  it("keeps core and routing measurements in independent bounded failure domains", async () => {
    const userId="11111111-1111-4111-8111-111111111111";const now=new Date("2026-08-13T12:00:00.000Z");
    await getNodeSourceStatus("24h",now);await getNodeMeasurements("24h",now);await getNodeRoutingMeasurements("24h",now);
    expect(nodeGet).toHaveBeenCalledTimes(4);
    for(const [path] of nodeGet.mock.calls as [string,...unknown[]][]){expect(path).not.toContain(userId);expect(path).not.toMatch(/(?:owner|user)(?:Id|_id)?=/i);}
    expect(nodeGet.mock.calls[0]?.[0]).toMatch(/^\/v1\/sources\/status\?from=/);
    const paths=(nodeGet.mock.calls.slice(1) as [string,...unknown[]][]).map(([path])=>path);
    const corePaths=paths.slice(0,2),routingPaths=paths.slice(2);
    expect(corePaths).toHaveLength(2);expect(routingPaths).toHaveLength(1);
    const coreKeys=corePaths.flatMap(path=>new URL(path,"https://node.invalid").searchParams.getAll("measurementKey"));
    const routingKeys=routingPaths.flatMap(path=>new URL(path,"https://node.invalid").searchParams.getAll("measurementKey"));
    expect(new Set(coreKeys)).toEqual(new Set(CORE_GLOBAL_MEASUREMENTS));
    expect(new Set(routingKeys)).toEqual(new Set(ROUTING_MEASUREMENTS));
    for(const path of paths){const url=new URL(path,"https://node.invalid");expect(url.searchParams.getAll("measurementKey").length).toBeLessThanOrEqual(8);expect(url.searchParams.get("resolution")).toBe("AUTO");}
  });

  it("merges core batches while routing remains a separate request", async()=>{
    nodeGet.mockResolvedValueOnce({apiVersion:"v1",generatedAt:"2026-08-13T12:00:01.000Z",data:[{measurement:{measurementKey:"batch-one"}}]}).mockResolvedValueOnce({apiVersion:"v1",generatedAt:"2026-08-13T12:00:02.000Z",data:[{measurement:{measurementKey:"batch-two"}}]});
    const result=await getNodeMeasurements("24h",new Date("2026-08-13T12:00:00.000Z"));
    expect(nodeGet).toHaveBeenCalledTimes(2);expect(result.generatedAt).toBe("2026-08-13T12:00:02.000Z");expect(result.data.map(item=>item.measurement.measurementKey)).toEqual(["batch-one","batch-two"]);expect(result.meta).toEqual({batchCount:2,maxMeasurementsPerRequest:8});
  });

  it("reads routing operational status through the existing server-only Node client",async()=>{await getNodeRoutingStatus();expect(nodeGet).toHaveBeenCalledWith("/v1/techint/routing/status",expect.anything(),{revalidate:15});});
});
