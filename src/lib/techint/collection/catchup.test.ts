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
    expect(script).toContain("CITEM_VERCEL_BYPASS_SECRET");
    expect(script).toContain("x-vercel-protection-bypass");
    expect(script).toContain("payload?.error === \"COLLECTOR_UNAUTHORIZED\"");
    expect(script).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(script).not.toContain("MALWAREBAZAAR_AUTH_KEY");
    expect(script).not.toContain("NVD_API_KEY");
    expect(script).not.toContain("THREATFOX_AUTH_KEY");
  });

  it("keeps collector claims owner-scoped and browser-inaccessible in migration 045", () => {
    const migration = readFileSync("supabase/migrations/202608100045_phase2_3f_a_continuous_collection.sql", "utf8");
    expect(migration).toContain("claim_due_technical_collections_for_owner");
    expect(migration).toContain("where owner_id = p_owner");
    expect(migration).toContain("token_hash text not null unique");
    expect(migration).toContain("collector token hash exposed");
    expect(migration).toContain("grant execute on function public.begin_technical_collector_tick(text) to service_role");
    expect(migration).not.toContain("grant execute on function public.begin_technical_collector_tick(text) to authenticated");
  });
});
