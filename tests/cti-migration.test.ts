import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const sql=readFileSync("supabase/migrations/202607210006_phase3_cti.sql","utf8");
describe("phase 3 migration regression coverage",()=>{
  it("uses authenticated-scoped RLS policies and restricts RPC execution",()=>{expect(sql).toContain("for select to authenticated"); expect(sql).toContain("for insert to authenticated"); expect(sql).toContain("grant execute on function public.replace_cti_relationships"); expect(sql).toContain("revoke all on function public.replace_cti_relationships");});
  it("preserves composite same-project FKs and cascade cleanup",()=>{expect(sql.match(/foreign key\(project_id,/g)?.length).toBeGreaterThanOrEqual(20); expect(sql.match(/on delete cascade/g)?.length).toBeGreaterThanOrEqual(25);});
  it("defines the atomic relationship RPC with auth, ownership, duplicate, removal, cross-project, and rollback safeguards",()=>{expect(sql).toContain("create or replace function public.replace_cti_relationships"); expect(sql).toContain("auth.uid() is null"); expect(sql).toContain("owner_id = auth.uid()"); expect(sql).toContain("select distinct unnest"); expect(sql).toContain("invalid_relationship"); expect(sql).toContain("exception when others then");});
  it("adds reverse lookup indexes for relationship detail pages",()=>{for(const name of ["campaign_threat_actors_actor_idx","threat_actor_malware_malware_idx","campaign_indicators_indicator_idx","malware_mitre_techniques_mitre_idx"]){expect(sql).toContain(name);}});

  it("quotes reserved references column identifiers",()=>{
    expect(sql.match(/"references"\\s+text\\[\\]/g)?.length).toBe(2);
    expect(sql).not.toMatch(/,\\s*references\\s+text\\[\\]/i);
  });
});
