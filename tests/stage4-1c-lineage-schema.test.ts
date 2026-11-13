import { describe, expect, it } from "vitest";
import {
  assertionLineageRelations, contextForPair, saveAssertionLineageSchema,
} from "@/lib/analysis/lineage/schema";

const fromAssertionId = "dd5d557f-6f09-4ac2-b7e7-08abbd0b0001";
const toAssertionId = "dd5d557f-6f09-4ac2-b7e7-08abbd0b0002";
const when = "2026-11-13T15:00:00+00:00";
const candidate = (id: string) => ({
  id, sourceId: id, sourceTitle: "Example", stance: "ASSERTS",
  assertionUpdatedAt: when, annotationUpdatedAt: when, sourceUpdatedAt: when, archived: false,
});
const valid = {
  fromAssertionId, toAssertionId, relation: "UNKNOWN", rationale: "Two reports may share provenance.",
  expectedCurrentReviewId: null,
  requestId: "ce1f11c5-ea5d-4d7a-97d4-91cc8c940201",
  expectedContext: contextForPair(candidate(fromAssertionId), candidate(toAssertionId), when),
};

describe("M1C lineage payload and method rules", () => {
  it("keeps provenance from both assertions and the canonical claim", () => {
    expect(Object.keys(valid.expectedContext)).toHaveLength(7);
    expect(saveAssertionLineageSchema.safeParse({ ...valid, relation: "UNCLEAR" }).success).toBe(true);
  });
  it("defines the five manual relations without confusing them with Canvas edges", () => {
    expect(assertionLineageRelations).toEqual([
      "CITES", "DERIVED_FROM", "SHARES_PRIMARY_SOURCE", "INDEPENDENT_OBSERVATION", "UNCLEAR",
    ]);
  });
  it("rejects self-link, unknown relation, short independence and forged server-only fields", () => {
    expect(saveAssertionLineageSchema.safeParse({ ...valid, relation: "CITES", toAssertionId: fromAssertionId }).success).toBe(false);
    expect(saveAssertionLineageSchema.safeParse(valid).success).toBe(false);
    expect(saveAssertionLineageSchema.safeParse({ ...valid, relation: "SUPPORTS" }).success).toBe(false);
    expect(saveAssertionLineageSchema.safeParse({ ...valid, relation: "INDEPENDENT_OBSERVATION" }).success).toBe(false);
    expect(saveAssertionLineageSchema.safeParse({ ...valid, relation: "UNCLEAR", reviewedBy: "admin" }).success).toBe(false);
    expect(saveAssertionLineageSchema.safeParse({ ...valid, relation: "UNCLEAR", expectedContext: {} }).success).toBe(false);
  });
  it("allows substantial independent rationale without auto-awarding 1", () => {
    expect(saveAssertionLineageSchema.safeParse({ ...valid,
      relation: "INDEPENDENT_OBSERVATION",
      rationale: "Two primary observations were collected from separate sensor feeds; both investigation chains were checked.",
    }).success).toBe(true);
  });
});
