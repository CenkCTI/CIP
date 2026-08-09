import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAliasRecommendations } from "@/lib/techint/entities/alias-recommendations";

const migration040 = readFileSync("supabase/migrations/202608100040_phase2_3d_post_sync_reconciliation.sql", "utf8");
const orchestrator = readFileSync("src/lib/techint/collection/orchestrator.ts", "utf8");
const trustedClient = readFileSync("src/lib/techint/entities/trusted-client.ts", "utf8");
const sourcesActions = readFileSync("src/app/techint/sources/actions.ts", "utf8");
const page = readFileSync("src/app/techint/entities/page.tsx", "utf8");

const entity1 = "10000000-0000-4000-8000-000000000001";
const entity2 = "10000000-0000-4000-8000-000000000002";

function recommendationFixture() {
  return {
    entities: [
      { id: entity1, entity_kind: "VENDOR", canonical_name: "Google", status: "ACTIVE" },
      { id: entity2, entity_kind: "VENDOR", canonical_name: "Different Google", status: "ACTIVE" },
    ],
    aliases: [] as Array<{ entity_kind: string; normalized_value: string; display_value: string; status: string }>,
    assertions: [1, 2, 3].map((index) => ({
      id: `20000000-0000-4000-8000-00000000000${index}`,
      entity_kind: "VENDOR",
      display_value: "Google LLC",
      normalized_value: "google llc",
      source_observation_id: `30000000-0000-4000-8000-00000000000${index}`,
    })),
    observations: [
      { id: "30000000-0000-4000-8000-000000000001", source_system: "nvd" },
      { id: "30000000-0000-4000-8000-000000000002", source_system: "cisa_kev" },
      { id: "30000000-0000-4000-8000-000000000003", source_system: "nvd" },
    ],
    resolutions: [
      { assertion_id: "20000000-0000-4000-8000-000000000001", entity_kind: "VENDOR", entity_id: entity1, status: "RESOLVED", basis: "AI_VERIFIED", resolved_at: "2026-08-08T10:00:00Z" },
      { assertion_id: "20000000-0000-4000-8000-000000000002", entity_kind: "VENDOR", entity_id: entity1, status: "RESOLVED", basis: "ANALYST_LINK", resolved_at: "2026-08-09T10:00:00Z" },
      { assertion_id: "20000000-0000-4000-8000-000000000003", entity_kind: "VENDOR", entity_id: entity1, status: "RESOLVED", basis: "AI_VERIFIED", resolved_at: "2026-08-10T10:00:00Z" },
    ],
  };
}

describe("Phase 2.3D evidence-backed alias recommendations", () => {
  it("recommends one exact alias after three direct observations resolve to one canonical entity", () => {
    const result = buildAliasRecommendations(recommendationFixture());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      entityId: entity1,
      entityKind: "VENDOR",
      canonicalName: "Google",
      displayValue: "Google LLC",
      normalizedValue: "google llc",
      observationCount: 3,
      aiVerifiedCount: 2,
      analystConfirmedCount: 1,
    });
    expect(result[0].sourceSystems).toEqual(["cisa_kev", "nvd"]);
  });

  it("suppresses a recommendation when the exact label has conflicting direct canonical targets", () => {
    const fixture = recommendationFixture();
    fixture.assertions.push({
      id: "20000000-0000-4000-8000-000000000004",
      entity_kind: "VENDOR",
      display_value: "Google LLC",
      normalized_value: "google llc",
      source_observation_id: "30000000-0000-4000-8000-000000000004",
    });
    fixture.observations.push({ id: "30000000-0000-4000-8000-000000000004", source_system: "other" });
    fixture.resolutions.push({
      assertion_id: "20000000-0000-4000-8000-000000000004",
      entity_kind: "VENDOR",
      entity_id: entity2,
      status: "RESOLVED",
      basis: "ANALYST_LINK",
      resolved_at: "2026-08-10T11:00:00Z",
    });
    expect(buildAliasRecommendations(fixture)).toEqual([]);
  });

  it("does not recommend an exact mapping that already has an active alias", () => {
    const fixture = recommendationFixture();
    fixture.aliases.push({ entity_kind: "VENDOR", normalized_value: "google llc", display_value: "Google LLC", status: "ACTIVE" });
    expect(buildAliasRecommendations(fixture)).toEqual([]);
  });
});

describe("Phase 2.3D post-sync automatic reconciliation", () => {
  it("prioritizes unseen assertions, provides a new-only RPC, and serializes owner reconciliation", () => {
    expect(migration040).toContain("(q.id is null) as was_unseen");
    expect(migration040).toContain("order by (q.id is null) desc");
    expect(migration040).toContain("'unseen_processed',unseen_count");
    expect(migration040).toContain("reconcile_new_technical_entity_assertions");
    expect(migration040).toContain("technical-entity-reconcile");
    expect(migration040).toContain("pg_advisory_xact_lock");
    expect(migration040).toContain("NEW_ENTITY_RECONCILE_SCOPE_MISMATCH");
    expect(migration040).toContain("to service_role");
    expect(migration040).toContain("from public,anon,authenticated");
  });

  it("uses the new-only trusted RPC after a successful collection without making post-processing authoritative for collection success", () => {
    expect(trustedClient).toContain("reconcileNewTechnicalEntitiesWorkflow");
    expect(trustedClient).toContain('rpc("reconcile_new_technical_entity_assertions"');
    expect(orchestrator).toContain("reconcileNewTechnicalEntitiesWorkflow");
    expect(orchestrator).not.toContain("reconcileTechnicalEntitiesWorkflow");
    expect(orchestrator).toContain("POST_SYNC_RECONCILE_BATCH = 500");
    expect(orchestrator).toContain("POST_SYNC_RECONCILE_MAX_BATCHES = 10");
    expect(orchestrator).toContain("entityAssertionsCreated += recorded.entity_assertions_created");
    expect(orchestrator).toContain("if (entityAssertionsCreated > 0)");
    expect(orchestrator).toContain("entityReconciliation = await reconcileFreshTechnicalAssertions(claim.owner_id)");
    expect(orchestrator).toContain("entityReconciliation = null");
    expect(orchestrator.indexOf("const completion = await completeTechnicalCollection")).toBeLessThan(orchestrator.indexOf("entityReconciliation = await reconcileFreshTechnicalAssertions"));
  });

  it("refreshes Resolution Control after manual sync and keeps alias confirmation analyst-controlled", () => {
    expect(sourcesActions).toContain('revalidatePath("/techint/entities")');
    expect(page).toContain("Alias recommendations");
    expect(page).toContain("Confirm exact alias");
    expect(page).toContain("at least three source observations");
    expect(orchestrator).not.toContain("addTechnicalEntityAliasWorkflow");
  });
});
