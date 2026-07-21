import { describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser }));

describe("loadProjectGraph authorization", () => {
  it("rejects a foreign project before entity or join queries", async () => {
    const queriedTables: string[] = [];
    const supabase = {
      from: (table: string) => {
        queriedTables.push(table);
        if (table !== "projects") throw new Error(`Unexpected table ${table}`);
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: "project-1", owner_id: "someone-else" },
                error: null,
              }),
            }),
          }),
        };
      },
    };
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    const { loadProjectGraph } = await import("@/lib/graph/service");
    await expect(loadProjectGraph("project-1")).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    expect(queriedTables).toEqual(["projects"]);
  });
});
