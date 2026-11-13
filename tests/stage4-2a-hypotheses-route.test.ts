import { afterEach, describe, expect, it, vi } from "vitest";
const requireOwnedProject = vi.fn();
vi.mock("@/lib/projects/ownership", () => ({ requireOwnedProject }));
const projectId = "f29a1f50-ffdd-46bc-87a4-300dc6c3b1d1";
const hypothesisId = "f29a1f50-ffdd-46bc-87a4-300dc6c3b1d2";
const assertionId = "f29a1f50-ffdd-46bc-87a4-300dc6c3b1d3";
const requestId = "f29a1f50-ffdd-46bc-87a4-300dc6c3b1d4";
const timestamp = "2026-11-13T19:00:00+00:00";
const rootParams = { params: Promise.resolve({ id: projectId }) };
const itemParams = { params: Promise.resolve({ id: projectId, hypothesisId }) };
const hypothesis = {
  hypothesisId: null, title: "H1 shared infrastructure",
  proposition: "The infrastructure could have been shared through operational coordination.",
  disconfirmationTest: "Independent registrant records would show the infrastructure is unrelated.",
  status: "OPEN", rationale: "Provisional analyst working hypothesis.",
  expectedCurrentVersionId: null, requestId,
};
const evidence = { assertionId, role: "CONTRADICTS",
  rationale: "The independent source explicitly challenges the claimed operational link.",
  expectedCurrentReviewId: null,
  expectedContext: { assertionUpdatedAt: timestamp, claimUpdatedAt: timestamp,
    annotationUpdatedAt: timestamp, sourceUpdatedAt: timestamp }, requestId,
};
const req = (body: unknown) => new Request("https://citem.test/analysis", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
function owner(row: Record<string, unknown>) {
  const result: { data: Record<string, unknown>; error: { code: string } | null } = { data: row, error: null };
  const rpc = vi.fn(() => ({ single: vi.fn(async () => result) }));
  return { projectId, supabase: { rpc }, result };
}
afterEach(() => { vi.clearAllMocks(); });
describe("M2A hypothesis and evidence RPC boundaries", () => {
  it("creates a hypothesis with analyst data only", async () => {
    const ctx = owner({ hypothesis_id: hypothesisId, version_id: requestId, replayed: false });
    requireOwnedProject.mockResolvedValueOnce(ctx);
    const { POST } = await import("@/app/api/projects/[id]/analysis/hypotheses/route");
    const result = await POST(req(hypothesis), rootParams);
    expect(result.status).toBe(201);
    expect(result.headers.get("Cache-Control")).toContain("no-store");
    expect(ctx.supabase.rpc).toHaveBeenCalledWith("save_analytic_hypothesis_v1", {
      p_project_id: projectId, p_hypothesis_id: null,
      p_title: hypothesis.title, p_proposition: hypothesis.proposition,
      p_disconfirmation_test: hypothesis.disconfirmationTest, p_status: "OPEN",
      p_rationale: hypothesis.rationale, p_expected_current_version_id: null, p_request_id: requestId,
    });
  });
  it("rejects spoofed authority, malformed evidence, and foreign origin before mutation", async () => {
    const ctx = owner({ hypothesis_id: hypothesisId, version_id: requestId, replayed: false });
    requireOwnedProject.mockResolvedValue(ctx);
    const { POST: saveHyp } = await import("@/app/api/projects/[id]/analysis/hypotheses/route");
    const { POST: saveEvidence } = await import("@/app/api/projects/[id]/analysis/hypotheses/[hypothesisId]/route");
    expect((await saveHyp(req({ ...hypothesis, createdBy: "admin" }), rootParams)).status).toBe(400);
    expect((await saveEvidence(req({ ...evidence, confidence: "CERTAIN" }), itemParams)).status).toBe(400);
    expect((await saveEvidence(req({ ...evidence, role: "PROVEN_TRUE" }), itemParams)).status).toBe(400);
    const forged = new Request("https://citem.test/analysis", { method: "POST",
      headers: { Origin: "https://evil.test", Host: "citem.test", "Content-Type": "application/json" },
      body: JSON.stringify(hypothesis) });
    expect((await saveHyp(forged, rootParams)).status).toBe(403);
    expect(ctx.supabase.rpc).not.toHaveBeenCalled();
  });
  it("saves a contradictory evidence role via the owner-scoped RPC", async () => {
    const ctx = owner({ review_id: requestId, replayed: false });
    requireOwnedProject.mockResolvedValueOnce(ctx);
    const { POST } = await import("@/app/api/projects/[id]/analysis/hypotheses/[hypothesisId]/route");
    expect((await POST(req(evidence), itemParams)).status).toBe(201);
    expect(ctx.supabase.rpc).toHaveBeenCalledWith("save_analytic_hypothesis_evidence_v1", {
      p_project_id: projectId, p_hypothesis_id: hypothesisId, p_assertion_id: assertionId,
      p_role: "CONTRADICTS", p_rationale: evidence.rationale, p_expected_current_review_id: null,
      p_expected_context: evidence.expectedContext, p_request_id: requestId,
    });
  });
  it("returns conflict and owner isolation statuses", async () => {
    const { POST } = await import("@/app/api/projects/[id]/analysis/hypotheses/route");
    const ctx = owner({ hypothesis_id: hypothesisId, version_id: requestId, replayed: false });
    ctx.result.error = { code: "40001" };
    requireOwnedProject.mockResolvedValueOnce(ctx);
    expect((await POST(req(hypothesis), rootParams)).status).toBe(409);
    requireOwnedProject.mockRejectedValueOnce(new Error("denied"));
    expect((await POST(req(hypothesis), rootParams)).status).toBe(404);
  });
});
