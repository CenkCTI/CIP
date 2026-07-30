import { beforeEach, describe, expect, it, vi } from "vitest";
const requireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const P = "11111111-1111-4111-8111-111111111111",
  C = "22222222-2222-4222-8222-222222222222",
  H = "33333333-3333-4333-8333-333333333333",
  E = "44444444-4444-4444-8444-444444444444",
  A = "55555555-5555-4555-8555-555555555555";
type Mutation = {
  table: string;
  operation: string;
  value?: Record<string, unknown>;
};
function db({ missing, fail }: { missing?: string; fail?: string } = {}) {
  const mutations: Mutation[] = [];
  const from = vi.fn((table: string) => {
    let operation = "select",
      value: Record<string, unknown> | undefined;
    // Fluent Supabase test double intentionally supports heterogeneous methods.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {};
    for (const m of ["select", "eq", "is", "neq", "in"]) q[m] = vi.fn(() => q);
    q.insert = vi.fn((v: Record<string, unknown>) => {
      operation = "insert";
      value = v;
      mutations.push({ table, operation, value });
      return q;
    });
    q.update = vi.fn((v: Record<string, unknown>) => {
      operation = "update";
      value = v;
      mutations.push({ table, operation, value });
      return q;
    });
    q.delete = vi.fn(() => {
      operation = "delete";
      mutations.push({ table, operation });
      return q;
    });
    const result = () => {
      if (fail === `${table}:${operation}`)
        return { data: null, error: { code: "FAIL" } };
      if (missing === table) return { data: null, error: null };
      if (table === "projects")
        return { data: { id: P, owner_id: "owner" }, error: null };
      if (table === "campaigns") return { data: { id: C }, error: null };
      if (table === "attribution_evidence_items")
        return { data: { id: E, archived_at: null }, error: null };
      return { data: { id: H }, error: null };
    };
    q.maybeSingle = vi.fn(async () => result());
    q.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(resolve(result()));
    return q;
  });
  return { from, mutations };
}
function hypothesis() {
  const f = new FormData();
  Object.entries({
    title: "Candidate",
    subject_kind: "EXISTING_THREAT_ACTOR",
    threat_actor_id: A,
    subject_label: "",
    proposition: "Candidate conducted activity",
    status: "DRAFT",
    confidence: "MEDIUM",
    analytic_rationale: "",
    key_assumptions: "",
    known_weaknesses: "",
    information_gaps: "",
    status_rationale: "",
  }).forEach(([k, v]) => f.set(k, v));
  return f;
}
beforeEach(() => vi.clearAllMocks());
describe("attribution action persistence", () => {
  it("denies a second user without attempting attribution writes", async () => {
    const x = db();
    requireUser.mockResolvedValue({
      user: { id: "second-user" },
      supabase: { from: x.from },
    });
    const { saveHypothesis } =
      await import("@/app/projects/[id]/attribution-actions");
    expect(await saveHypothesis(P, C, undefined, {}, hypothesis())).toEqual({
      error: "Campaign not found.",
    });
    expect(x.mutations).toHaveLength(0);
  });
  it("owner creates a hypothesis without semantic or Graph mutations", async () => {
    const x = db();
    requireUser.mockResolvedValue({
      user: { id: "owner" },
      supabase: { from: x.from },
    });
    const { saveHypothesis } =
      await import("@/app/projects/[id]/attribution-actions");
    expect(await saveHypothesis(P, C, undefined, {}, hypothesis())).toEqual({
      success: "Hypothesis saved.",
    });
    expect(x.mutations.map((m) => m.table)).toEqual(["attribution_hypotheses"]);
    expect(
      x.mutations.some(
        (m) =>
          m.table === "campaign_threat_actors" ||
          m.table === "entity_relationships",
      ),
    ).toBe(false);
  });
  it("rejects a cross-Investigation Threat Actor before mutation", async () => {
    const x = db({ missing: "threat_actors" });
    requireUser.mockResolvedValue({
      user: { id: "owner" },
      supabase: { from: x.from },
    });
    const { saveHypothesis } =
      await import("@/app/projects/[id]/attribution-actions");
    expect(await saveHypothesis(P, C, undefined, {}, hypothesis())).toEqual({
      error: "Threat Actor not found.",
    });
    expect(x.mutations).toHaveLength(0);
  });
  it("archives and restores evidence with checked persistence", async () => {
    const x = db();
    requireUser.mockResolvedValue({
      user: { id: "owner" },
      supabase: { from: x.from },
    });
    const { setEvidenceArchived } =
      await import("@/app/projects/[id]/attribution-actions");
    expect((await setEvidenceArchived(P, C, E, true, {})).success).toMatch(
      /preserved/,
    );
    expect((await setEvidenceArchived(P, C, E, false, {})).success).toBe(
      "Evidence item restored.",
    );
    expect(
      x.mutations
        .filter((m) => m.table === "attribution_evidence_items")
        .map((m) => m.value?.archived_at),
    ).toEqual([expect.any(String), null]);
  });
  it("returns controlled archive and unlink persistence errors", async () => {
    const archive = db({ fail: "attribution_evidence_items:update" });
    requireUser.mockResolvedValueOnce({
      user: { id: "owner" },
      supabase: { from: archive.from },
    });
    const actions = await import("@/app/projects/[id]/attribution-actions");
    expect(await actions.setEvidenceArchived(P, C, E, true, {})).toEqual({
      error: "Unable to change evidence archive state.",
    });
    const unlink = db({ fail: "attribution_evidence_evaluations:delete" });
    requireUser.mockResolvedValueOnce({
      user: { id: "owner" },
      supabase: { from: unlink.from },
    });
    expect(await actions.unlinkEvaluation(P, C, H, {})).toEqual({
      error: "Unable to unlink evaluation.",
    });
  });
});
