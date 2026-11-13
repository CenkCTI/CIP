import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertionCredibilityReviewRequestSchema, informationCredibilityGrades,
  informationCredibilityDescriptions,
} from "@/lib/analysis/credibility/schema";

const valid = {
  credibility: 3, rationale: "The report is plausible but lacks external confirmation.",
  independenceStatus: "UNKNOWN", independenceRationale: "", verificationAssertionId: null,
  methodVersion: "ADMIRALTY_INFORMATION_V1", expectedCurrentReviewId: null,
  requestId: "ce1f11c5-ea5d-4d7a-97d4-91cc8c940123",
  expectedProvenance: {
    assertionUpdatedAt: "2026-11-13T13:00:00+00:00",
    claimUpdatedAt: "2026-11-13T13:00:00+00:00",
    annotationUpdatedAt: "2026-11-13T13:00:00+00:00",
    sourceUpdatedAt: "2026-11-13T13:00:00+00:00",
  },
};

describe("Stage 4.1 M1B information credibility contract", () => {
  it("strictly separates information 1–6 from Source A–F and analyst confidence", () => {
    expect(informationCredibilityGrades).toEqual([1, 2, 3, 4, 5, 6]);
    expect(informationCredibilityDescriptions[6]).toContain("Cannot be judged");
    expect(assertionCredibilityReviewRequestSchema.safeParse(valid).success).toBe(true);
    expect(assertionCredibilityReviewRequestSchema.safeParse({ ...valid, credibility: "B" }).success).toBe(false);
    expect(assertionCredibilityReviewRequestSchema.safeParse({ ...valid, credibility: 7 }).success).toBe(false);
    expect(assertionCredibilityReviewRequestSchema.safeParse({ ...valid, confidence: "HIGH" }).success).toBe(false);
    expect(assertionCredibilityReviewRequestSchema.safeParse({ ...valid, assessed_by: "admin" }).success).toBe(false);
  });
  it("demands a same-claim different-source witness and human attestation for level one", () => {
    expect(assertionCredibilityReviewRequestSchema.safeParse({ ...valid, credibility: 1 }).success).toBe(false);
    expect(assertionCredibilityReviewRequestSchema.safeParse({ ...valid,
      credibility: 1, independenceStatus: "ANALYST_VERIFIED_INDEPENDENT",
    }).success).toBe(false);
    expect(assertionCredibilityReviewRequestSchema.safeParse({ ...valid,
      credibility: 1, independenceStatus: "ANALYST_VERIFIED_INDEPENDENT",
      verificationAssertionId: "dd5d557f-6f09-4ac2-b7e7-08abbd0b0002",
      independenceRationale: "Independent primary observations, not copied from the same original report.",
      rationale: "Independent first-hand telemetry confirms the claim beyond the original reporting with consistent dates.",
    }).success).toBe(true);
  });
  it("retains append-only provenance without cascading on source assertion deletion", () => {
    const sql = readFileSync("supabase/migrations/202611130082_stage4_1b_assertion_credibility_reviews.sql", "utf8");
    expect(sql).toContain("create table public.assertion_credibility_reviews");
    expect(sql).toContain("security definer set search_path = ''");
    expect(sql).toContain("on delete cascade"); // only the Investigation FK
    expect(sql).not.toMatch(/references public\.source_claim_assertions/);
    expect(sql).toContain("source_claim_assertion_id uuid not null");
    expect(sql).toContain("source_claim_id=v_assertion.source_claim_id");
    expect(sql).toContain("v_verifier_annotation.source_id=v_annotation.source_id");
    expect(sql).toContain("for update;");
    expect(sql).toContain("REVIEW_HISTORY_IMMUTABLE");
    expect(sql).toContain("grant select on table public.assertion_credibility_reviews to authenticated");
    expect(sql).toContain("grant execute on function public.save_assertion_credibility_review_v1");
    expect(sql).not.toContain("drop table");
  });
  it("links the bounded inspector from the canonical Source Claim details, not Canvas authoritatively", () => {
    const workspace = readFileSync("src/components/processing/source-claims-workspace.tsx", "utf8");
    const panel = readFileSync("src/components/analysis/assertion-credibility-panel.tsx", "utf8");
    expect(workspace).toContain("<AssertionCredibilityPanel");
    expect(workspace).toContain("candidate.sourceId !== sourceId");
    expect(panel).toContain("Source {quality.sourceReliability");
    expect(panel).toContain("Information {quality.current?.credibility");
    expect(panel).toContain("Not evaluated yet.");
    expect(panel).toContain("6 means cannot judge");
  });
});
