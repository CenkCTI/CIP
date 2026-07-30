import { describe, expect, it } from "vitest";
import {
  assessmentSchema,
  evaluationSchema,
  evidenceSchema,
  hypothesisSchema,
} from "@/lib/attribution/schema";
const base = {
  title: "Unknown operator",
  subject_kind: "UNKNOWN_ACTOR",
  threat_actor_id: "",
  subject_label: "Unknown operator",
  proposition: "An unidentified operator conducted the activity",
  status: "DRAFT",
  confidence: "MEDIUM",
  analytic_rationale: "",
  key_assumptions: "",
  known_weaknesses: "",
  information_gaps: "",
  status_rationale: "",
};
describe("Phase 2.1E analytical validation", () => {
  it("enforces subject semantics", () => {
    expect(hypothesisSchema.safeParse(base).success).toBe(true);
    expect(
      hypothesisSchema.safeParse({
        ...base,
        subject_kind: "EXISTING_THREAT_ACTOR",
      }).success,
    ).toBe(false);
    expect(
      hypothesisSchema.safeParse({
        ...base,
        subject_kind: "ACTOR_CLASS",
        threat_actor_id: "4bb45d4d-75d5-43f0-896b-76b9bf9b1507",
      }).success,
    ).toBe(false);
  });
  it("requires rationale for analytical state changes", () => {
    expect(
      hypothesisSchema.safeParse({ ...base, status: "ACTIVE" }).success,
    ).toBe(false);
    expect(
      hypothesisSchema.safeParse({
        ...base,
        status: "DISFAVORED",
        status_rationale: "Evidence conflicts",
      }).success,
    ).toBe(true);
  });
  it("validates explicit judgement combinations", () => {
    const a = {
      assessment_status: "DRAFT",
      conclusion_type: "MULTIPLE_PLAUSIBLE",
      confidence: "LOW",
      preferred_hypothesis_id: "",
      current_judgment: "",
      alternative_explanations: "",
      key_uncertainties: "",
      discriminating_information_needed: "",
      assessed_at: "",
    };
    expect(assessmentSchema.safeParse(a).success).toBe(true);
    expect(
      assessmentSchema.safeParse({ ...a, assessment_status: "ASSESSED" })
        .success,
    ).toBe(false);
    expect(
      assessmentSchema.safeParse({
        ...a,
        conclusion_type: "PREFERRED_HYPOTHESIS",
      }).success,
    ).toBe(false);
  });
  it("requires one typed inventory reference and rationale", () => {
    expect(
      evidenceSchema.safeParse({
        title: "Source",
        relevance_note: "Supports timing",
        reference_type: "source",
        reference_id: "4bb45d4d-75d5-43f0-896b-76b9bf9b1507",
      }).success,
    ).toBe(true);
    expect(
      evaluationSchema.safeParse({
        hypothesis_id: "4bb45d4d-75d5-43f0-896b-76b9bf9b1507",
        evidence_item_id: "cf22371c-b69f-4e85-897b-aba0ea011be7",
        impact: "NEUTRAL",
        diagnostic_value: "LOW",
        rationale: "",
      }).success,
    ).toBe(false);
  });
});
