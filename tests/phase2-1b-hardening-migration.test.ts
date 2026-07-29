import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/202607290018_phase2_1b_enrichment_hardening.sql",
  "utf8",
);

describe("Phase 2.1B migration 018 enrichment hardening", () => {
  it("removes result mutation and run deletion policies while retaining required policies", () => {
    expect(sql).toContain('drop policy if exists "enrichment results update owned investigation"');
    expect(sql).toContain('drop policy if exists "enrichment results delete owned investigation"');
    expect(sql).toContain('drop policy if exists "enrichment runs delete owned investigation"');
    expect(sql).not.toContain('drop policy if exists "enrichment results select owned investigation"');
    expect(sql).not.toContain('drop policy if exists "enrichment results insert owned investigation"');
    expect(sql).not.toContain('drop policy if exists "enrichment runs update owned investigation"');
  });

  it("allows only the specified non-terminal run transitions", () => {
    expect(sql).toContain("old.status = 'PENDING' and new.status in ('RUNNING', 'FAILED', 'CANCELLED')");
    expect(sql).toContain("old.status = 'RUNNING' and new.status in ('SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED')");
    expect(sql).toContain("terminal_enrichment_run_is_immutable");
    expect(sql).toContain("invalid_enrichment_run_transition");
  });

  it("makes run identity, snapshots, terminal history, and deletion immutable", () => {
    for (const field of [
      "project_id", "indicator_id", "provider_id", "provider_label_snapshot",
      "indicator_type_snapshot", "indicator_value_snapshot", "is_synthetic",
      "requested_by", "requested_at", "created_at",
    ]) expect(sql).toContain(`old.${field} is distinct from new.${field}`);
    expect(sql).toContain("before update or delete on public.enrichment_runs");
    expect(sql).toContain("enrichment_run_history_is_immutable");
  });

  it("makes results append-only and accepts inserts only for the matching running run", () => {
    expect(sql).toContain("before insert or update or delete on public.enrichment_results");
    expect(sql).toContain("enrichment_results_are_append_only");
    expect(sql).toContain("run.id = new.run_id");
    expect(sql).toContain("run.project_id = new.project_id");
    expect(sql).toContain("run.indicator_id = new.indicator_id");
    expect(sql).toContain("run.status = 'RUNNING'");
  });

  it("is additive and does not rewrite or delete stored history", () => {
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);
    expect(sql).not.toMatch(/\balter\s+table.+drop\s+column\b/i);
    expect(sql).not.toContain('drop policy if exists "enrichment results select owned investigation"');
  });

  it("does not introduce later-phase Graph, Timeline, assessment, AI, or BYOK mutations", () => {
    for (const boundary of [
      "graph_edges", "timeline", "assessment_status", "ai_usage", "byok",
    ]) expect(sql.toLowerCase()).not.toContain(boundary);
  });
});
