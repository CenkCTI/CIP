import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/202607280017_phase2_1b_sources_enrichment.sql";
const sql = readFileSync(migrationPath, "utf8");
const phase2A = readFileSync(
  "supabase/migrations/202607280016_phase2_1a_investigation_ioc_workbench.sql",
  "utf8",
);

describe("CİTEM Product Roadmap Phase 2.1B migration", () => {
  it("creates distinct Source and enrichment persistence models", () => {
    expect(sql).toContain("create table public.sources");
    expect(sql).toContain("create table public.enrichment_runs");
    expect(sql).toContain("create table public.enrichment_results");
    expect(sql).toContain("add column if not exists source_id uuid");
    expect(sql).toContain("verification_state public.verification_state");
    expect(sql).not.toContain("alter table public.evidence rename");
  });

  it("enforces same-project Evidence, observation, run, Indicator and Source links", () => {
    expect(sql).toContain("foreign key(project_id, evidence_id)");
    expect(sql).toContain("references public.evidence(project_id, id) on delete restrict");
    expect(sql).toContain("indicator_observations_source_same_project_fk");
    expect(sql).toContain("references public.sources(project_id, id) on delete restrict");
    expect(sql).toContain("references public.enrichment_runs(project_id, id) on delete cascade");
    expect(sql).toContain("references public.indicators(project_id, id) on delete cascade");
  });

  it("preserves referenced Sources and allows only unreferenced hard deletion", () => {
    expect(sql).toContain("prevent_referenced_source_delete");
    expect(sql).toContain("source_referenced");
    expect(sql).toContain("archived_at timestamptz");
    expect(sql).not.toContain("references public.sources(project_id, id) on delete cascade");
  });

  it("protects active provider runs and normalized JSON contracts", () => {
    expect(sql).toContain("enrichment_runs_one_active_provider_idx");
    expect(sql).toContain("where status in ('PENDING','RUNNING')");
    expect(sql).toContain("jsonb_typeof(normalized_data) = 'object'");
    expect(sql).toContain("schema_version integer not null default 1 check (schema_version = 1)");
    expect(sql).toContain("response_hash text");
  });

  it("enables project-owned RLS and identity protection on every new table", () => {
    for (const table of ["sources", "enrichment_runs", "enrichment_results"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain("created_by = auth.uid()");
    expect(sql).toContain("requested_by = auth.uid()");
    expect(sql).toContain("public.project_is_owned(project_id)");
  });

  it("keeps migration 016 unchanged and does not start Phase 2.1C-E tables", () => {
    expect(createHash("sha256").update(phase2A).digest("hex")).toBe(
      "877e947a2a135092587252818aff5b58db61562b2c7f225817a257e84c15d16d",
    );
    expect(sql).not.toContain("infrastructure_clusters");
    expect(sql).not.toContain("attribution_assessments");
    expect(sql).not.toContain("report_versions");
    expect(sql).not.toContain("graph_source_nodes");
  });
});
