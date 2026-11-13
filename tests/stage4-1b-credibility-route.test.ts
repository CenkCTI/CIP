import { afterEach, describe, expect, it, vi } from "vitest";

const projectId = "9c972aae-0a28-4fc7-8769-b617bedb0001";
const assertionId = "dd5d557f-6f09-4ac2-b7e7-08abbd0b0001";
const witnessId = "dd5d557f-6f09-4ac2-b7e7-08abbd0b0002";
const reviewId = "ee5d557f-6f09-4ac2-b7e7-08abbd0b0001";
const requestId = "ce1f11c5-ea5d-4d7a-97d4-91cc8c940131";
const requireOwnedProject = vi.fn();
vi.mock("@/lib/projects/ownership", () => ({ requireOwnedProject }));
const params = { params: Promise.resolve({ id: projectId, assertionId }) };
const base = {
  credibility: 3, rationale: "The assertion may be correct but lacks verification.",
  independenceStatus: "UNKNOWN", independenceRationale: "", verificationAssertionId: null,
  methodVersion: "ADMIRALTY_INFORMATION_V1", expectedCurrentReviewId: null, requestId,
};
const req = (value: Record<string, unknown> = {}) => new Request("https://citem.test/quality", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...base, ...value }),
});
function chain(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) q[method] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => result);
  q.range = vi.fn(async () => result);
  return q;
}
function owner() {
  const result: { data: { review_id: string; replayed: boolean; reviewed_at: string }; error: null | { code: string; message: string } } = {
    data: { review_id: reviewId, replayed: false, reviewed_at: "2026-11-13T13:00:00+00:00" }, error: null,
  };
  const rpc = vi.fn(() => ({ single: vi.fn(async () => result) }));
  const from = vi.fn();
  return { projectId, user: { id: "58a138e3-6ff0-4e85-b00e-51b9474c0001" }, supabase: { rpc, from }, result };
}
afterEach(() => { vi.clearAllMocks(); });

describe("M1B owner-only credibility HTTP API", () => {
  it("stores a review only through the server-controlled RPC", async () => {
    const ctx = owner(); requireOwnedProject.mockResolvedValueOnce(ctx);
    const { POST } = await import("@/app/api/projects/[id]/analysis/quality/assertions/[assertionId]/reviews/route");
    const response = await POST(req(), params);
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(ctx.supabase.rpc).toHaveBeenCalledWith("save_assertion_credibility_review_v1", {
      p_project_id: projectId, p_assertion_id: assertionId,
      p_credibility: 3, p_rationale: base.rationale,
      p_independence_status: "UNKNOWN", p_independence_rationale: "",
      p_verification_assertion_id: null,
      p_method_version: "ADMIRALTY_INFORMATION_V1",
      p_expected_current_review_id: null, p_request_id: requestId,
    });
    expect((await response.json()).reviewId).toBe(reviewId);
  });
  it("requires substantial corroboration for level one", async () => {
    const ctx = owner(); requireOwnedProject.mockResolvedValue(ctx);
    const { POST } = await import("@/app/api/projects/[id]/analysis/quality/assertions/[assertionId]/reviews/route");
    expect((await POST(req({ credibility: 1 }), params)).status).toBe(400);
    expect((await POST(req({ credibility: 1, independenceStatus: "ANALYST_VERIFIED_INDEPENDENT" }), params)).status).toBe(400);
    const independent = await POST(req({
      credibility: 1, independenceStatus: "ANALYST_VERIFIED_INDEPENDENT",
      verificationAssertionId: witnessId,
      independenceRationale: "Independent field observations, not copied from the first publication.",
      rationale: "A second independent observation confirms the attack infrastructure and its timing using primary evidence.",
    }), params);
    expect(independent.status).toBe(201);
    expect(ctx.supabase.rpc).toHaveBeenCalledTimes(1);
  });
  it("returns 200 for replay, 409 for stale revision and no mutations outside owner projects", async () => {
    const { POST } = await import("@/app/api/projects/[id]/analysis/quality/assertions/[assertionId]/reviews/route");
    const replay = owner(); replay.result.data.replayed = true;
    requireOwnedProject.mockResolvedValueOnce(replay);
    expect((await POST(req(), params)).status).toBe(200);
    const stale = owner(); stale.result.error = { code: "40001", message: "EDIT_CONFLICT" };
    requireOwnedProject.mockResolvedValueOnce(stale);
    expect((await POST(req(), params)).status).toBe(409);
    requireOwnedProject.mockRejectedValueOnce(new Error("not owned"));
    expect((await POST(req(), params)).status).toBe(404);
  });
  it("blocks forged origin, invalid score, and authority spoofing before saving", async () => {
    const { POST } = await import("@/app/api/projects/[id]/analysis/quality/assertions/[assertionId]/reviews/route");
    const ctx = owner(); requireOwnedProject.mockResolvedValue(ctx);
    expect((await POST(req({ credibility: 7 }), params)).status).toBe(400);
    expect((await POST(req({ reviewedBy: "admin" }), params)).status).toBe(400);
    const forged = new Request("https://citem.test/quality", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.test", Host: "citem.test" },
      body: JSON.stringify(base),
    });
    expect((await POST(forged, params)).status).toBe(403);
    expect(ctx.supabase.rpc).not.toHaveBeenCalled();
  });
  it("reads previous versions after unlink, distinguishing no evaluation from 6", async () => {
    const ctx = owner();
    let reviews = 0;
    const prior = { id: reviewId, credibility: 6, revision: 1, assessed_at: "2026-11-13T13:00:00Z",
      assertion_identity_snapshot: { sourceTitle: "Removed source", stance: "ASSERTS" } };
    ctx.supabase.from.mockImplementation((table: string) => {
      if (table === "source_claim_assertions") return chain({ data: null, error: null });
      if (table === "assertion_credibility_reviews") return chain({ data: reviews++ === 0 ? prior : [prior], error: null });
      throw Error("unexpected DB table " + table);
    });
    requireOwnedProject.mockResolvedValueOnce(ctx);
    const { GET } = await import("@/app/api/projects/[id]/analysis/quality/assertions/[assertionId]/route");
    const response = await GET(new Request("https://citem.test/quality?page=1"), params);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.assertionStatus).toBe("UNAVAILABLE");
    expect(data.sourceTitle).toBe("Removed source");
    expect(data.current.credibility).toBe(6);
    expect(data.history).toHaveLength(1);
  });
});
