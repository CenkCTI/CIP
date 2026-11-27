import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AnnotationCredibilityPanel, AnnotationCredibilitySummary } from "@/components/analysis/annotation-credibility-panel";
import type { AnnotationReview, AnnotationReviewDetail } from "@/lib/analysis/annotation-credibility/schema";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const annotationId = "a0000000-0000-4000-8000-000000000001";
const subject = {
  annotation_id: annotationId, source_id: "source", source_title: "Original source", subject_status: "ACTIVE",
  review_id: null, credibility: null, stale: false, reviewed_at: null, source_reliability: "B",
  source_reliability_stale: false, provenance: "a".repeat(64),
} as const;

afterEach(() => { vi.unstubAllGlobals(); refresh.mockClear(); });

it("loads on inspector open, requires an explicit grade, saves and reopens the canonical history", async () => {
  const user = userEvent.setup();
  const history: AnnotationReview[] = [];
  const io = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      expect(url).toContain(`/annotations/${annotationId}/reviews`);
      const request = JSON.parse(String(init.body));
      expect(request.expectedReviewId).toBe(history[0]?.id ?? null);
      expect(request.provenance).toBe(subject.provenance);
      history.unshift({ id: crypto.randomUUID(), credibility: request.credibility, rationale: request.rationale,
        revision: history.length + 1, reviewed_at: "2026-11-27T12:00:00Z", method_version: request.methodVersion,
        reviewed_by: "analyst", supersedes_id: history[0]?.id ?? null });
      return Response.json({ review_id: history[0].id }, { status: 201 });
    }
    const current = history[0] ?? null;
    return Response.json({ subject: { ...subject, credibility: current?.credibility ?? null, review_id: current?.id ?? null },
      current, history, page: 1, hasMore: false } satisfies AnnotationReviewDetail);
  });
  vi.stubGlobal("fetch", io);
  const view = render(<AnnotationCredibilityPanel projectId="project" annotationId={annotationId} />);
  await screen.findByText("Information credibility · Not evaluated");
  expect(screen.getByLabelText("Credibility grade")).toHaveValue("");
  expect(screen.getByRole("option", { name: /^1 ·/ })).toBeDisabled();

  await user.selectOptions(screen.getByLabelText("Credibility grade"), "2");
  await user.type(screen.getByLabelText("Assessment rationale"), "The passage was checked against the original material.");
  await user.click(screen.getByRole("button", { name: "Save assessment" }));
  await screen.findByText(/Information credibility · 2/);
  expect(refresh).toHaveBeenCalledOnce();
  view.unmount();

  render(<AnnotationCredibilityPanel projectId="project" annotationId={annotationId} />);
  await screen.findByText(/Information credibility · 2/);
  await user.selectOptions(screen.getByLabelText("Credibility grade"), "6");
  await user.type(screen.getByLabelText("Assessment rationale"), "The available information cannot support a judgment.");
  await user.click(screen.getByRole("button", { name: "Save assessment" }));
  await screen.findByText(/Information credibility · 6/);
  expect(screen.getByText(/Source reliability A–F · B/)).toBeVisible();
  expect(screen.getByText(/Revision 1 · Grade 2/)).toBeVisible();
  expect(screen.getByText(/Revision 2 · Grade 6/)).toBeVisible();
});

it("distinguishes unavailability from an unevaluated or stale historical grade", async () => {
  const view = render(<AnnotationCredibilitySummary />);
  expect(screen.getByText(/credibility unavailable/)).toBeVisible();
  view.rerender(<AnnotationCredibilitySummary assessment={subject} />);
  expect(screen.getByText(/Not evaluated/)).toBeVisible();
  view.rerender(<AnnotationCredibilitySummary assessment={{ ...subject, credibility: 6, stale: true }} />);
  expect(screen.getByText(/credibility · 6/)).toBeVisible();
  expect(screen.getByText("Re-evaluation required")).toBeVisible();
});

it("reports a failed save and leaves the original assessment visible", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST"
    ? Response.json({ error: "The passage changed. Reload the review." }, { status: 409 })
    : Response.json({ subject, current: null, history: [], page: 1, hasMore: false } satisfies AnnotationReviewDetail)));
  render(<AnnotationCredibilityPanel projectId="project" annotationId={annotationId} />);
  await screen.findByText("Information credibility · Not evaluated");
  await user.selectOptions(screen.getByLabelText("Credibility grade"), "4");
  await user.type(screen.getByLabelText("Assessment rationale"), "The passage differs from the original evidence.");
  await user.click(screen.getByRole("button", { name: "Save assessment" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The passage changed.");
  expect(screen.getByText("Information credibility · Not evaluated")).toBeVisible();
  expect(refresh).not.toHaveBeenCalled();
});
