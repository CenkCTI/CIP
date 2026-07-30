import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/app/projects/[id]/attribution-actions", () => ({
  addEvidence: vi.fn(),
  saveAssessment: vi.fn(),
  saveEvaluation: vi.fn(),
  saveHypothesis: vi.fn(),
  setHypothesisArchived: vi.fn(),
  setEvidenceArchived: vi.fn(),
  unlinkEvaluation: vi.fn(),
}));
import {
  AssessmentForm,
  EvidenceForm,
  EvaluationForm,
} from "@/components/attribution/forms";
import {
  evidencePresentation,
  hypothesisSubjectName,
} from "@/lib/attribution/presentation";
const PROJECT = "11111111-1111-4111-8111-111111111111";
describe("Phase 2.1E hardened UI", () => {
  it("only presents records matching the selected evidence type", () => {
    render(
      <EvidenceForm
        projectId={PROJECT}
        campaignId={PROJECT}
        options={{
          source: [{ id: "source", label: "Source Alpha" }],
          indicator: [{ id: "indicator", label: "203.0.113.1 (IP)" }],
        }}
      />,
    );
    expect(
      screen.getByRole("option", { name: "Source Alpha" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /203/ }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Evidence type"), {
      target: { value: "indicator" },
    });
    expect(screen.getByRole("option", { name: /203/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Source Alpha" }),
    ).not.toBeInTheDocument();
  });
  it("clears and hides preferred selection for non-preferred conclusions", () => {
    render(
      <AssessmentForm
        projectId={PROJECT}
        campaignId={PROJECT}
        row={{
          conclusion_type: "PREFERRED_HYPOTHESIS",
          preferred_hypothesis_id: "h",
        }}
        hypotheses={[
          { id: "h", title: "Hypothesis", subject_name: "Actor One" },
        ]}
      />,
    );
    expect(screen.getByLabelText("Preferred hypothesis")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Actor One/ }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Conclusion"), {
      target: { value: "MULTIPLE_PLAUSIBLE" },
    });
    expect(
      screen.queryByLabelText("Preferred hypothesis"),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('input[name="preferred_hypothesis_id"]'),
    ).toHaveValue("");
  });
  it("hides archived evidence from an active evaluation selector", () => {
    render(
      <EvaluationForm
        projectId={PROJECT}
        campaignId={PROJECT}
        hypotheses={[{ id: "h", title: "H" }]}
        evidence={[{ id: "active", title: "Active" }]}
      />,
    );
    expect(screen.getByRole("option", { name: "Active" })).toBeInTheDocument();
    expect(screen.queryByText("Archived")).not.toBeInTheDocument();
  });
  it("derives authoritative labels and internal links", () => {
    const item = { source_id: "s" };
    expect(
      evidencePresentation(item, PROJECT, {
        sources: [{ id: "s", title: "Internal Source" }],
      }),
    ).toEqual({
      type: "Source",
      label: "Internal Source",
      href: `/projects/${PROJECT}/sources/s`,
    });
    expect(
      hypothesisSubjectName({
        subject_kind: "EXISTING_THREAT_ACTOR",
        subject_label: "stale",
        threat_actors: { name: "Actor One" },
      }),
    ).toBe("Actor One");
  });
  it("renders no numerical score or automated winner", () => {
    render(
      <EvaluationForm
        projectId={PROJECT}
        campaignId={PROJECT}
        hypotheses={[{ id: "h", title: "H" }]}
        evidence={[{ id: "e", title: "E" }]}
      />,
    );
    expect(screen.queryByText(/score|winner/i)).not.toBeInTheDocument();
  });
});
