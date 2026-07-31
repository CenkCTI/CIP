import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql=readFileSync("supabase/migrations/202607300023_phase2_2a_research_feed_ingestion.sql","utf8");
describe("migration 023 contract",()=>{
 it.each(["research_feed_sources","research_feed_fetch_runs","research_items","research_item_fingerprints","research_feed_item_observations"])("creates %s",table=>expect(sql).toContain(`create table public.${table}`));
 it("binds leases to run, URL hash, token and expiry",()=>{expect(sql).toContain("fetch_lease_run_id");expect(sql).not.toContain("fetch_lease_token uuid");expect(sql).toContain("fetch_lease_url_hash");expect(sql).toContain("lease_token_hash");expect(sql).toContain("LEASE_EXPIRED");});
 it("enables RLS on every table",()=>expect(sql.match(/enable row level security/g)).toHaveLength(5));
 it("enforces fingerprint uniqueness",()=>expect(sql).toContain("unique(project_id,fingerprint_type,fingerprint_hash)"));
 it("serializes deduplication and feed limits",()=>{expect(sql).toContain("pg_advisory_xact_lock");expect(sql).toContain(":feed-limit");});
 it("restricts trusted workflows to service role",()=>{expect(sql).toContain("from public,anon,authenticated");expect(sql).toContain("to service_role");expect(sql).not.toContain("to authenticated;");});
 it("provides paused restoration",()=>{expect(sql).toContain("restore_research_feed");expect(sql).toContain("set enabled=false,archived_at=null");});
});
