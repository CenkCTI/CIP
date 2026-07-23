import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("migration 015 guest provider constraint", () => {
  it("strictly adds nvidia_nim to guest cloud usage providers", () => {
    const sql = readFileSync("supabase/migrations/202607230015_phase7_guest_nvidia_provider_constraint.sql", "utf8");
    expect(sql).toMatch(/alter table public\.guest_ai_usage_events/i);
    expect(sql).toMatch(/drop constraint if exists guest_ai_usage_events_provider_check/i);
    expect(sql).toMatch(/provider in \('openai','openrouter','groq','nvidia_nim'\)/);
    expect(sql).not.toContain("ollama");
    expect(sql).not.toContain("unknown");
  });
});
