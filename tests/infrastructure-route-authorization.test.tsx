import { describe, expect, it, vi } from "vitest";

const NOT_FOUND = new Error("NEXT_NOT_FOUND");
const requireOwnedProject = vi.fn();
vi.mock("next/navigation", () => ({ notFound: () => { throw NOT_FOUND; } }));
vi.mock("@/lib/projects/ownership", () => ({ requireOwnedProject }));
vi.mock("@/components/graph/knowledge-graph", () => ({ KnowledgeGraph: () => null }));

const PROJECT = "11111111-1111-4111-8111-111111111111";
const CLUSTER = "22222222-2222-4222-8222-222222222222";

describe("Infrastructure detail authorization", () => {
  it("returns not-found for malformed cluster UUIDs before ownership lookup", async () => {
    const Page = (await import("@/app/projects/[id]/infrastructure/[clusterId]/page")).default;
    await expect(Page({ params: Promise.resolve({ id: PROJECT, clusterId: "bad" }), searchParams: Promise.resolve({}) })).rejects.toBe(NOT_FOUND);
    expect(requireOwnedProject).not.toHaveBeenCalled();
  });

  it("returns not-found for a foreign Investigation", async () => {
    requireOwnedProject.mockRejectedValueOnce(new Error("Investigation not found"));
    const Page = (await import("@/app/projects/[id]/infrastructure/[clusterId]/page")).default;
    await expect(Page({ params: Promise.resolve({ id: PROJECT, clusterId: CLUSTER }), searchParams: Promise.resolve({}) })).rejects.toBe(NOT_FOUND);
  });
});
