import { describe, expect, it, vi } from "vitest";

const NOT_FOUND = new Error("NEXT_NOT_FOUND");
const requireOwnedProject = vi.fn();
vi.mock("next/navigation", () => ({ notFound: () => { throw NOT_FOUND; } }));
vi.mock("@/lib/projects/ownership", () => ({ requireOwnedProject }));
vi.mock("@/components/sources/source-registry", () => ({ SourceRegistry: () => null }));

function query(result: Record<string, unknown>) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "not"]) chain[method] = vi.fn(() => chain);
  chain.single = vi.fn(async () => result);
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

function context(
  sourceResult: { data: Record<string, unknown> | null; error: Record<string, unknown> | null } = {
    data: { id: "22222222-2222-4222-8222-222222222222", title: "Owned", evidence_id: null },
    error: null,
  },
) {
  return {
    projectId: "11111111-1111-4111-8111-111111111111",
    supabase: {
      from: vi.fn((table: string) => {
        if (table === "sources") return query(sourceResult);
        if (table === "projects") return query({ data: { id: "1", name: "Owned" }, error: null });
        return query({ data: [], error: null, count: 0 });
      }),
    },
  };
}

describe("Source routes controlled not-found authorization", () => {
  it("renders the registry for its owning user", async () => {
    const Page = (await import("@/app/projects/[id]/sources/page")).default;
    requireOwnedProject.mockResolvedValueOnce(context());
    await expect(
      Page({ params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) }),
    ).resolves.toBeTruthy();
  });

  it.each([
    ["registry", () => import("@/app/projects/[id]/sources/page")],
    ["detail", () => import("@/app/projects/[id]/sources/[sourceId]/page")],
  ])("returns not-found when the %s Investigation is foreign", async (_name, load) => {
    requireOwnedProject.mockRejectedValueOnce(new Error("Investigation not found"));
    const Page = (await load()).default;
    await expect(Page({ params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111", sourceId: "22222222-2222-4222-8222-222222222222" }) })).rejects.toBe(NOT_FOUND);
  });

  it("returns not-found for a malformed Source ID without querying ownership", async () => {
    const Page = (await import("@/app/projects/[id]/sources/[sourceId]/page")).default;
    await expect(Page({ params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111", sourceId: "bad" }) })).rejects.toBe(NOT_FOUND);
  });

  it("renders an owned Source and returns not-found for missing or cross-Investigation Sources", async () => {
    const Page = (await import("@/app/projects/[id]/sources/[sourceId]/page")).default;
    requireOwnedProject.mockResolvedValueOnce(context());
    await expect(Page({ params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111", sourceId: "22222222-2222-4222-8222-222222222222" }) })).resolves.toBeTruthy();

    requireOwnedProject.mockResolvedValueOnce(context({ data: null, error: { code: "PGRST116" } }));
    await expect(Page({ params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111", sourceId: "33333333-3333-4333-8333-333333333333" }) })).rejects.toBe(NOT_FOUND);
  });
});
