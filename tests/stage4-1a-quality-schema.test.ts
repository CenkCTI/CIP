import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  sourceReliabilityGrades,
  sourceReliabilityReviewRequestSchema,
  sourceReliabilityDescriptions,
  qualityHistoryPageSchema,
} from "@/lib/analysis/quality/schema";

const input = {
  rating: "B", rationale: "Source's historical reporting can be independently checked.",
  methodVersion: "ADMIRALTY_SOURCE_V1", expectedCurrentReviewId: null,
  requestId: "ff53d474-2682-4c09-a160-61ad41e405f0",
};

describe("Stage 4.1 M1A quality contracts", () => {
  it("separates A–F from legacy HIGH/LOW and from analytic confidence", () => {
    expect(sourceReliabilityGrades).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(sourceReliabilityReviewRequestSchema.safeParse(input).success).toBe(true);
    expect(sourceReliabilityReviewRequestSchema.safeParse({ ...input, rating: "HIGH" }).success).toBe(false);
    expect(sourceReliabilityReviewRequestSchema.safeParse({ ...input, rating: "3" }).success).toBe(false);
    expect(sourceReliabilityDescriptions.F).toContain("değerlendirilemiyor");
  });
  it("requires a bounded rationale, exact method and server-only authority fields", () => {
    expect(sourceReliabilityReviewRequestSchema.safeParse({ ...input, rationale: "short" }).success).toBe(false);
    expect(sourceReliabilityReviewRequestSchema.safeParse({ ...input, rationale: "x".repeat(4001) }).success).toBe(false);
    expect(sourceReliabilityReviewRequestSchema.safeParse({ ...input, methodVersion: "UNSAFE_V2" }).success).toBe(false);
    expect(sourceReliabilityReviewRequestSchema.safeParse({ ...input, assessedBy: "admin" }).success).toBe(false);
    expect(sourceReliabilityReviewRequestSchema.safeParse({ ...input, expectedCurrentReviewId: "x" }).success).toBe(false);
    expect(qualityHistoryPageSchema.safeParse("51").success).toBe(false);
  });
  it("uses append-only history with project owner RLS and a locked atomic RPC", () => {
    const migration = readFileSync("supabase/migrations/202611130081_stage4_1a_source_reliability_reviews.sql", "utf8");
    expect(migration).toContain("create table public.source_reliability_reviews");
    expect(migration).toContain("for update");
    expect(migration).toContain("REVIEW_HISTORY_IMMUTABLE");
    expect(migration).toContain("source_context_fingerprint");
    expect(migration).toContain("source_reliability_reviews_select_owned");
    expect(migration).toContain("source_id uuid not null,");
    expect(migration).not.toContain("references public.sources(id) on delete cascade");
    expect(migration).not.toContain("alter table public.sources");
  });
});
