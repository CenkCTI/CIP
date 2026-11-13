import { afterEach, describe, expect, it, vi } from "vitest";
const requireOwnedProject = vi.fn();
vi.mock("@/lib/projects/ownership", () => ({ requireOwnedProject }));
const projectId = "9c972aae-0a28-4fc7-8769-b617bedb0001";
const fromAssertionId = "dd5d557f-6f09-4ac2-b7e7-08abbd0b0001";
const toAssertionId = "dd5d557f-6f09-4ac2-b7e7-08abbd0b0002";
const requestId = "ce1f11c5-ea5d-4d7a-97d4-91cc8c940201";
const stamp = "2026-11-13T15:00:00+00:00";
const payload = {
  fromAssertionId,toAssertionId,relation: "CITES",rationale: "The second publication cites the first source explicitly.",
  expectedCurrentReviewId: null,requestId,
  expectedContext: {
    fromAssertionUpdatedAt: stamp,toAssertionUpdatedAt: stamp,claimUpdatedAt: stamp,
    fromAnnotationUpdatedAt: stamp,toAnnotationUpdatedAt: stamp,
    fromSourceUpdatedAt: stamp,toSourceUpdatedAt: stamp,
  },
};
const params = { params: Promise.resolve({ id: projectId }) };
const req = (changes = {}) => new Request("https://citem.test/api/lineage", {
  method: "POST",headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...payload, ...changes }),
});
function owner() {
  const result: { data: { review_id: string; replayed: boolean; reviewed_at: string }; error: null | { code: string; message: string } } = {
    data: { review_id: "ee5d557f-6f09-4ac2-b7e7-08abbd0b0001",replayed: false,reviewed_at: stamp },error: null,
  };
  const rpc = vi.fn(() => ({ single: vi.fn(async () => result) }));
  return { projectId,supabase: { rpc,from: vi.fn() },result };
}
afterEach(() => { vi.clearAllMocks(); });

describe("M1C owner-scoped lineage HTTP contract", () => {
  it("sends only validated analyst review fields to the authoritative RPC", async () => {
    const ctx = owner();requireOwnedProject.mockResolvedValue(ctx);
    const { POST } = await import("@/app/api/projects/[id]/analysis/lineage/route");
    const res = await POST(req(),params);
    expect(res.status).toBe(201);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(ctx.supabase.rpc).toHaveBeenCalledWith("save_assertion_lineage_review_v1", {
      p_project_id: projectId,p_from_assertion_id: fromAssertionId,p_to_assertion_id: toAssertionId,
      p_relation: "CITES",p_rationale: payload.rationale,
      p_expected_current_review_id: null,p_request_id: requestId,
      p_expected_context: payload.expectedContext,
    });
  });
  it("rejects forged ownership, self-links, and unsubstantiated independence", async () => {
    const ctx = owner();requireOwnedProject.mockResolvedValue(ctx);
    const { POST } = await import("@/app/api/projects/[id]/analysis/lineage/route");
    expect((await POST(req({ reviewedBy: "admin" }),params)).status).toBe(400);
    expect((await POST(req({ toAssertionId: fromAssertionId }),params)).status).toBe(400);
    expect((await POST(req({ relation: "INDEPENDENT_OBSERVATION",rationale: "Independent" }),params)).status).toBe(400);
    expect(ctx.supabase.rpc).not.toHaveBeenCalled();
    requireOwnedProject.mockRejectedValueOnce(new Error("forbidden"));
    expect((await POST(req(),params)).status).toBe(404);
  });
  it("reports conflicts and exact replay without silent overwrite", async () => {
    const { POST } = await import("@/app/api/projects/[id]/analysis/lineage/route");
    const ctx = owner();ctx.result.data.replayed = true;requireOwnedProject.mockResolvedValueOnce(ctx);
    expect((await POST(req(),params)).status).toBe(200);
    const stale = owner();stale.result.error = { code: "40001",message: "EDIT_CONFLICT" };
    requireOwnedProject.mockResolvedValueOnce(stale);
    expect((await POST(req(),params)).status).toBe(409);
  });
  it("blocks foreign Origin before consulting database", async () => {
    const ctx = owner();requireOwnedProject.mockResolvedValue(ctx);
    const { POST } = await import("@/app/api/projects/[id]/analysis/lineage/route");
    const forged = new Request("https://citem.test/api/lineage",{
      method:"POST",headers:{Origin:"https://attacker.test",Host:"citem.test","Content-Type":"application/json"},
      body:JSON.stringify(payload),
    });
    expect((await POST(forged,params)).status).toBe(403);
    expect(ctx.supabase.rpc).not.toHaveBeenCalled();
  });
});
