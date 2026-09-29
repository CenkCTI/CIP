import { describe, expect, it } from "vitest";

import {
  getInvestigationNavGroups,
  isInvestigationNavItemActive,
} from "@/components/investigations/workspace-nav";

describe("InvestigationWorkspaceNav", () => {
  const projectId = "investigation-1";
  const root = `/projects/${projectId}`;
  const groups = getInvestigationNavGroups(projectId);
  const items = groups.flatMap((group) => group.items);
  const byKey = (key: string) => {
    const item = items.find((candidate) => candidate.key === key);
    if (!item) throw new Error(`Missing navigation item: ${key}`);
    return item;
  };

  it("keeps all investigation destinations in one navigation surface", () => {
    expect(groups.map((group) => group.label)).toEqual([
      "Production",
      "Research artefacts",
      "Workspace",
      "Analysis",
    ]);

    expect(items.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        "Direction",
        "Collection",
        "Overview",
        "Notes",
        "Evidence",
        "Timeline",
        "Tasks",
        "Actors",
        "Campaigns",
        "IOC Workbench",
        "Malware",
        "CVEs",
        "MITRE",
        "Reports",
        "Infrastructure",
        "Graph",
        "AI",
        "Sources",
        "Intel Profile",
        "Attribution",
      ]),
    );
  });

  it("links dedicated pages directly and preserves query-backed modules", () => {
    expect(byKey("notes").href).toBe(`${root}/notes`);
    expect(byKey("reports").href).toBe(`${root}/reports`);
    expect(byKey("sources").href).toBe(`${root}/sources`);
    expect(byKey("intel-profile").href).toBe(`${root}/intel-profile`);
    expect(byKey("evidence").href).toBe(`${root}?tab=evidence&view=evidence`);
    expect(byKey("indicators").href).toBe(`${root}?tab=indicators`);
    expect(byKey("graph").href).toBe(`${root}?tab=graph`);
  });

  it("keeps active-state matching correct for query tabs and detail routes", () => {
    expect(isInvestigationNavItemActive(byKey("direction"), root, null)).toBe(true);
    expect(isInvestigationNavItemActive(byKey("direction"), root, "overview")).toBe(false);
    expect(isInvestigationNavItemActive(byKey("overview"), root, "overview")).toBe(true);
    expect(isInvestigationNavItemActive(byKey("campaigns"), root, "campaigns")).toBe(true);
    expect(
      isInvestigationNavItemActive(
        byKey("campaigns"),
        `${root}/campaigns/campaign-1`,
        null,
      ),
    ).toBe(true);
    expect(
      isInvestigationNavItemActive(
        byKey("indicators"),
        `${root}/indicators/indicator-1`,
        null,
      ),
    ).toBe(true);
    expect(
      isInvestigationNavItemActive(
        byKey("reports"),
        `${root}/reports/report-1`,
        null,
      ),
    ).toBe(true);
  });
});