import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202608050031_phase2_3a_techint_profiles.sql",
  "utf8",
);
const actions = readFileSync("src/app/techint/actions.ts", "utf8");

describe("TechINT trusted workflow hardening", () => {
  it("removes authenticated direct mutation policies and exposes select-only RLS", () => {
    expect(migration).toContain(
      "revoke all on public.intel_profiles, public.intel_profile_items, public.intel_profile_audit_events from anon, authenticated",
    );
    expect(migration).toContain(
      "grant select on public.intel_profiles, public.intel_profile_items, public.intel_profile_audit_events to authenticated",
    );
    expect(migration).not.toContain("for insert to authenticated");
    expect(migration).not.toContain("for update to authenticated");
    expect(migration).not.toContain("for delete to authenticated");
  });

  it("defines narrow trusted transactional workflows with service-role-only execute grants", () => {
    for (const fn of [
      "create_standalone_intel_profile",
      "create_investigation_intel_profile",
      "update_intel_profile_definition",
      "set_intel_profile_status",
      "add_explicit_intel_profile_item",
      "transition_intel_profile_item",
      "refresh_investigation_intel_profile",
    ]) {
      expect(migration).toContain(`function public.${fn}`);
      expect(migration).toContain(fn);
    }
    expect(migration).toContain("grant execute on function public.create_standalone_intel_profile");
    expect(migration).toContain(" to service_role");
    expect(migration).toContain("TechINT trusted function ACL invalid");
  });

  it("binds Investigation refresh to the profile project and preserves exclusions/removals", () => {
    expect(migration).toContain("kind='INVESTIGATION' and project_id=p_project");
    expect(migration).toContain("elsif item.state='EXCLUDED' then excl:=excl+1");
    expect(migration).toContain("elsif item.state='REMOVED' then rem:=rem+1");
    expect(migration).toContain("unique(owner_id,profile_id,profile_local_key)");
    expect(migration).toContain("preserved_exclusions");
    expect(migration).toContain("preserved_removals");
  });

  it("validates explicit item state transitions including reactivation", () => {
    expect(migration).toContain("INVALID_ITEM_TRANSITION");
    expect(migration).toContain("set state='ACTIVE',removed_at=null,accepted_by=p_actor,updated_by=p_actor");
    expect(migration).toContain("set state=p_target_state,removed_at=clock_timestamp(),updated_by=p_actor");
    expect(migration).toContain("ITEM_REACTIVATED");
    expect(migration).toContain("LOCATION_ROLE_REQUIRED");
    expect(migration).toContain("INVALID_PROFILE_TRANSITION");
    expect(migration).toContain("p.status='ACTIVE' and p_status='PAUSED'");
  });

  it("routes application mutations through trusted workflows without direct table writes", () => {
    expect(actions).toContain("createStandaloneProfileWorkflow");
    expect(actions).toContain("refreshInvestigationProfileWorkflow");
    expect(actions).not.toContain('.from("intel_profiles").insert');
    expect(actions).not.toContain('.from("intel_profile_items").update');
    expect(actions).not.toContain('.from("intel_profile_audit_events")');
  });

  it("validates indicators without corrupting URL path case and skips unsupported seed records", () => {
    expect(migration).toContain("intel_profile_validate_indicator");
    expect(migration).toContain("p_type='CIDR'");
    expect(migration).toContain("p_type='URL'");
    expect(migration).toContain("host like '%@%'");
    expect(migration).toContain("host=':'");
    expect(migration).toContain("split_part(host,':',2)::int not between 1 and 65535");
    expect(migration).toContain("return lower(substring(v from '^(https?://[^/?#]+)'))||substring(v from '^https?://[^/?#]+(.*)$')");
    expect(migration).toContain("id,value,type from public.indicators");
    expect(migration).toContain("r.indicator_type not in('IP','CIDR','DOMAIN','URL','HASH','EMAIL')");
    expect(migration).toContain("exception when invalid_parameter_value");
  });

  it("does not add network, provider, OTX, matching, alert, or AI calls", () => {
    expect(actions).not.toMatch(/fetch\s*\(/i);
    expect(actions).not.toMatch(/otx|ollama|openai|threatfox|nvd|epss|kev|alert|matching/i);
    expect(migration).not.toMatch(/otx|ollama|openai|threatfox|nvd|epss|kev|alert|matching/i);
  });
});
