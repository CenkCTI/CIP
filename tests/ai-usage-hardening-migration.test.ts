import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("AI usage hardening migration 013", () => {
  const sql = fs.readFileSync("supabase/migrations/202607230013_phase6_ai_usage_hardening.sql", "utf8");
  it("removes direct authenticated write policies and keeps RPC write path", () => {
    expect(sql).toContain('drop policy if exists "Project owners can insert their AI usage metadata"');
    expect(sql).toContain('drop policy if exists "Project owners can update their reserved AI usage metadata"');
    expect(sql).toContain("security definer");
    expect(sql).toContain("grant execute on function public.reserve_ai_usage_event");
  });
  it("counts failed and cancelled attempts by counting all user rows in the window", () => {
    expect(sql).toContain("and created_at >= v_start;");
    expect(sql).not.toContain("status in ('RESERVED','SUCCEEDED')");
  });
  it("prevents caller supplied limits from weakening the database ceiling", () => {
    expect(sql).toContain("v_min_window integer := 60");
    expect(sql).toContain("v_max_requests integer := 10");
    expect(sql).toContain("greatest(coalesce(p_window_minutes, v_min_window), v_min_window)");
    expect(sql).toContain("least(coalesce(p_max_requests, v_max_requests), v_max_requests)");
    expect(sql).toContain("least(coalesce(p_max_input_chars, v_max_input_chars), v_max_input_chars)");
  });
});
