import { describe, expect, it } from "vitest";

import {
  informationGapUpdateSchema,
  investigationDecisionContextSchema,
  investigationLifecycleSchema,
  investigationRequirementSchema,
  investigationScopeSchema,
  supportingQuestionUpdateSchema,
  workingKnowledgeSupportSchema,
  workingKnowledgeUpdateSchema,
} from "@/lib/investigations/direction-schema";

describe("Investigation Direction schemas", () => {
  it("requires a meaningful requirement while keeping purpose distinct", () => {
    expect(
      investigationRequirementSchema.safeParse({
        name: "Poland pre-attack patterns",
        research_question:
          "Are recurring observable activities present before major cyber operations against strategic targets in Poland?",
        purpose: "Evaluate operational warning value.",
      }).success,
    ).toBe(true);
    expect(
      investigationRequirementSchema.safeParse({
        name: "x",
        research_question: "short",
        purpose: "no",
      }).success,
    ).toBe(false);
  });

  it("keeps decision context optional and bounded", () => {
    expect(
      investigationDecisionContextSchema.parse({
        intended_consumer: "",
        decision_context: "",
        expected_product_type: "",
      }),
    ).toEqual({
      intended_consumer: null,
      decision_context: null,
      expected_product_type: null,
    });
  });

  it("normalizes scope duplicates without turning scope into a gate", () => {
    const result = investigationScopeSchema.parse({
      scope_geography: ["Poland", "poland", "Belarus"],
      scope_sectors: ["Energy"],
      scope_activity_types: [],
      scope_actors: [],
      scope_technologies: [],
      scope_time_start: null,
      scope_time_end: null,
      out_of_scope: "",
    });
    expect(result.scope_geography).toEqual(["Poland", "Belarus"]);
    expect(result.out_of_scope).toBeNull();
  });

  it("rejects inverted scope dates", () => {
    expect(
      investigationScopeSchema.safeParse({
        scope_geography: [],
        scope_sectors: [],
        scope_activity_types: [],
        scope_actors: [],
        scope_technologies: [],
        scope_time_start: "2026-09-10",
        scope_time_end: "2026-09-01",
        out_of_scope: null,
      }).success,
    ).toBe(false);
  });

  it("keeps question, gap, and working-knowledge lifecycles distinct", () => {
    expect(
      supportingQuestionUpdateSchema.safeParse({
        id: "10000000-0000-4000-8000-000000000001",
        question: "When did precursor activity begin?",
        status: "PARTIALLY_ANSWERED",
      }).success,
    ).toBe(true);
    expect(
      informationGapUpdateSchema.safeParse({
        id: "10000000-0000-4000-8000-000000000001",
        description: "Initial access date is unknown.",
        status: "PARTIALLY_RESOLVED",
      }).success,
    ).toBe(true);
    expect(
      workingKnowledgeUpdateSchema.safeParse({
        id: "10000000-0000-4000-8000-000000000001",
        statement: "CERT Polska published technical reporting.",
        state: "SUPERSEDED",
      }).success,
    ).toBe(true);
  });

  it("requires exactly one provenance target for working knowledge", () => {
    const base = {
      knowledge_id: "10000000-0000-4000-8000-000000000001",
      analyst_note: "Supports the working context only.",
    };
    expect(
      workingKnowledgeSupportSchema.safeParse({
        ...base,
        source_id: "20000000-0000-4000-8000-000000000001",
        evidence_id: null,
      }).success,
    ).toBe(true);
    expect(
      workingKnowledgeSupportSchema.safeParse({
        ...base,
        source_id: "20000000-0000-4000-8000-000000000001",
        evidence_id: "30000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(false);
    expect(
      workingKnowledgeSupportSchema.safeParse({
        ...base,
        source_id: null,
        evidence_id: null,
      }).success,
    ).toBe(false);
  });

  it("accepts lifecycle metadata without coupling it to workflow stages", () => {
    expect(
      investigationLifecycleSchema.safeParse({
        investigation_status: "ANALYSIS",
        priority: "HIGH",
        due_at: "2026-09-20T12:00:00+02:00",
      }).success,
    ).toBe(true);
  });
});
