import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Phase 2.1B repository integration", () => {
  it("keeps Sources distinct from Evidence and AI report aliases", () => {
    const sourcePage = read("src/app/projects/[id]/sources/page.tsx");
    const registry = read("src/components/sources/source-registry.tsx");
    const aiProvenance = read("src/lib/ai/provenance.ts");

    expect(sourcePage).toContain('.from("sources")');
    expect(sourcePage).toContain('.from("evidence")');
    expect(registry).toContain(
      "Source records identify where information came from",
    );
    expect(registry).toContain(
      "Evidence stores the actual research artefact",
    );
    expect(aiProvenance).toContain("ReportSourceRef");
    expect(aiProvenance).not.toContain("enrichment_results");
  });

  it("repeats ownership and same-project validation in Source mutations", () => {
    const actions = read("src/app/projects/[id]/source-actions.ts");
    expect(actions).toContain("requireOwnedProject(projectId)");
    expect(actions).toContain('.from("evidence")');
    expect(actions).toContain('.eq("project_id", context.projectId)');
    expect(actions).toContain('.from("indicator_observations")');
    expect(actions).toContain("created_by: context.user.id");
    expect(actions).not.toContain("service_role");
  });

  it("blocks referenced Source deletion and preserves legacy labels", () => {
    const actions = read("src/app/projects/[id]/source-actions.ts");
    const provenance = read("src/components/sources/indicator-provenance.tsx");
    expect(actions).toContain("Referenced Sources cannot be deleted");
    expect(actions).toContain('.from("enrichment_results")');
    expect(provenance).toContain("Legacy label retained");
    expect(provenance).toContain('text(observation.source_label)');
    expect(provenance).toContain("No source recorded");
  });

  it("uses a fixed server-only provider registry independent of AI BYOK", () => {
    const registry = read("src/lib/enrichment/registry.ts");
    const fixture = read("src/lib/enrichment/providers/fixture.ts");
    const byok = read("src/lib/ai/byok/providers.ts");
    expect(registry).toContain('import "server-only"');
    expect(registry).toContain("ENRICHMENT_FIXTURE_ENABLED");
    expect(registry).not.toContain("BYOK");
    expect(registry).not.toContain("AI_API_KEY");
    expect(fixture).not.toContain("fetch(");
    expect(byok).not.toContain("fixture_cti");
  });

  it("executes bounded enrichment without mutating analyst assessment, Graph or Timeline", () => {
    const service = read("src/lib/enrichment/service.ts");
    expect(service).toContain('.from("enrichment_runs")');
    expect(service).toContain('.from("enrichment_results")');
    expect(service).toContain('externalKey = `enrichment-provider:${provider.id}`');
    expect(service).toContain("providerResponseSchema.safeParse");
    expect(service).toContain('createHash("sha256")');
    expect(service).not.toContain('.from("entity_relationships")');
    expect(service).not.toContain('.from("timeline_events")');
    expect(service).not.toContain('.from("indicators").update');
    expect(service).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("shows normalized results, synthetic warnings and provider-verdict boundaries", () => {
    const detail = read(
      "src/app/projects/[id]/indicators/[entityId]/page.tsx",
    );
    const enrichment = read(
      "src/components/enrichment/indicator-enrichment.tsx",
    );
    expect(detail).toContain("IndicatorProvenance");
    expect(detail).toContain("IndicatorEnrichment");
    expect(detail).toContain("Enrichment results never change Indicator status");
    expect(enrichment).toContain("TEST / SYNTHETIC");
    expect(enrichment).toContain(
      "A provider verdict is external technical context",
    );
    expect(enrichment).toContain("CİTEM&apos;s final analyst");
    expect(enrichment).toContain("Provider-observed related Indicators");
    expect(enrichment).toContain("Sanitized JSON debugging view");
  });

  it("documents disabled-by-default server settings", () => {
    const env = read(".env.example");
    expect(env).toContain("ENRICHMENT_ENABLED=false");
    expect(env).toContain("ENRICHMENT_FIXTURE_ENABLED=false");
    expect(env).toContain("ENRICHMENT_STORE_RAW_RESPONSES=false");
    expect(env).not.toContain("ENRICHMENT_API_KEY=");
  });

  it("does not start Phase 2.1C-E capabilities", () => {
    const scope = [
      read("src/lib/enrichment/service.ts"),
      read("src/components/enrichment/indicator-enrichment.tsx"),
      read("supabase/migrations/202607280017_phase2_1b_sources_enrichment.sql"),
    ].join("\n");
    expect(scope).not.toContain("Infrastructure Cluster");
    expect(scope).not.toContain("attribution_assessments");
    expect(scope).not.toContain("report_versions");
    expect(scope).not.toContain("scheduled enrichment");
    expect(scope).not.toContain("port scan");
  });
});
