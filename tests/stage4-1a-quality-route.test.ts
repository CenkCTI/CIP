import { afterEach, describe, expect, it, vi } from "vitest";

const projectId = "9c972aae-0a28-4fc7-8769-b617bedb0001";
const sourceId = "7b5d557f-6f09-4ac2-b7e7-08abbd0b0001";
const requestId = "ce1f11c5-ea5d-4d7a-97d4-91cc8c940011";
const reviewId = "ce1f11c5-ea5d-4d7a-97d4-91cc8c940022";
const requireOwnedProject = vi.fn();
vi.mock("@/lib/projects/ownership", () => ({ requireOwnedProject }));

const params = { params: Promise.resolve({ id: projectId, sourceId }) };
const review = { rating: "B", rationale: "Previous reports were independently verified.",
  methodVersion: "ADMIRALTY_SOURCE_V1", expectedCurrentReviewId: null, requestId };

function req(value: Record<string, unknown> = {}) {
  return new Request("https://citem.test/quality", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...review, ...value }),
  });
}

function chain(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) q[method] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => result);
  q.range = vi.fn(async () => result);
  return q;
}

function owner() {
  const rpcResult: { data: { review_id: string; replayed: boolean; reviewed_at: string }; error: null | { code: string; message: string } } = { data: { review_id: reviewId, replayed: false, reviewed_at: "2026-11-13T11:00:00Z" }, error: null };
  const rpc = vi.fn(() => ({ single: vi.fn(async () => rpcResult) }));
  const from = vi.fn();
  const supabase = { rpc, from };
  return { projectId, user: { id: "58a138e3-6ff0-4e85-b00e-51b9474c0001" }, supabase, rpcResult };
}

afterEach(() => { vi.clearAllMocks(); });

describe("Stage 4.1 M1A owner-scoped quality API", () => {
  it("saves only an owned Source review through the dedicated RPC", async () => {
    const ctx = owner(); requireOwnedProject.mockResolvedValueOnce(ctx);
    const { POST } = await import("@/app/api/projects/[id]/analysis/quality/sources/[sourceId]/reviews/route");
    const result = await POST(req(), params);
    expect(result.status).toBe(201);
    expect(result.headers.get("Cache-Control")).toContain("no-store");
    expect(ctx.supabase.rpc).toHaveBeenCalledWith("save_source_reliability_review_v1", {
      p_project_id: projectId, p_source_id: sourceId, p_rating: "B",
      p_rationale: review.rationale, p_method_version: "ADMIRALTY_SOURCE_V1",
      p_expected_current_review_id: null, p_request_id: requestId,
    });
    expect((await result.json()).reviewId).toBe(reviewId);
  });
  it("returns 200 on identical replay and 409 on revision conflict", async () => {
    const ctx = owner(); ctx.rpcResult.data.replayed = true;
    requireOwnedProject.mockResolvedValueOnce(ctx);
    const { POST } = await import("@/app/api/projects/[id]/analysis/quality/sources/[sourceId]/reviews/route");
    expect((await POST(req(), params)).status).toBe(200);
    const conflict = owner(); conflict.rpcResult.error = { code: "40001", message: "EDIT_CONFLICT" };
    requireOwnedProject.mockResolvedValueOnce(conflict);
    expect((await POST(req(), params)).status).toBe(409);
  });
  it("denies cross-project access without executing review RPC", async () => {
    requireOwnedProject.mockRejectedValueOnce(new Error("Not owned"));
    const { POST } = await import("@/app/api/projects/[id]/analysis/quality/sources/[sourceId]/reviews/route");
    expect((await POST(req(), params)).status).toBe(404);
  });
  it("rejects invalid grades, attempted authority injection and forged origin", async () => {
    const ctx = owner();
    requireOwnedProject.mockResolvedValue(ctx);
    const { POST } = await import("@/app/api/projects/[id]/analysis/quality/sources/[sourceId]/reviews/route");
    expect((await POST(req({ rating: "HIGH" }), params)).status).toBe(400);
    expect((await POST(req({ assessedBy: "admin" }), params)).status).toBe(400);
    const forged = new Request("https://citem.test/quality", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.test", Host: "citem.test" },
      body: JSON.stringify(review),
    });
    expect((await POST(forged, params)).status).toBe(403);
    expect(ctx.supabase.rpc).not.toHaveBeenCalled();
  });
  it("reads owner-only bounded history and distinguishes missing Source from F", async () => {
    const ctx = owner();
    const current = { id: reviewId, revision: 1, rating: "F", rationale: review.rationale,
      method_version: "ADMIRALTY_SOURCE_V1", assessed_by: ctx.user.id,
      assessed_at: "2026-11-13T11:00:00Z", supersedes_id: null,
      source_updated_at: "2026-11-12T11:00:00Z", source_context_fingerprint: "a".repeat(64),
      source_identity_snapshot: { title: "Deleted source", publisher: "Reporter", sourceType: "WEB_PAGE" } };
    let reviews = 0;
    ctx.supabase.from.mockImplementation((table: string) => {
      if (table === "sources") return chain({ data: null, error: null });
      if (table === "source_reliability_reviews") return chain({ data: reviews++ === 0 ? current : [current], error: null });
      throw new Error("Unexpected table " + table);
    });
    requireOwnedProject.mockResolvedValueOnce(ctx);
    const { GET } = await import("@/app/api/projects/[id]/analysis/quality/sources/[sourceId]/route");
    const result = await GET(new Request("https://citem.test/quality?page=1"), params);
    expect(result.status).toBe(200);
    const data = await result.json();
    expect(data.sourceStatus).toBe("UNAVAILABLE");
    expect(data.current.rating).toBe("F");
    expect(data.history).toHaveLength(1);
    expect(data.sourceTitle).toBe("Deleted source");
  });
});
