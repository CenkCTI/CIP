import { describe, expect, it } from "vitest";

import {
  createInvestigationSchema,
  parseProjectForm,
  projectSchema,
} from "@/lib/projects/schema";

const valid = {
  name: "Energy Phishing Infrastructure",
  research_question: "Are these indicators part of the same phishing operation?",
  purpose: "Determine whether the activity should change operational monitoring priorities.",
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

  it("requires a meaningful primary intelligence question for new Investigations", () => {
    expect(
      createInvestigationSchema.safeParse({ ...valid, research_question: "short" })
        .success,
    ).toBe(false);
  });

  it("requires purpose for new Investigations", () => {
    expect(
      createInvestigationSchema.safeParse({ ...valid, purpose: "" }).success,
    ).toBe(false);
  });

  it("keeps legacy rows compatible when direction fields are empty", () => {
    const result = projectSchema.safeParse({
      ...valid,
      research_question: "",
      purpose: "",
      current_assessment: "",
      assessment_confidence: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.research_question).toBeNull();
      expect(result.data.purpose).toBeNull();
      expect(result.data.assessment_confidence).toBeNull();
      expect(result.data.scope_geography).toEqual([]);
      expect(result.data.scope_sectors).toEqual([]);
      expect(result.data.due_at).toBeNull();
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

  it("normalizes line-based scope lists and removes case-insensitive duplicates", () => {
    const result = projectSchema.parse({
      ...valid,
      scope_geography: "Poland\npoland\nBelarus\n",
      scope_sectors: "Energy\nCritical Infrastructure",
    });
    expect(result.scope_geography).toEqual(["Poland", "Belarus"]);
    expect(result.scope_sectors).toEqual(["Energy", "Critical Infrastructure"]);
  });

  it("rejects an inverted scope date range", () => {
    expect(
      projectSchema.safeParse({
        ...valid,
        scope_time_start: "2026-02-01",
        scope_time_end: "2026-01-01",
      }).success,
    ).toBe(false);
  });

  it("normalizes valid due and closed dates and permits clearing them", () => {
    expect(
      projectSchema.parse({ ...valid, due_at: "2026-09-15T10:30" }).due_at,
    ).toMatch(/^2026-09-15T/);
    expect(projectSchema.parse({ ...valid, due_at: "" }).due_at).toBeNull();
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
    createForm.set("purpose", "");
    createForm.set("research_type", "CTI");
    createForm.set("priority", "MEDIUM");
    createForm.set("investigation_status", "DRAFT");
    expect(parseProjectForm(createForm).success).toBe(false);

    createForm.set("_form_mode", "edit");
    expect(parseProjectForm(createForm).success).toBe(true);
  });
});
