import { z } from "zod";

/** Source reliability is not source information credibility or analytic confidence. */
export const sourceReliabilityGrades = ["A", "B", "C", "D", "E", "F"] as const;
export const sourceReliabilityGradeSchema = z.enum(sourceReliabilityGrades);
export type SourceReliabilityGrade = z.infer<typeof sourceReliabilityGradeSchema>;
export const sourceReliabilityMethodVersion = "ADMIRALTY_SOURCE_V1" as const;

export const sourceReliabilityDescriptions: Record<SourceReliabilityGrade, string> = {
  A: "Reliable — güvenilir kaynak",
  B: "Usually reliable — genellikle güvenilir",
  C: "Fairly reliable — kısmen güvenilir",
  D: "Not usually reliable — genellikle güvenilir değil",
  E: "Unreliable — güvenilmez kaynak",
  F: "Cannot be judged — güvenilirlik değerlendirilemiyor",
};

export const sourceReliabilityReviewRequestSchema = z.object({
  rating: sourceReliabilityGradeSchema,
  rationale: z.string().trim().min(10).max(4000),
  methodVersion: z.literal(sourceReliabilityMethodVersion),
  expectedCurrentReviewId: z.string().uuid().nullable(),
  requestId: z.string().uuid(),
}).strict();
export type SourceReliabilityReviewRequest = z.infer<typeof sourceReliabilityReviewRequestSchema>;

export const qualitySourceIdSchema = z.string().uuid();
export const qualityHistoryPageSchema = z.coerce.number<number>().int().min(1).max(50);
export const QUALITY_HISTORY_PAGE_SIZE = 20;
export const sourceReliabilityRpcResultSchema = z.object({
  review_id: z.string().uuid(),
  replayed: z.boolean(),
  reviewed_at: z.string().datetime({ offset: true }),
}).strict();


export type SourceReliabilityReview = {
  id: string;
  revision: number;
  rating: SourceReliabilityGrade;
  rationale: string;
  method_version: typeof sourceReliabilityMethodVersion;
  assessed_by: string;
  assessed_at: string;
  supersedes_id: string | null;
  source_updated_at: string;
  source_context_fingerprint: string;
  source_identity_snapshot: { title?: string; publisher?: string | null; sourceType?: string };
};

export type SourceQualityResponse = {
  sourceId: string;
  sourceStatus: "ACTIVE" | "ARCHIVED" | "UNAVAILABLE";
  sourceTitle: string;
  sourceUpdatedAt: string | null;
  current: SourceReliabilityReview | null;
  currentIsStale: boolean;
  history: SourceReliabilityReview[];
  page: number;
  hasMore: boolean;
};
