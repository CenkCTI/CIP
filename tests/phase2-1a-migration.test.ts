import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const path =
  "supabase/migrations/202607280016_phase2_1a_investigation_ioc_workbench.sql";
const sql = readFileSync(path, "utf8");

describe("CİTEM Product Roadmap Phase 2.1A migration", () => {
  it("extends Projects without replacing the existing storage model", () => {
    expect(sql).toContain("alter table public.projects");
    expect(sql).toContain("research_question text");
    expect(sql).toContain("investigation_status public.investigation_status");
    expect(sql).toContain("current_assessment text");
    expect(sql).toContain("assessment_confidence public.confidence_level");
    expect(sql).toContain("closed_at timestamptz");
    expect(sql).not.toContain("create table public.investigations");
  });

  it("adds bounded Indicator assessment fields", () => {
    expect(sql).toContain("create type public.indicator_status");
    expect(sql).toContain("status public.indicator_status not null default 'UNVERIFIED'");
    expect(sql).toContain("char_length(analyst_rationale) <= 5000");
    expect(sql).toContain("char_length(current_relevance) <= 2000");
  });

  it("enforces same-project Indicator observation links", () => {
    expect(sql).toContain("create table public.indicator_observations");
    expect(sql).toContain("foreign key(project_id, indicator_id)");
    expect(sql).toContain("references public.indicators(project_id, id) on delete cascade");
    expect(sql).toContain("created_by uuid not null references auth.users(id)");
  });

  it("enables RLS and prevents created_by spoofing", () => {
    expect(sql).toContain(
      "alter table public.indicator_observations enable row level security",
    );
    expect(sql).toContain("public.project_is_owned(project_id)");
    expect(sql).toContain("created_by = auth.uid()");
    expect(sql).toContain("for select to authenticated");
    expect(sql).toContain("for insert to authenticated");
    expect(sql).toContain("for update to authenticated");
    expect(sql).toContain("for delete to authenticated");
  });

  it("keeps canonical creation and observation insertion transactional", () => {
    expect(sql).toContain("function public.import_indicator_observation");
    expect(sql).toContain(
      "on conflict (project_id, type, normalized_value) do nothing",
    );
    expect(sql).toContain("insert into public.indicator_observations");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("security invoker");
  });

  it("does not start later Product Phase 2.1 capabilities", () => {
    expect(sql).not.toContain("create table public.sources");
    expect(sql).not.toContain("enrichment_runs");
    expect(sql).not.toContain("infrastructure_clusters");
    expect(sql).not.toContain("attribution_assessments");
    expect(sql).not.toContain("report_versions");
  });
});
