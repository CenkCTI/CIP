import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202608100041_phase2_3e_matching_priority_relevance.sql", "utf8");
const orchestrator = readFileSync("src/lib/techint/collection/orchestrator.ts", "utf8");
const queries = readFileSync("src/lib/techint/intelligence/queries.ts", "utf8");
const priority = readFileSync("src/lib/techint/priority/engine.ts", "utf8");
const matching = readFileSync("src/lib/techint/matching/engine.ts", "utf8");
const globalView = readFileSync("src/app/techint/page.tsx", "utf8");
const profileFeed = readFileSync("src/components/techint/profile-feed.tsx", "utf8");

describe("Phase 2.3E architecture", () => {
  it("persists separate owner-scoped Global Priority and Profile Match projections", () => {
    expect(migration).toContain("create table public.technical_signal_global_priorities");
    expect(migration).toContain("create table public.technical_signal_profile_matches");
    expect(migration).toContain("create table public.technical_signal_profile_match_events");
    expect(migration).toContain("unique(owner_id,signal_id,profile_id)");
    expect(migration).toContain("technical_signal_global_priorities_select_own");
    expect(migration).toContain("technical_signal_profile_matches_select_own");
    expect(migration).toContain("to service_role");
  });

  it("does not mutate immutable Technical Signal source truth", () => {
    expect(migration).not.toMatch(/update\s+public\.technical_signal_entity_assertions/i);
    expect(migration).not.toMatch(/update\s+public\.technical_signal_observations/i);
    expect(migration).not.toMatch(/update\s+public\.technical_signal_revisions/i);
    expect(orchestrator).not.toMatch(/from\("technical_signal_entity_assertions"\).*\.(insert|update|delete)/s);
  });

  it("keeps unresolved source identities visible and upgrades matches after resolution", () => {
    expect(migration).toContain("DIRECT_SOURCE:");
    expect(migration).toContain("PRODUCT_CONTEXT:");
    expect(migration).toContain("'PROVISIONAL'::public.technical_profile_match_quality");
    expect(migration).toContain("'CONFIRMED'::public.technical_profile_match_quality");
    expect(migration).toContain("technical_profile_recheck_after_resolution");
    expect(migration).toContain("unique(owner_id,signal_id,profile_id)");
  });

  it("evaluates derived intelligence after collection without making it authoritative for collection success", () => {
    expect(orchestrator).toContain("evaluateTechnicalSignalIntelligenceBatchWorkflow");
    expect(orchestrator).toContain("POST_SYNC_INTELLIGENCE_BATCH = 250");
    expect(orchestrator.indexOf("completeTechnicalCollection")).toBeLessThan(orchestrator.lastIndexOf("evaluateFreshTechnicalIntelligence"));
    expect(orchestrator).toContain("intelligenceEvaluation = null");
  });

  it("uses bounded paginated server queries without a hidden 500-row ceiling", () => {
    expect(queries).toContain("MAX_PAGE_SIZE = 50");
    expect(queries).toContain(".range(bounds.from, bounds.to)");
    expect(queries).not.toContain(".limit(500)");
  });

  it("requires no AI to assign Global Priority or Profile Relevance", () => {
    expect(priority).not.toMatch(/byok|openai|nvidia|ai-resolver/i);
    expect(matching).not.toMatch(/byok|openai|nvidia|ai-resolver/i);
    expect(migration).not.toMatch(/byok|openai|nvidia|llm/i);
  });

  it("renders explainable Global Priority and live Profile Relevance separately", () => {
    expect(globalView).toContain("Why prioritized");
    expect(globalView).toContain("not organizational business risk");
    expect(profileFeed).toContain("Why this matched");
    expect(profileFeed).toContain("Global technical context");
    expect(profileFeed).toContain("Identity pending");
  });
});
