import { beforeEach, describe, expect, it, vi } from "vitest";
import { annotationMethod, annotationReviewSchema } from "@/lib/analysis/annotation-credibility/schema";
import { loadCollectionMetrics } from "@/lib/analysis/annotation-credibility/collection-metrics";
import { loadFusionInventory, parseInventoryFilters } from "@/lib/fusion/inventory";
import { POST } from "@/app/api/projects/[id]/analysis/quality/annotations/[annotationId]/reviews/route";

const { requireOwnedProject } = vi.hoisted(() => ({ requireOwnedProject: vi.fn() }));
vi.mock("@/lib/projects/ownership", () => ({ requireOwnedProject }));

const projectId = "20000000-0000-4000-8000-000000000001";
const annotationId = "b0000000-0000-4000-8000-000000000001";
const reviewId = "c0000000-0000-4000-8000-000000000001";
const input = {
  credibility: 2, rationale: "Analyst reviewed the original observation.",
  methodVersion: annotationMethod, expectedReviewId: null, provenance: "a".repeat(64), requestId: reviewId,
};

describe("Annotation Information Credibility", () => {
  beforeEach(() => requireOwnedProject.mockReset());

  it.each([2, 3, 4, 5, 6])("allows explicit grade %i", (credibility) => {
    expect(annotationReviewSchema.safeParse({ ...input, credibility }).success).toBe(true);
  });

  it.each([0, 1, 7, 2.5, "2", undefined])("rejects unsupported grade %s", (credibility) => {
    expect(annotationReviewSchema.safeParse({ ...input, credibility }).success).toBe(false);
  });

  it.each([
    { rationale: "" }, { rationale: undefined }, { rationale: "a".repeat(4001) },
    { provenance: "unversioned" }, { expectedReviewId: "invalid" }, { verificationAssertionId: reviewId },
    { verificationAssertionId: "invalid" }, { reviewedBy: reviewId },
  ])("rejects malformed or caller-authoritative fields %o", (overrides) => {
    expect(annotationReviewSchema.safeParse({ ...input, ...overrides }).success).toBe(false);
  });

  const params = { params: Promise.resolve({ id: projectId, annotationId }) };
  const request = (data: unknown, origin = "https://citem.test") => new Request("https://citem.test/reviews", {
    method: "POST", body: JSON.stringify(data),
    headers: { "Content-Type": "application/json", Origin: origin, Host: "citem.test", "X-Forwarded-Proto": "https" },
  });

  it("derives the owning project from authorization and returns a private replay receipt", async () => {
    const rpc = vi.fn().mockReturnValue({ single: async () => ({
      data: { review_id: reviewId, replayed: true, reviewed_at: "2026-11-27T12:00:00Z" }, error: null,
    }) });
    requireOwnedProject.mockResolvedValue({ projectId, supabase: { rpc } });
    const result = await POST(request(input), params);
    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    expect(rpc).toHaveBeenCalledWith("save_annotation_credibility_review_v1", expect.objectContaining({
      p_project_id: projectId, p_annotation_id: annotationId, p_provenance: input.provenance,
    }));
  });

  it("rejects invalid subjects, foreign origins, grade one, oversized bodies and unauthorized requests", async () => {
    const rpc = vi.fn();
    requireOwnedProject.mockResolvedValue({ projectId, supabase: { rpc } });
    expect((await POST(request(input, "https://foreign.test"), params)).status).toBe(403);
    expect((await POST(request(input), { params: Promise.resolve({ id: projectId, annotationId: "invalid" }) })).status).toBe(400);
    expect((await POST(request({ ...input, credibility: 1 }), params)).status).toBe(400);
    expect((await POST(request({ ...input, rationale: "é".repeat(9500) }), params)).status).toBe(413);
    requireOwnedProject.mockRejectedValueOnce(new Error("not owned"));
    expect((await POST(request(input), params)).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([["40001", 409], ["42501", 404], ["PGRST202", 503]])("maps database error %s", async (code, status) => {
    requireOwnedProject.mockResolvedValue({ projectId, supabase: {
      rpc: () => ({ single: async () => ({ data: null, error: { code, message: "private internals" } }) }),
    } });
    const result = await POST(request(input), params);
    expect(result.status).toBe(status);
    expect(JSON.stringify(await result.json())).not.toContain("private internals");
  });
});

function mockQuery(table: string, calls: unknown[][], error = false) {
  const result = { count: error ? null : 0, data: [], error: error ? { code: "42P01" } : null };
  const query = { then: (resolve: (value: typeof result) => void) => Promise.resolve(result).then(resolve) };
  for (const operation of ["select", "eq", "in", "is", "not", "order", "range", "contains", "or"]) {
    Object.assign(query, { [operation]: (...args: unknown[]) => { calls.push([table, operation, ...args]); return query; } });
  }
  return query;
}

describe("Collection metrics and Fusion assessment filters", () => {
  it("scopes every exact count to the project and reports each unavailable metric independently", async () => {
    const calls: unknown[][] = [];
    const supabase = { from: (table: string) => mockQuery(table, calls, table === "collection_source_quality_v1") };
    const context = { projectId, supabase } as unknown as Awaited<ReturnType<LoadContext>>;
    const metrics = await loadCollectionMetrics(context);
    expect(metrics).toMatchObject({ questions: 0, gaps: 0, satisfied: 0, sourcePending: null, sourceStale: null, annotationCurrent: 0 });
    for (const table of new Set(calls.map(([table]) => table))) {
      expect(calls).toContainEqual([table, "eq", "project_id", projectId]);
      expect(calls).toContainEqual([table, "select", "*", { count: "exact", head: true }]);
    }
    expect(calls).toContainEqual(["investigation_information_gaps", "in", "status", ["OPEN", "PARTIALLY_RESOLVED"]]);
    expect(calls).toContainEqual(["collection_requirements", "eq", "status", "SATISFIED"]);
  });

  it.each(["2", "unevaluated", "stale"])("applies %s canonically before exact pagination", async (credibility) => {
    const calls: unknown[][] = [];
    requireOwnedProject.mockResolvedValue({ projectId, supabase: { from: (table: string) => mockQuery(table, calls) } });
    const filters = parseInventoryFilters({ credibility, type: "ACTOR", page: "2", country: "PL" });
    const result = await loadFusionInventory(projectId, filters);
    const view = "fusion_inventory_annotation_quality_v1";
    const qualityClause = credibility === "2" ? [view, "eq", "annotation_credibility", 2]
      : credibility === "stale" ? [view, "eq", "annotation_credibility_stale", true]
      : [view, "is", "annotation_review_id", null];
    expect(calls).toContainEqual([view, "eq", "record_type", "ANNOTATION"]);
    expect(calls).toContainEqual([view, "contains", "country_codes", ["PL"]]);
    const range = calls.findIndex((call) => call[0] === view && call[1] === "range");
    expect(calls[range]).toEqual([view, "range", 50, 99]);
    expect(calls.slice(0, range)).toContainEqual(qualityClause);
    expect(result.credibilityFilterUnavailable).toBe(false);
  });

  it("preserves existing inventory and reports the missing credibility filter explicitly", async () => {
    const calls: unknown[][] = [];
    requireOwnedProject.mockResolvedValue({ projectId,
      supabase: { from: (table: string) => mockQuery(table, calls, table === "fusion_inventory_annotation_quality_v1") } });
    const result = await loadFusionInventory(projectId, parseInventoryFilters({ credibility: "unevaluated", type: "ACTOR" }));
    expect(result.credibilityFilterUnavailable).toBe(true);
    expect(calls).toContainEqual(["fusion_inventory_items", "eq", "record_type", "ACTOR"]);
  });
});

type LoadContext = typeof import("@/lib/projects/ownership").requireOwnedProject;
