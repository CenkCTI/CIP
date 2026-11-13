import { z } from "zod";

export const hypothesisStatuses = ["OPEN", "TESTING", "RETIRED"] as const;
export const evidenceRoles = ["SUPPORTS", "CONTRADICTS", "CONTEXT", "WITHDRAWN"] as const;
export const hypothesisStatusSchema = z.enum(hypothesisStatuses);
export const evidenceRoleSchema = z.enum(evidenceRoles);
const id = z.string().uuid();
const date = z.string().datetime({ offset: true });

export const saveHypothesisSchema = z.object({
  hypothesisId: id.nullable(),
  title: z.string().trim().min(8).max(160),
  proposition: z.string().trim().min(20).max(4000),
  disconfirmationTest: z.string().trim().min(20).max(2000),
  status: hypothesisStatusSchema,
  rationale: z.string().trim().min(10).max(3000),
  expectedCurrentVersionId: id.nullable(),
  requestId: id,
}).strict().superRefine((value, ctx) => {
  if (value.hypothesisId === null && value.expectedCurrentVersionId !== null) {
    ctx.addIssue({ code: "custom", path: ["expectedCurrentVersionId"], message: "New hypotheses have no prior version" });
  }
});

export const evidenceProvenanceSchema = z.object({
  assertionUpdatedAt: date,
  claimUpdatedAt: date,
  annotationUpdatedAt: date,
  sourceUpdatedAt: date,
}).strict();

export const saveHypothesisEvidenceSchema = z.object({
  assertionId: id,
  role: evidenceRoleSchema,
  rationale: z.string().trim().min(20).max(4000),
  expectedCurrentReviewId: id.nullable(),
  expectedContext: evidenceProvenanceSchema,
  requestId: id,
}).strict();

export const hypothesisReceiptSchema = z.object({
  hypothesis_id: id,
  version_id: id,
  replayed: z.boolean(),
});
export const evidenceReceiptSchema = z.object({
  review_id: id,
  replayed: z.boolean(),
});

export type HypothesisStatus = z.infer<typeof hypothesisStatusSchema>;
export type EvidenceRole = z.infer<typeof evidenceRoleSchema>;
export type HypothesisVersion = {
  id: string; hypothesis_id: string; revision: number; title: string;
  proposition: string; disconfirmation_test: string; status: HypothesisStatus;
  rationale: string; authored_at: string; supersedes_id: string | null;
};
export type EvidenceReview = {
  id: string; hypothesis_id: string; assertion_id: string;
  revision: number; role: EvidenceRole; rationale: string;
  reviewed_at: string; supersedes_id: string | null;
  source_id_snapshot: string; claim_id_snapshot: string;
  source_label_snapshot: string; claim_summary_snapshot: string;
  stance_snapshot: string;
  assertion_updated_at: string; claim_updated_at: string;
  annotation_updated_at: string; source_updated_at: string;
};
export type EvidenceCandidate = {
  assertionId: string; claimId: string; claimSummary: string;
  sourceTitle: string; stance: string; provenance: z.infer<typeof evidenceProvenanceSchema>;
};
