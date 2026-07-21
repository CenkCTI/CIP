import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const assertGraphEntities = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/graph/service", () => ({ assertGraphEntities }));

const uuid1 = "11111111-1111-4111-8111-111111111111";
function projectChain(owner = "user-1") {
  return {
    select: () => ({
      eq: () => ({
        single: async () => ({
          data: { id: "project-1", owner_id: owner },
          error: null,
        }),
      }),
    }),
  };
}

describe("graph layout route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("owner can read positions", async () => {
    const supabase = {
      from: (table: string) =>
        table === "projects"
          ? projectChain()
          : {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    order: () => ({
                      order: async () => ({
                        data: [
                          {
                            entity_type: "ACTOR",
                            entity_id: uuid1,
                            position_x: 10,
                            position_y: 20,
                          },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            },
    };
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    const { GET } = await import("@/app/api/projects/[id]/graph/layout/route");
    const res = await GET(new Request("http://test"), {
      params: Promise.resolve({ id: "project-1" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      positions: [{ entityType: "ACTOR", entityId: uuid1, x: 10, y: 20 }],
    });
  });

  it("foreign project access is rejected before entity queries", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "projects") return projectChain("other");
        throw new Error("entity query should not run");
      },
    };
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    const { PATCH } =
      await import("@/app/api/projects/[id]/graph/layout/route");
    const res = await PATCH(
      new Request("http://test", {
        method: "PATCH",
        body: JSON.stringify({
          positions: [{ entityType: "ACTOR", entityId: uuid1, x: 1, y: 2 }],
        }),
      }),
      { params: Promise.resolve({ id: "project-1" }) },
    );
    expect(res.status).toBe(404);
    expect(assertGraphEntities).not.toHaveBeenCalled();
  });

  it("rejects invalid, NaN, infinite and out-of-range coordinates", async () => {
    const supabase = {
      from: (table: string) =>
        table === "projects" ? projectChain() : { upsert: vi.fn() },
    };
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    const { PATCH } =
      await import("@/app/api/projects/[id]/graph/layout/route");
    for (const x of ["bad", null, 1000001, -1000001]) {
      const res = await PATCH(
        new Request("http://test", {
          method: "PATCH",
          body: JSON.stringify({
            positions: [{ entityType: "ACTOR", entityId: uuid1, x, y: 2 }],
          }),
        }),
        { params: Promise.resolve({ id: "project-1" }) },
      );
      expect(res.status).toBe(400);
    }
  });

  it("cross-project entity IDs are rejected before upsert", async () => {
    assertGraphEntities.mockRejectedValueOnce(
      new Error("NEXT_HTTP_ERROR_FALLBACK;404"),
    );
    const supabase = {
      from: (table: string) =>
        table === "projects"
          ? projectChain()
          : {
              upsert: () => {
                throw new Error("upsert should not run");
              },
            },
    };
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    const { PATCH } =
      await import("@/app/api/projects/[id]/graph/layout/route");
    const res = await PATCH(
      new Request("http://test", {
        method: "PATCH",
        body: JSON.stringify({
          positions: [{ entityType: "ACTOR", entityId: uuid1, x: 1, y: 2 }],
        }),
      }),
      { params: Promise.resolve({ id: "project-1" }) },
    );
    expect(res.status).toBe(404);
  });

  it("duplicate PATCH entries become one final upsert row", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const supabase = {
      from: (table: string) =>
        table === "projects" ? projectChain() : { upsert },
    };
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    assertGraphEntities.mockResolvedValue(undefined);
    const { PATCH } =
      await import("@/app/api/projects/[id]/graph/layout/route");
    const res = await PATCH(
      new Request("http://test", {
        method: "PATCH",
        body: JSON.stringify({
          positions: [
            { entityType: "ACTOR", entityId: uuid1, x: 1, y: 2 },
            { entityType: "ACTOR", entityId: uuid1, x: 3, y: 4 },
          ],
        }),
      }),
      { params: Promise.resolve({ id: "project-1" }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: 1 });
    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          user_id: "user-1",
          entity_type: "ACTOR",
          entity_id: uuid1,
          position_x: 3,
          position_y: 4,
        }),
      ],
      { onConflict: "project_id,user_id,entity_type,entity_id" },
    );
    expect(assertGraphEntities).toHaveBeenCalledWith(
      expect.anything(),
      "project-1",
      [{ entityType: "ACTOR", entityId: uuid1, x: 3, y: 4 }],
    );
  });

  it("reset deletes only the current user's layout", async () => {
    const eqs: unknown[] = [];
    const supabase = {
      from: (table: string) =>
        table === "projects"
          ? projectChain()
          : {
              delete: () => ({
                eq: (...args: unknown[]) => {
                  eqs.push(args);
                  return {
                    eq: async (...args2: unknown[]) => {
                      eqs.push(args2);
                      return { error: null };
                    },
                  };
                },
              }),
            },
    };
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    const { DELETE } =
      await import("@/app/api/projects/[id]/graph/layout/route");
    const res = await DELETE(new Request("http://test"), {
      params: Promise.resolve({ id: "project-1" }),
    });
    expect(res.status).toBe(200);
    expect(eqs).toEqual([
      ["project_id", "project-1"],
      ["user_id", "user-1"],
    ]);
  });
});
