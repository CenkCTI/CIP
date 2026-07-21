import { describe, expect, it, vi } from "vitest";

const loadProjectGraph = vi.fn();
vi.mock("@/lib/graph/service", () => ({ loadProjectGraph }));

describe("graph API route", () => {
  it("returns an authenticated owner graph payload from the service", async () => {
    loadProjectGraph.mockResolvedValueOnce({
      nodes: [],
      edges: [],
      meta: {
        nodeCount: 0,
        edgeCount: 0,
        truncated: false,
        nodeLimit: 500,
        edgeLimit: 1500,
        omittedNodes: 0,
        omittedEdges: 0,
      },
    });
    const { GET } = await import("@/app/api/projects/[id]/graph/route");
    const response = await GET(new Request("http://test"), {
      params: Promise.resolve({ id: "project-1" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      nodes: [],
      edges: [],
      meta: { truncated: false },
    });
    expect(loadProjectGraph).toHaveBeenCalledWith("project-1");
  });

  it("propagates non-revealing 404s for unauthorized foreign projects", async () => {
    loadProjectGraph.mockRejectedValueOnce(
      new Error("NEXT_HTTP_ERROR_FALLBACK;404"),
    );
    const { GET } = await import("@/app/api/projects/[id]/graph/route");
    await expect(
      GET(new Request("http://test"), {
        params: Promise.resolve({ id: "foreign" }),
      }),
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});
