import { z } from "zod";

/** Reporting dependencies are NOT Canvas edges or verified facts. */
export const assertionLineageRelations = [
  "CITES", "DERIVED_FROM", "SHARES_PRIMARY_SOURCE", "INDEPENDENT_OBSERVATION", "UNCLEAR",
] as const;
export const assertionLineageRelationSchema = z.enum(assertionLineageRelations);
export type AssertionLineageRelation = z.infer<typeof assertionLineageRelationSchema>;
export const assertionLineageLabels: Record<AssertionLineageRelation, string> = {
  CITES: "Cites another report · alıntılıyor",
  DERIVED_FROM: "Derived from another report · türetilmiş",
  SHARES_PRIMARY_SOURCE: "Shares primary source · aynı kök kaynak",
  INDEPENDENT_OBSERVATION: "Independent primary observation · bağımsız gözlem (analist beyanı)",
  UNCLEAR: "Unknown / cannot establish · belirsiz",
};
export const lineageIdSchema = z.string().uuid();
export const lineageTimestamp = z.string().datetime({ offset: true });
export const lineageProvenanceSchema = z.object({
  fromAssertionUpdatedAt: lineageTimestamp,
  toAssertionUpdatedAt: lineageTimestamp,
  claimUpdatedAt: lineageTimestamp,
  fromAnnotationUpdatedAt: lineageTimestamp,
  toAnnotationUpdatedAt: lineageTimestamp,
  fromSourceUpdatedAt: lineageTimestamp,
  toSourceUpdatedAt: lineageTimestamp,
}).strict();
export const saveAssertionLineageSchema = z.object({
  fromAssertionId: lineageIdSchema,
  toAssertionId: lineageIdSchema,
  relation: assertionLineageRelationSchema,
  rationale: z.string().trim().min(20).max(4000),
  expectedCurrentReviewId: lineageIdSchema.nullable(),
  expectedContext: lineageProvenanceSchema,
  requestId: lineageIdSchema,
}).strict().superRefine((value, ctx) => {
  if (value.fromAssertionId === value.toAssertionId) ctx.addIssue({
    code: "custom", path: ["toAssertionId"], message: "Cannot link an assertion to itself",
  });
  if (value.relation === "INDEPENDENT_OBSERVATION" && value.rationale.length < 60) ctx.addIssue({
    code: "custom", path: ["rationale"], message: "Independent reporting needs at least 60 characters of evidence reasoning",
  });
});
export const lineageReceiptSchema = z.object({
  review_id: lineageIdSchema, replayed: z.boolean(), reviewed_at: lineageTimestamp,
}).strict();
export type AssertionLineageReview = {
  id: string;
  from_assertion_id: string;
  to_assertion_id: string;
  from_source_id: string;
  to_source_id: string;
  relation: AssertionLineageRelation;
  rationale: string;
  revision: number;
  reviewed_at: string;
  reviewed_by: string;
  supersedes_id: string | null;
  identity_snapshot: {
    claimSummary?: string; fromSourceTitle?: string; toSourceTitle?: string;
    fromStance?: string; toStance?: string;
  };
};
export type AssertionLineageCandidate = {
  id: string;
  sourceId: string;
  sourceTitle: string;
  stance: string;
  assertionUpdatedAt: string;
  annotationUpdatedAt: string;
  sourceUpdatedAt: string;
  archived: boolean;
};
export type AssertionLineageResponse = {
  assertionId: string;
  claimUpdatedAt: string | null;
  candidates: AssertionLineageCandidate[];
  links: AssertionLineageReview[];
  unavailable: boolean;
  truncated: boolean;
};

export function contextForPair(
  from: AssertionLineageCandidate, to: AssertionLineageCandidate,
  claimUpdatedAt: string,
) {
  return {
    fromAssertionUpdatedAt: from.assertionUpdatedAt,
    toAssertionUpdatedAt: to.assertionUpdatedAt,
    claimUpdatedAt,
    fromAnnotationUpdatedAt: from.annotationUpdatedAt,
    toAnnotationUpdatedAt: to.annotationUpdatedAt,
    fromSourceUpdatedAt: from.sourceUpdatedAt,
    toSourceUpdatedAt: to.sourceUpdatedAt,
  };
}
