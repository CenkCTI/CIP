import { describe, expect, it, vi, beforeEach } from "vitest";
const NOT_FOUND = new Error("NEXT_NOT_FOUND"),
  requireUser = vi.fn();
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
}));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/components/attribution/forms", () => ({
  AssessmentForm: () => null,
  ArchiveForm: () => null,
  EvidenceArchiveForm: () => null,
  EvidenceForm: () => null,
  EvaluationForm: () => null,
  HypothesisForm: () => null,
  UnlinkEvaluation: () => null,
}));
const P = "11111111-1111-4111-8111-111111111111",
  C = "22222222-2222-4222-8222-222222222222",
  H = "33333333-3333-4333-8333-333333333333";
function emptyDb() {
  return {
    from: vi.fn(() => {
      // Fluent Supabase test double intentionally supports heterogeneous methods.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {};
      for (const method of ["select", "eq", "is", "neq", "order"])
        q[method] = vi.fn(() => q);
      q.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
      q.then = (resolve: (x: unknown) => void) =>
        resolve({ data: [], error: null });
      return q;
    }),
  };
}
beforeEach(() => vi.clearAllMocks());
describe("attribution route authorization", () => {
  it("rejects malformed project and Campaign UUIDs before database access", async () => {
    const Page = (
      await import("@/app/projects/[id]/campaigns/[campaignId]/attribution/page")
    ).default;
    await expect(
      Page({
        params: Promise.resolve({ id: "bad", campaignId: C }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toBe(NOT_FOUND);
    await expect(
      Page({
        params: Promise.resolve({ id: P, campaignId: "bad" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toBe(NOT_FOUND);
    expect(requireUser).not.toHaveBeenCalled();
  });
  it("maps a foreign Investigation or Campaign to controlled not-found", async () => {
    requireUser.mockResolvedValue({
      user: { id: "other" },
      supabase: emptyDb(),
    });
    const Page = (
      await import("@/app/projects/[id]/campaigns/[campaignId]/attribution/page")
    ).default;
    await expect(
      Page({
        params: Promise.resolve({ id: P, campaignId: C }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toBe(NOT_FOUND);
  });
  it("rejects malformed hypothesis IDs before database access", async () => {
    const Page = (
      await import("@/app/projects/[id]/campaigns/[campaignId]/attribution/[hypothesisId]/page")
    ).default;
    await expect(
      Page({
        params: Promise.resolve({ id: P, campaignId: C, hypothesisId: "bad" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toBe(NOT_FOUND);
    expect(requireUser).not.toHaveBeenCalled();
  });
  it("maps foreign and wrong-Campaign hypotheses to controlled not-found", async () => {
    requireUser.mockResolvedValue({
      user: { id: "owner" },
      supabase: emptyDb(),
    });
    const Page = (
      await import("@/app/projects/[id]/campaigns/[campaignId]/attribution/[hypothesisId]/page")
    ).default;
    await expect(
      Page({
        params: Promise.resolve({ id: P, campaignId: C, hypothesisId: H }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toBe(NOT_FOUND);
  });
});
