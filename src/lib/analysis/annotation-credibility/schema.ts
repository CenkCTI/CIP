import { z } from "zod";
import { informationCredibilityGradeSchema, type InformationCredibilityGrade } from "@/lib/analysis/credibility/schema";

export const annotationMethod = "ADMIRALTY_ANNOTATION_V1";
export const annotationGradeOneReason = "Grade 1 requires independent reporting that covers the entire evaluated passage. Passage-level corroboration is unavailable in this preview.";
export const annotationReviewSchema = z.strictObject({
  credibility: informationCredibilityGradeSchema.refine((grade) => grade !== 1, annotationGradeOneReason),
  rationale: z.string().trim().min(10).max(4000),
  methodVersion: z.literal(annotationMethod),
  expectedReviewId: z.uuid().nullable(),
  provenance: z.string().regex(/^[a-f0-9]{64}$/),
  requestId: z.uuid(),
});

export type AnnotationQuality = {
  annotation_id: string;
  source_id: string;
  subject_status: "ACTIVE" | "ARCHIVED" | "UNAVAILABLE" | "NO_INFORMATION";
  review_id: string | null;
  credibility: InformationCredibilityGrade | null;
  stale: boolean;
  reviewed_at: string | null;
  source_reliability: string | null;
  source_reliability_stale: boolean | null;
};

export type AnnotationReview = {
  id: string;
  credibility: InformationCredibilityGrade;
  rationale: string;
  revision: number;
  reviewed_at: string;
  method_version: string;
  reviewed_by: string;
  supersedes_id: string | null;
};

export type AnnotationReviewDetail = {
  subject: (AnnotationQuality & { provenance: string; source_title: string }) | null;
  current: AnnotationReview | null;
  history: AnnotationReview[];
  page: number;
  hasMore: boolean;
};
