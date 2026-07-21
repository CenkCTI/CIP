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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies both endpoint IDs before insert", async () => {
    const calls: string[] = [];
    assertGraphEntity.mockImplementation(async () => calls.push("assert"));
    const supabase = {
      from: (table: string) => {
        if (table === "projects") return projectChain();
        if (table === "entity_relationships") {
          return {
            insert: () => {
              calls.push("insert");
              return {
                select: () => ({
                  single: async () => ({ data: { id: "rel-1" }, error: null }),
                }),
              };
            },
          };
        }
        throw new Error(`Unexpected table ${table}`);
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
      {
        params: Promise.resolve({ id: "project-1" }),
      },
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

  it("enforces relationship ownership before PATCH and DELETE", async () => {
    const deleted: string[] = [];
    const supabase = {
      from: (table: string) => {
        if (table === "projects") return projectChain("someone-else");
        if (table === "entity_relationships") {
          return {
            delete: () => {
              deleted.push("delete");
              return { eq: () => ({ eq: async () => ({ error: null }) }) };
            },
          };
        }
        throw new Error(`Unexpected table ${table}`);
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
});
