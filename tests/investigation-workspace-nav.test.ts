import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getInvestigationNavGroups,
  InvestigationWorkspaceNav,
  isInvestigationNavItemActive,
} from "@/components/investigations/workspace-nav";

const navigation = vi.hoisted(() => ({ pathname: "", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const projectId = "investigation-1";
const root = `/projects/${projectId}`;
const destinations = [
  ["Intelligence Direction", [
    ["direction", ""],
    ["overview", "?tab=overview"],
    ["intel-profile", "/intel-profile"],
  ]],
  ["01 — Collection & Validation", [
    ["collection", "/collection"],
    ["sources", "/sources"],
    ["source-claims", "/source-claims"],
  ]],
  ["02 — Analysis & Reporting", [
    ["canvas", "/canvas"],
    ["fusion", "/fusion"],
    ["mitre", "?tab=mitre"],
    ["actors", "?tab=actors"],
    ["campaigns", "?tab=campaigns"],
    ["malware", "?tab=malware"],
    ["cves", "?tab=cves"],
    ["infrastructure", "?tab=infrastructure"],
    ["attribution", "/attribution"],
    ["reports", "/reports"],
  ]],
  ["Shared Workspace", [
    ["evidence", "?tab=evidence&view=evidence"],
    ["indicators", "?tab=indicators"],
    ["timeline", "?tab=timeline"],
    ["graph", "?tab=graph"],
    ["notes", "/notes"],
    ["tasks", "?tab=tasks"],
  ]],
] as const;

function activeKeys(href: string) {
  const { pathname, searchParams } = new URL(href, "https://citem.test");
  return getInvestigationNavGroups(projectId)
    .flatMap((group) => group.items)
    .filter((item) => isInvestigationNavItemActive(item, pathname, searchParams.get("tab")))
    .map((item) => item.key);
}

afterEach(() => vi.unstubAllEnvs());

describe("Investigation workspace navigation", () => {
  it("places each existing destination in one department and preserves its key and href", () => {
    vi.stubEnv("NEXT_PUBLIC_CITEM_STAGE3_COPILOT_ENABLED", "false");
    const groups = getInvestigationNavGroups(projectId);
    expect(groups.map(({ label, items }) => [label, items.map(({ key, href }) => [key, href])])).toEqual(
      destinations.map(([label, items]) => [label, items.map(([key, suffix]) => [key, root + suffix])]),
    );

    const items = groups.flatMap((group) => group.items);
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length);

    for (const { key, href } of items) {
      expect(activeKeys(href), href).toEqual([key]);
    }
  });

  it.each([
    ["/sources/source-1", "sources"],
    ["/sources/source-1/print", "sources"],
    ["/source-claims/claim-1", "source-claims"],
    ["/indicators/indicator-1", "indicators"],
    ["/timeline/event-1", "timeline"],
    ["/canvas/canvas-1", "canvas"],
    ["/actors/actor-1", "actors"],
    ["/campaigns/campaign-1?historical=1", "campaigns"],
    ["/malware/malware-1", "malware"],
    ["/cves/cve-1", "cves"],
    ["/mitre/technique-1", "mitre"],
    ["/infrastructure/cluster-1", "infrastructure"],
    ["/campaigns/campaign-1/attribution", "attribution"],
    ["/campaigns/campaign-1/attribution/hypothesis-1", "attribution"],
    ["/reports/report-1", "reports"],
    ["/reports/report-1/versions/version-1", "reports"],
    ["?tab=notes", "notes"],
    ["?tab=reports", "reports"],
  ])("activates only the owning module for %s", (suffix, key) => {
    expect(activeKeys(root + suffix)).toEqual([key]);
  });

  it("keeps route matching inside the current Investigation and on segment boundaries", () => {
    expect(activeKeys("/projects/investigation-10/campaigns/campaign-1/attribution")).toEqual([]);
    expect(activeKeys(root + "/sources-other")).toEqual([]);
    expect(activeKeys(root + "/source-claims/claim-1?tab=overview")).toEqual(["source-claims"]);
  });

  it("exposes AI Copilot in Shared Workspace only when the existing flag is enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_CITEM_STAGE3_COPILOT_ENABLED", "false");
    expect(activeKeys(root + "?tab=ai")).toEqual([]);

    vi.stubEnv("NEXT_PUBLIC_CITEM_STAGE3_COPILOT_ENABLED", "true");
    const shared = getInvestigationNavGroups(projectId).find((group) => group.key === "shared");
    expect(shared?.items.at(-1)).toMatchObject({
      key: "ai",
      label: "AI Copilot",
      href: root + "?tab=ai",
    });
    expect(activeKeys(root + "?tab=ai")).toEqual(["ai"]);
  });

  it("supports keyboard disclosure while indicating the current route when collapsed", async () => {
    const user = userEvent.setup();
    navigation.pathname = root + "/sources/source-1";
    navigation.search = "";
    render(createElement(InvestigationWorkspaceNav, { projectId }));

    const collection = screen.getByRole("button", { name: "01 — Collection & Validation" });
    expect(collection).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Source Library" })).toHaveAttribute("aria-current", "page");

    collection.focus();
    await user.keyboard("{Enter}");
    expect(collection).toHaveFocus();
    expect(collection).toHaveAttribute("aria-expanded", "false");
    expect(collection).toHaveAccessibleDescription(/Current: Source Library/);
    expect(screen.queryByRole("link", { name: "Source Library" })).not.toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(collection).toHaveAttribute("aria-expanded", "true");
    const claims = screen.getByRole("link", { name: "Source Claims & Validation" });
    expect(claims).toHaveAttribute("href", root + "/source-claims");
    const navigate = vi.fn((event: Event) => event.preventDefault());
    claims.addEventListener("click", navigate);
    await user.click(claims);
    expect(navigate).toHaveBeenCalledOnce();
  });

  it("opens the new route’s department after a link or deep-link transition", async () => {
    const user = userEvent.setup();
    navigation.pathname = root;
    navigation.search = "?tab=overview";
    const view = render(createElement(InvestigationWorkspaceNav, { projectId }));

    const analysis = screen.getByRole("button", { name: "02 — Analysis & Reporting" });
    await user.click(analysis);
    expect(analysis).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Intelligence Direction" }))
      .toHaveAccessibleDescription(/Current: Investigation Overview/);

    const graph = root + "?tab=graph";
    navigation.search = "?tab=graph";
    view.rerender(createElement(InvestigationWorkspaceNav, { projectId }));

    expect(screen.getByRole("button", { name: "Shared Workspace" })).toHaveAttribute("aria-expanded", "true");
    const graphLink = screen.getByRole("link", { name: "Knowledge Graph" });
    expect(graphLink).toHaveAttribute("href", graph);
    expect(graphLink).toHaveAttribute("aria-current", "page");
  });
});
