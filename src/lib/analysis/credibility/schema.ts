import { z } from "zod";

/** Assessment of source-reported information, NOT source reliability or analyst confidence. */
export const informationCredibilityGrades = [1, 2, 3, 4, 5, 6] as const;
export const informationCredibilityGradeSchema = z.union([
  z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6),
]);
export type InformationCredibilityGrade = z.infer<typeof informationCredibilityGradeSchema>;
export const informationCredibilityDescriptions: Record<InformationCredibilityGrade, string> = {
  1: "Confirmed by independent reporting — bağımsız doğrulama",
  2: "Probably true — muhtemelen doğru",
  3: "Possibly true — mümkün",
  4: "Doubtful — şüpheli",
  5: "Improbable — düşük olasılıklı / çelişkili",
  6: "Cannot be judged — değerlendirilemiyor",
};

export const informationIndependenceStatuses = [
  "UNKNOWN", "PRIMARY_OBSERVATION", "SECONDARY_REPORT", "ANALYST_VERIFIED_INDEPENDENT",
] as const;
export const informationIndependenceSchema = z.enum(informationIndependenceStatuses);
export type InformationIndependence = z.infer<typeof informationIndependenceSchema>;
export const informationIndependenceLabels: Record<InformationIndependence, string> = {
  UNKNOWN: "Unknown — bağımsızlık bilinmiyor",
  PRIMARY_OBSERVATION: "Primary observation — ilk elden gözlem iddiası",
  SECONDARY_REPORT: "Secondary reporting — başka kaynaktan aktarım",
  ANALYST_VERIFIED_INDEPENDENT: "Analyst-verified independent reporting — analist teyitli",
};

export const informationCredibilityMethodVersion = "ADMIRALTY_INFORMATION_V1" as const;
export const credibilityAssertionIdSchema = z.string().uuid();
export const credibilityHistoryPageSchema = z.coerce.number<number>().int().min(1).max(50);
export const CREDIBILITY_HISTORY_PAGE_SIZE = 20;

export const assertionCredibilityReviewRequestSchema = z.object({
  credibility: informationCredibilityGradeSchema,
  rationale: z.string().trim().min(10).max(4000),
  independenceStatus: informationIndependenceSchema,
  independenceRationale: z.string().trim().max(2000),
  verificationAssertionId: z.string().uuid().nullable(),
  methodVersion: z.literal(informationCredibilityMethodVersion),
  expectedCurrentReviewId: z.string().uuid().nullable(),
  requestId: z.string().uuid(),
  expectedProvenance: z.object({
    assertionUpdatedAt: z.string().datetime({ offset: true }),
    claimUpdatedAt: z.string().datetime({ offset: true }),
    annotationUpdatedAt: z.string().datetime({ offset: true }),
    sourceUpdatedAt: z.string().datetime({ offset: true }),
  }).strict(),
}).strict().superRefine((input, context) => {
  const attested = input.independenceStatus === "ANALYST_VERIFIED_INDEPENDENT";
  if (attested && (!input.verificationAssertionId || input.independenceRationale.length < 40)) {
    context.addIssue({ code: "custom", path: ["independenceRationale"],
      message: "Independent reporting requires another assertion and an explanation (at least 40 characters)." });
  }
  if (!attested && (input.verificationAssertionId !== null || input.independenceRationale !== "")) {
    context.addIssue({ code: "custom", path: ["verificationAssertionId"],
      message: "A corroborating assertion can only be entered for analyst-verified independence." });
  }
  if (input.credibility === 1 && (!attested || input.rationale.length < 60)) {
    context.addIssue({ code: "custom", path: ["credibility"],
      message: "Credibility 1 requires verified independent reporting and a substantial rationale." });
  }
});
export type AssertionCredibilityReviewRequest = z.infer<typeof assertionCredibilityReviewRequestSchema>;

export const assertionCredibilityRpcResultSchema = z.object({
  review_id: z.string().uuid(),
  replayed: z.boolean(),
  reviewed_at: z.string().datetime({ offset: true }),
}).strict();

export type AssertionCredibilityReview = {
  id: string;
  revision: number;
  credibility: InformationCredibilityGrade;
  rationale: string;
  independence_status: InformationIndependence;
  independence_rationale: string;
  verification_assertion_id: string | null;
  verification_source_id: string | null;
  method_version: typeof informationCredibilityMethodVersion;
  assessed_by: string;
  assessed_at: string;
  supersedes_id: string | null;
  assertion_updated_at: string;
  claim_updated_at: string;
  annotation_updated_at: string;
  source_updated_at: string;
  assertion_context_fingerprint: string;
  assertion_identity_snapshot: { sourceId?: string; sourceTitle?: string; claimSummary?: string; stance?: string; claimId?: string; annotationId?: string };
};

export type AssertionCredibilityResponse = {
  provenance: {
    assertionUpdatedAt: string;
    claimUpdatedAt: string;
    annotationUpdatedAt: string;
    sourceUpdatedAt: string;
  } | null;
  assertionId: string;
  assertionStatus: "ACTIVE" | "ARCHIVED" | "UNAVAILABLE";
  assertionStance: string | null;
  sourceTitle: string;
  sourceId: string | null;
  sourceReliability: string | null;
  sourceReliabilityStale: boolean;
  current: AssertionCredibilityReview | null;
  currentIsStale: boolean;
  history: AssertionCredibilityReview[];
  page: number;
  hasMore: boolean;
};
