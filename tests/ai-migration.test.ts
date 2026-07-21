import { describe, expect, it } from "vitest";
import fs from "node:fs";
describe("AI usage migration", () => {
  const sql = fs.readFileSync("supabase/migrations/202607210012_phase6_ai_usage.sql", "utf8");
  it("stores only metadata and locks reservation", () => { expect(sql).toContain("create table if not exists public.ai_usage_events"); expect(sql).toContain("pg_advisory_xact_lock"); expect(sql).toContain("security definer set search_path = ''"); expect(sql).toContain("revoke all on function public.reserve_ai_usage_event"); expect(sql).not.toMatch(/prompt|raw_model_output|api_key/i); });
});
