import { beforeEach, describe, expect, it, vi } from "vitest";

const { nodeGet } = vi.hoisted(() => ({ nodeGet: vi.fn() }));
vi.mock("./client", () => ({ nodeGet }));

import { getNodeMeasurements, getNodeSourceStatus } from "./queries";

describe("BAYKUSH Node global query ownership boundary", () => {
  beforeEach(() => nodeGet.mockReset().mockResolvedValue({
    apiVersion: "v1",
    generatedAt: "2026-08-13T00:00:00.000Z",
    data: [],
  }));

  it("never sends a CİTEM user or owner identifier to global Node endpoints", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const now = new Date("2026-08-13T12:00:00.000Z");

    await getNodeSourceStatus("24h", now);
    await getNodeMeasurements("24h", now);

    expect(nodeGet).toHaveBeenCalledTimes(2);
    for (const [path] of nodeGet.mock.calls as [string, ...unknown[]][]) {
      expect(path).not.toContain(userId);
      expect(path).not.toMatch(/(?:owner|user)(?:Id|_id)?=/i);
    }
    expect(nodeGet.mock.calls[0]?.[0]).toMatch(/^\/v1\/sources\/status\?from=/);
    expect(nodeGet.mock.calls[1]?.[0]).toMatch(/^\/v1\/techint\/measurements\?measurementKey=/);
  });
});
