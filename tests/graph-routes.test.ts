import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const assertGraphEntity = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/graph/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/graph/service")>(
    "@/lib/graph/service",
  );
  return { ...actual, assertGraphEntity };
});

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

describe("manual relationship route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("verifies both endpoint IDs before insert", async () => {
    const calls: string[] = [];
    assertGraphEntity.mockImplementation(async () => calls.push("assert"));
    const supabase = {
      from: (table: string) =>
        table === "projects"
          ? projectChain()
          : {
              insert: () => {
                calls.push("insert");
                return {
                  select: () => ({
                    single: async () => ({
                      data: { id: "rel-1" },
                      error: null,
                    }),
                  }),
                };
              },
            },
    };
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    const { POST } =
      await import("@/app/api/projects/[id]/relationships/route");
    const response = await POST(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({
          sourceType: "ACTOR",
          sourceId: "11111111-1111-4111-8111-111111111111",
          targetType: "MALWARE",
          targetId: "22222222-2222-4222-8222-222222222222",
          relationshipType: "uses",
        }),
      }),
      { params: Promise.resolve({ id: "project-1" }) },
    );
    expect(response.status).toBe(201);
    expect(calls).toEqual(["assert", "assert", "insert"]);
  });

  it("stops insertion when endpoint verification rejects", async () => {
    assertGraphEntity.mockRejectedValue(
      new Error("NEXT_HTTP_ERROR_FALLBACK;404"),
    );
    const supabase = {
      from: (table: string) => {
        if (table === "projects") return projectChain();
        if (table === "entity_relationships")
          throw new Error("insert should not run");
        throw new Error(`Unexpected table ${table}`);
      },
    };
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    const { POST } =
      await import("@/app/api/projects/[id]/relationships/route");
    await expect(
      POST(
        new Request("http://test", {
          method: "POST",
          body: JSON.stringify({
            sourceType: "ACTOR",
            sourceId: "11111111-1111-4111-8111-111111111111",
            targetType: "MALWARE",
            targetId: "22222222-2222-4222-8222-222222222222",
            relationshipType: "uses",
          }),
        }),
        { params: Promise.resolve({ id: "project-1" }) },
      ),
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("rejects foreign projects without inserting", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "projects") return projectChain("someone-else");
        throw new Error(`Unexpected table ${table}`);
      },
    };
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    const { POST } =
      await import("@/app/api/projects/[id]/relationships/route");
    const response = await POST(
      new Request("http://test", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ id: "project-1" }) },
    );
    expect(response.status).toBe(404);
    expect(assertGraphEntity).not.toHaveBeenCalled();
  });

  it("returns duplicate and self-link rejections", async () => {
    const supabase = {
      from: (table: string) =>
        table === "projects"
          ? projectChain()
          : {
              insert: () => ({
                select: () => ({
                  single: async () => ({
                    data: null,
                    error: { code: "23505" },
                  }),
                }),
              }),
            },
    };
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    assertGraphEntity.mockResolvedValue(undefined);
    const { POST } =
      await import("@/app/api/projects/[id]/relationships/route");
    const duplicate = await POST(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({
          sourceType: "ACTOR",
          sourceId: "11111111-1111-4111-8111-111111111111",
          targetType: "MALWARE",
          targetId: "22222222-2222-4222-8222-222222222222",
          relationshipType: "uses",
        }),
      }),
      { params: Promise.resolve({ id: "project-1" }) },
    );
    const self = await POST(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({
          sourceType: "ACTOR",
          sourceId: "11111111-1111-4111-8111-111111111111",
          targetType: "ACTOR",
          targetId: "11111111-1111-4111-8111-111111111111",
          relationshipType: "uses",
        }),
      }),
      { params: Promise.resolve({ id: "project-1" }) },
    );
    expect(duplicate.status).toBe(409);
    expect(self.status).toBe(400);
  });
});

describe("manual relationship PATCH/DELETE route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enforces project ownership before PATCH and DELETE", async () => {
    const deleted: string[] = [];
    const supabase = {
      from: (table: string) =>
        table === "projects"
          ? projectChain("someone-else")
          : {
              delete: () => {
                deleted.push("delete");
                return { eq: () => ({ eq: async () => ({ error: null }) }) };
              },
            },
    };
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    const route =
      await import("@/app/api/projects/[id]/relationships/[relationshipId]/route");
    const patch = await route.PATCH(
      new Request("http://test", { method: "PATCH", body: "{}" }),
      { params: Promise.resolve({ id: "project-1", relationshipId: "rel-1" }) },
    );
    const del = await route.DELETE(
      new Request("http://test", { method: "DELETE" }),
      { params: Promise.resolve({ id: "project-1", relationshipId: "rel-1" }) },
    );
    expect(patch.status).toBe(404);
    expect(del.status).toBe(404);
    expect(deleted).toEqual([]);
  });

  it("rejects owned project requests when the relationship ID belongs elsewhere", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "projects") return projectChain();
        if (table === "entity_relationships")
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({
                    data: null,
                    error: { code: "PGRST116" },
                  }),
                }),
              }),
            }),
          };
        throw new Error(`Unexpected table ${table}`);
      },
    };
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    const route =
      await import("@/app/api/projects/[id]/relationships/[relationshipId]/route");
    const patch = await route.PATCH(
      new Request("http://test", { method: "PATCH", body: "{}" }),
      {
        params: Promise.resolve({
          id: "project-1",
          relationshipId: "foreign-rel",
        }),
      },
    );
    const del = await route.DELETE(
      new Request("http://test", { method: "DELETE" }),
      {
        params: Promise.resolve({
          id: "project-1",
          relationshipId: "foreign-rel",
        }),
      },
    );
    expect(patch.status).toBe(404);
    expect(del.status).toBe(404);
  });

  it("returns 409 duplicate feedback for PATCH", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "projects") return projectChain();
        if (table === "entity_relationships")
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({ data: { id: "rel-1" }, error: null }),
                }),
              }),
            }),
            update: () => ({
              eq: () => ({ eq: async () => ({ error: { code: "23505" } }) }),
            }),
          };
        throw new Error(`Unexpected table ${table}`);
      },
    };
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    const route =
      await import("@/app/api/projects/[id]/relationships/[relationshipId]/route");
    const patch = await route.PATCH(
      new Request("http://test", {
        method: "PATCH",
        body: JSON.stringify({ relationshipType: "uses" }),
      }),
      { params: Promise.resolve({ id: "project-1", relationshipId: "rel-1" }) },
    );
    expect(patch.status).toBe(409);
    await expect(patch.json()).resolves.toEqual({
      error: "This manual relationship already exists.",
    });
  });
});
