import { describe, expect, it } from "vitest";
import { saveHypothesisSchema, saveHypothesisEvidenceSchema } from "@/lib/analysis/hypotheses/schema";
const uid = "d4098027-b01f-454a-9d0c-39c17a9ef2cf";
const stamp = "2026-11-13T19:00:00+00:00";
const base = {
  hypothesisId: null,
  title: "H1 shared infrastructure",
  proposition: "The apparent shared infrastructure may indicate some operational coordination.",
  disconfirmationTest: "Independent provider records should establish the infrastructure is unrelated.",
  status: "OPEN", rationale: "Working hypothesis, pending independent evidence.",
  expectedCurrentVersionId: null, requestId: uid,
};
const evidence = {
  assertionId: uid, role: "CONTRADICTS", rationale: "This primary report directly challenges the assumed actor connection.",
  expectedCurrentReviewId: null,
  expectedContext: { assertionUpdatedAt: stamp, claimUpdatedAt: stamp,
    annotationUpdatedAt: stamp, sourceUpdatedAt: stamp }, requestId: uid,
};
describe("M2A hypotheses are not source claims or confidence scores", () => {
  it("accepts a falsifiable working hypothesis", () => {
    expect(saveHypothesisSchema.parse(base).status).toBe("OPEN");
  });
  it("rejects missing falsification tests, unsupported scores and forged authority", () => {
    expect(saveHypothesisSchema.safeParse({ ...base, disconfirmationTest: "unknown" }).success).toBe(false);
    expect(saveHypothesisSchema.safeParse({ ...base, confidence: "HIGH" }).success).toBe(false);
    expect(saveHypothesisSchema.safeParse({ ...base, authoredBy: "admin" }).success).toBe(false);
    expect(saveHypothesisSchema.safeParse({ ...base, expectedCurrentVersionId: uid }).success).toBe(false);
  });
  it("supports contradiction and rejects unsafe evidence writes", () => {
    expect(saveHypothesisEvidenceSchema.parse(evidence).role).toBe("CONTRADICTS");
    expect(saveHypothesisEvidenceSchema.safeParse({ ...evidence, role: "CONFIRMED" }).success).toBe(false);
    expect(saveHypothesisEvidenceSchema.safeParse({ ...evidence, projectId: uid }).success).toBe(false);
    expect(saveHypothesisEvidenceSchema.safeParse({ ...evidence, rationale: "too short" }).success).toBe(false);
    expect(saveHypothesisEvidenceSchema.safeParse({ ...evidence, expectedContext: {} }).success).toBe(false);
  });
});
