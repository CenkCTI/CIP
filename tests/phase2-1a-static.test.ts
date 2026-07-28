import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("Phase 2.1A Investigation and IOC Workbench integration", () => {
  it("keeps internal Project routes while using Investigation terminology", () => {
    const registry = readFileSync("src/app/projects/page.tsx", "utf8");
    const createPage = readFileSync("src/app/projects/new/page.tsx", "utf8");
    const navigation = readFileSync("src/components/shell-nav.tsx", "utf8");

    expect(registry).toContain('href={`/projects/${investigation.id}`}');
    expect(registry).toContain("Investigation registry");
    expect(registry).toContain("No research question defined");
    expect(createPage).toContain("New investigation");
    expect(navigation).toContain('href: "/projects", label: "Investigations"');
  });

  it("integrates bulk intake with existing single Indicator CRUD", () => {
    const forms = readFileSync("src/components/cti-forms.tsx", "utf8");

    expect(forms).toContain("BulkIocIntake");
    expect(forms).toContain('tab === "indicators" && !row');
    expect(forms).toContain("Single Indicator creation remains available");
    expect(forms).toContain("Relationships");
    expect(forms).toContain("createCti");
    expect(forms).toContain("updateCti");
    expect(forms).toContain("deleteCti");
  });

  it("keeps preview read-only and recomputes import state on the server", () => {
    const actions = readFileSync(
      "src/app/projects/[id]/ioc-actions.ts",
      "utf8",
    );

    const previewStart = actions.indexOf("export async function previewBulkIndicators");
    const importStart = actions.indexOf("export async function importBulkIndicators");
    const previewSection = actions.slice(previewStart, importStart);

    expect(previewSection).not.toContain(".insert(");
    expect(previewSection).not.toContain(".rpc(");
    expect(actions).toContain("preparePreview(projectId, input)");
    expect(actions).toContain("parseBulkIndicatorInput(parsedInput.data.text)");
    expect(actions).toContain("requireOwnedProject(projectId)");
    expect(actions).toContain('"import_indicator_observation"');
    expect(actions).not.toContain("service_role");
  });

  it("shows Indicator observation history through the existing detail route", () => {
    const detail = readFileSync(
      "src/app/projects/[id]/[module]/[entityId]/page.tsx",
      "utf8",
    );

    expect(detail).toContain('.from("indicator_observations")');
    expect(detail).toContain("Observation history");
    expect(detail).toContain("safeDefangIndicatorValue");
    expect(detail).toContain("Related entities");
    expect(detail).toContain("CtiDelete");
  });

  it("reuses the shared IOC normalizer in AI approval workflows", () => {
    const aiPure = readFileSync("src/lib/ai/pure.ts", "utf8");
    const indicatorModule = readFileSync("src/lib/cti/indicators.ts", "utf8");

    expect(aiPure).toContain('from "@/lib/cti/indicators"');
    expect(aiPure).toContain("validateObservedIndicator");
    expect(indicatorModule).toContain("normalizeObservedIndicatorValue");
    expect(indicatorModule).toContain("parseBulkIndicatorInput");
  });

  it("does not add later Phase 2.1 UI or persistence", () => {
    const changedScope = [
      readFileSync("src/components/ioc-workbench/bulk-ioc-intake.tsx", "utf8"),
      readFileSync("src/app/projects/[id]/ioc-actions.ts", "utf8"),
      readFileSync(
        "supabase/migrations/202607280016_phase2_1a_investigation_ioc_workbench.sql",
        "utf8",
      ),
    ].join("\n");

    expect(changedScope).not.toContain("Enrichment provider");
    expect(changedScope).not.toContain("Infrastructure Cluster");
    expect(changedScope).not.toContain("Attribution candidate");
    expect(changedScope).not.toContain("report_versions");
  });
});
