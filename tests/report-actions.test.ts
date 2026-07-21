import { beforeEach, describe, expect, it, vi } from "vitest";

let projectOwner = "u1";
let existingReport: { id: string; project_id: string; title: string } | null = {
  id: "00000000-0000-4000-8000-000000000001",
  project_id: "00000000-0000-4000-8000-0000000000aa",
  title: "R1",
};
let updateResult: "ok" | "zero" | "error" = "ok";
let deleteResult: "ok" | "zero" | "error" = "ok";
function chain(table: string) {
  const c: Record<string, unknown> & {
    _op: string;
    select: unknown;
    eq: unknown;
    insert: unknown;
    update: unknown;
    delete: unknown;
    or: unknown;
    single: unknown;
  } = {
    _op: "",
    select: vi.fn(() => c),
    eq: vi.fn(() => c),
    insert: vi.fn(() => {
      c._op = "insert";
      return c;
    }),
    update: vi.fn(() => {
      c._op = "update";
      return c;
    }),
    delete: vi.fn(() => {
      c._op = "delete";
      return c;
    }),
    or: vi.fn(() => c),
    single: vi.fn(async () => {
      if (table === "projects")
        return {
          data: {
            id: "00000000-0000-4000-8000-0000000000aa",
            owner_id: projectOwner,
          },
          error: null,
        };
      if (table === "reports" && c._op === "update")
        return updateResult === "ok"
          ? { data: { id: existingReport?.id }, error: null }
          : { data: null, error: { code: "PGRST116" } };
      if (table === "reports" && c._op === "delete")
        return deleteResult === "ok"
          ? { data: { id: existingReport?.id }, error: null }
          : { data: null, error: { code: "PGRST116" } };
      if (table === "reports" && c._op === "insert")
        return { data: { id: "new" }, error: null };
      if (table === "reports")
        return existingReport
          ? { data: existingReport, error: null }
          : { data: null, error: { code: "PGRST116" } };
      return { data: [], error: null };
    }),
  };
  return c;
}
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({
    user: { id: "u1" },
    supabase: { from: (table: string) => chain(table) },
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};
const validContent = JSON.stringify({
  type: "doc",
  attrs: { version: 1 },
  content: [{ type: "paragraph" }],
});

describe("report CRUD server actions", () => {
  beforeEach(() => {
    projectOwner = "u1";
    existingReport = {
      id: "00000000-0000-4000-8000-000000000001",
      project_id: "00000000-0000-4000-8000-0000000000aa",
      title: "R1",
    };
    updateResult = "ok";
    deleteResult = "ok";
  });
  it("returns not found for unowned project update", async () => {
    projectOwner = "other";
    const { updateReport } = await import("@/app/actions");
    await expect(
      updateReport(
        "00000000-0000-4000-8000-0000000000aa",
        existingReport!.id,
        {},
        fd({
          title: "R1",
          type: "CTI",
          status: "DRAFT",
          content: validContent,
        }),
      ),
    ).rejects.toThrow("Project not found");
  });
  it("reports missing report before update", async () => {
    existingReport = null;
    const { updateReport } = await import("@/app/actions");
    await expect(
      updateReport(
        "00000000-0000-4000-8000-0000000000aa",
        "00000000-0000-4000-8000-000000000001",
        {},
        fd({
          title: "R1",
          type: "CTI",
          status: "DRAFT",
          content: validContent,
        }),
      ),
    ).resolves.toEqual({ error: "Report not found." });
  });
  it("handles zero-row update without raw database errors", async () => {
    updateResult = "zero";
    const { updateReport } = await import("@/app/actions");
    await expect(
      updateReport(
        "00000000-0000-4000-8000-0000000000aa",
        existingReport!.id,
        {},
        fd({
          title: "R1",
          type: "CTI",
          status: "DRAFT",
          content: validContent,
        }),
      ),
    ).resolves.toEqual({ error: "Unable to save report." });
  });
  it("validates delete confirmation against current database title", async () => {
    const { deleteReport } = await import("@/app/actions");
    await expect(
      deleteReport(
        "00000000-0000-4000-8000-0000000000aa",
        existingReport!.id,
        "stale",
        fd({ confirm: "stale" }),
      ),
    ).resolves.toEqual({
      error: "Confirmation does not match the current report title.",
    });
  });
  it("handles zero-row delete without redirect", async () => {
    deleteResult = "zero";
    const { deleteReport } = await import("@/app/actions");
    await expect(
      deleteReport(
        "00000000-0000-4000-8000-0000000000aa",
        existingReport!.id,
        "R1",
        fd({ confirm: "R1" }),
      ),
    ).resolves.toEqual({ error: "Unable to delete report." });
  });
});
