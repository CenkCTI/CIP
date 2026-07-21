import { beforeEach, describe, expect, it, vi } from "vitest";

const doc = {
  type: "doc",
  attrs: { version: 1 },
  content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
};
let project: unknown = { id: "p1", owner_id: "u1" };
let report: unknown = {
  id: "r1",
  project_id: "p1",
  title: "Ops Report",
  type: "CTI",
  status: "FINAL",
  content: doc,
  updated_at: "2026-07-21",
};
function builder(table: string) {
  const chain: Record<string, unknown> & {
    select: unknown;
    eq: unknown;
    single: unknown;
  } = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(async () =>
      table === "projects"
        ? { data: project, error: project ? null : { code: "PGRST116" } }
        : { data: report, error: report ? null : { code: "PGRST116" } },
    ),
  };
  return chain;
}
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({
    user: { id: "u1" },
    supabase: { from: (table: string) => builder(table) },
  })),
}));

describe("report export route", () => {
  beforeEach(() => {
    project = { id: "p1", owner_id: "u1" };
    report = {
      id: "r1",
      project_id: "p1",
      title: "Ops Report",
      type: "CTI",
      status: "FINAL",
      content: doc,
      updated_at: "2026-07-21",
    };
  });
  it("returns markdown content type and attachment filename", async () => {
    const { GET } =
      await import("@/app/api/projects/[id]/reports/[reportId]/export/[format]/route");
    const res = await GET(new Request("http://test"), {
      params: Promise.resolve({ id: "p1", reportId: "r1", format: "md" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("content-disposition")).toContain("Ops-Report.md");
    expect(await res.text()).toContain("hello");
  });
  it("rejects unsupported formats", async () => {
    const { GET } =
      await import("@/app/api/projects/[id]/reports/[reportId]/export/[format]/route");
    const res = await GET(new Request("http://test"), {
      params: Promise.resolve({ id: "p1", reportId: "r1", format: "zip" }),
    });
    expect(res.status).toBe(400);
  });
  it("requires project ownership without leaking report details", async () => {
    project = { id: "p1", owner_id: "other" };
    const { GET } =
      await import("@/app/api/projects/[id]/reports/[reportId]/export/[format]/route");
    const res = await GET(new Request("http://test"), {
      params: Promise.resolve({ id: "p1", reportId: "r1", format: "html" }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
  it("returns non-empty PDF with PDF signature and EOF", async () => {
    const { GET } =
      await import("@/app/api/projects/[id]/reports/[reportId]/export/[format]/route");
    const res = await GET(new Request("http://test"), {
      params: Promise.resolve({ id: "p1", reportId: "r1", format: "pdf" }),
    });
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(res.headers.get("content-type")).toContain("application/pdf");
    expect(bytes.length).toBeGreaterThan(100);
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect(bytes.includes(Buffer.from("%%EOF"))).toBe(true);
  });
});
