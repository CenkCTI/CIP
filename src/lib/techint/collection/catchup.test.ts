import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { technicalSourceCatchUpCapability } from "./catchup";

describe("Phase 2.3F-A catch-up capabilities", () => {
  it("describes durable and bounded source recovery without claiming universal completeness", () => {
    expect(technicalSourceCatchUpCapability("NVD_CVE")).toMatchObject({
      mode: "CURSOR_WINDOW",
      fullGapRecovery: true,
      maxRecoverableGapHours: 2880,
    });
    expect(technicalSourceCatchUpCapability("THREATFOX", { lookbackDays: 3 })).toMatchObject({
      mode: "BOUNDED_LOOKBACK",
      fullGapRecovery: true,
      maxRecoverableGapHours: 72,
    });
    expect(technicalSourceCatchUpCapability("CISA_KEV").fullGapRecovery).toBe(false);
    expect(technicalSourceCatchUpCapability("FIRST_EPSS").fullGapRecovery).toBe(false);
    expect(technicalSourceCatchUpCapability("MALWAREBAZAAR").mode).toBe("LATEST_SNAPSHOT");
  });

  it("keeps the local companion outside the service-role and provider-secret boundary", () => {
    const script = readFileSync("scripts/techint-collector.mjs", "utf8");
    expect(script).toContain("CITEM_COLLECTOR_TOKEN");
    expect(script).toContain("/api/techint/collector/tick");
    expect(script).toContain("/api/techint/collector/work");
    expect(script).toContain("CITEM_VERCEL_BYPASS_SECRET");
    expect(script).toContain("x-vercel-protection-bypass");
    expect(script).toContain("payload?.error === \"COLLECTOR_UNAUTHORIZED\"");
    expect(script).toContain("desktop is driving bounded work units");
    expect(script).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(script).not.toContain("MALWAREBAZAAR_AUTH_KEY");
    expect(script).not.toContain("NVD_API_KEY");
    expect(script).not.toContain("THREATFOX_AUTH_KEY");
  });

  it("keeps tick claim-only and moves long-running progress into bounded work units", () => {
    const tickRuntime = readFileSync("src/lib/techint/collection/collector-runtime.ts", "utf8");
    const workRuntime = readFileSync("src/lib/techint/collection/collector-work-runtime.ts", "utf8");
    expect(tickRuntime).toContain("claimDueTechnicalCollectionsForOwner");
    expect(tickRuntime).not.toContain("runClaimedTechnicalCollection");
    expect(workRuntime).toContain("MAX_COLLECTOR_WORK_UNIT_SIGNALS = 100");
    expect(workRuntime).toContain("DEFAULT_WORK_UNIT_SIGNALS = 50");
    expect(workRuntime).toContain("SOURCE_SNAPSHOT_CHANGED");
    expect(workRuntime).toContain("checkpointIncrementalTechnicalCollection");
    expect(workRuntime).toContain("completeIncrementalTechnicalCollection");
  });

  it("keeps migration 045 immutable and adds trusted incremental work only in migration 046", () => {
    const migration045 = readFileSync("supabase/migrations/202608100045_phase2_3f_a_continuous_collection.sql", "utf8");
    const migration046 = readFileSync("supabase/migrations/202608100046_phase2_3f_a_incremental_collection_work.sql", "utf8");
    expect(migration045).toContain("claim_due_technical_collections_for_owner");
    expect(migration045).toContain("token_hash text not null unique");
    expect(migration045).toContain("collector token hash exposed");
    expect(migration046).toContain("collector_work_state jsonb");
    expect(migration046).toContain("checkpoint_incremental_technical_collection_run");
    expect(migration046).toContain("complete_incremental_technical_collection_run");
    expect(migration046).toContain("fail_incremental_technical_collection_run");
    expect(migration046).toContain("incremental collector trusted RPC exposed");
    expect(migration046).not.toContain("grant execute on function public.authenticate_technical_collector(text) to authenticated");
    expect(migration046).not.toContain("grant execute on function public.checkpoint_incremental_technical_collection_run(uuid,text,jsonb,jsonb,jsonb) to authenticated");
  });
});
