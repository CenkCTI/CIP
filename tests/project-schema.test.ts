import { describe, expect, it } from "vitest";

import {
  createInvestigationSchema,
  parseProjectForm,
  projectSchema,
} from "@/lib/projects/schema";

const valid = {
  name: "Energy Phishing Infrastructure",
  research_question: "Are these indicators part of the same phishing operation?",
  description: "",
  research_type: "CTI" as const,
  priority: "HIGH" as const,
  investigation_status: "ACTIVE" as const,
  current_assessment: "The domains are probably related.",
  assessment_confidence: "MEDIUM" as const,
  tags: ["phishing"],
  closed_at: null,
};

describe("Investigation project schemas", () => {
  it("accepts a valid new Investigation", () => {
    expect(createInvestigationSchema.parse(valid).name).toBe(
      "Energy Phishing Infrastructure",
    );
  });

  it("requires a research question for new Investigations", () => {
    const result = createInvestigationSchema.safeParse({
      ...valid,
      research_question: "",
    });
    expect(result.success).toBe(false);
  });

  it("keeps legacy rows compatible when the research question is empty", () => {
    const result = projectSchema.safeParse({
      ...valid,
      research_question: "",
      current_assessment: "",
      assessment_confidence: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.research_question).toBeNull();
      expect(result.data.assessment_confidence).toBeNull();
    }
  });

  it("accepts every supported status and rejects unknown statuses", () => {
    expect(
      projectSchema.safeParse({ ...valid, investigation_status: "REVIEW" })
        .success,
    ).toBe(true);
    expect(
      projectSchema.safeParse({ ...valid, investigation_status: "PAUSED" })
        .success,
    ).toBe(false);
  });

  it("accepts nullable confidence and rejects an invalid confidence", () => {
    expect(
      projectSchema.safeParse({ ...valid, assessment_confidence: null }).success,
    ).toBe(true);
    expect(
      projectSchema.safeParse({ ...valid, assessment_confidence: "CERTAIN" })
        .success,
    ).toBe(false);
  });

  it("enforces current assessment limits", () => {
    expect(
      projectSchema.safeParse({
        ...valid,
        current_assessment: "x".repeat(10_001),
      }).success,
    ).toBe(false);
  });

  it("normalizes comma-separated tags", () => {
    const result = projectSchema.parse({ ...valid, tags: "x, y" });
    expect(result.tags).toEqual(["x", "y"]);
  });

  it("normalizes a valid closed date and permits clearing it", () => {
    expect(
      projectSchema.parse({ ...valid, closed_at: "2026-07-28" }).closed_at,
    ).toMatch(/^2026-07-28T/);
    expect(projectSchema.parse({ ...valid, closed_at: "" }).closed_at).toBeNull();
  });

  it("uses create and edit modes in form parsing", () => {
    const createForm = new FormData();
    createForm.set("_form_mode", "create");
    createForm.set("name", "New Investigation");
    createForm.set("research_question", "");
    createForm.set("research_type", "CTI");
    createForm.set("priority", "MEDIUM");
    createForm.set("investigation_status", "DRAFT");
    expect(parseProjectForm(createForm).success).toBe(false);

    createForm.set("_form_mode", "edit");
    expect(parseProjectForm(createForm).success).toBe(true);
  });
});
