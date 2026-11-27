"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useId, useState } from "react";

export type InvestigationNavItem = {
  key: string;
  label: string;
  href: string;
  tab?: string;
  pathPrefix?: string;
  rootWithoutTab?: boolean;
};

export type InvestigationNavGroup = {
  key: string;
  label: string;
  description: string;
  items: InvestigationNavItem[];
};

export function getInvestigationNavGroups(projectId: string): InvestigationNavGroup[] {
  const root = `/projects/${projectId}`;
  const tab = (key: string, label: string, hasDetails = false): InvestigationNavItem => ({
    key,
    label,
    href: `${root}?tab=${key}`,
    tab: key,
    pathPrefix: hasDetails ? `${root}/${key}` : undefined,
  });
  const page = (key: string, label: string, legacyTab?: string): InvestigationNavItem => {
    const href = `${root}/${key}`;
    return { key, label, href, pathPrefix: href, tab: legacyTab };
  };

  return [
    {
      key: "direction",
      label: "Intelligence Direction",
      description: "Define intelligence requirements, priorities, scope and information gaps.",
      items: [
        { key: "direction", label: "Direction", href: root, rootWithoutTab: true },
        tab("overview", "Investigation Overview"),
        page("intel-profile", "Intelligence Profile"),
      ],
    },
    {
      key: "collection",
      label: "01 — Collection & Validation",
      description: "Collect, process and evaluate information required for intelligence production.",
      items: [
        page("collection", "Collection Planning"),
        page("sources", "Source Library"),
        page("source-claims", "Source Claims & Validation"),
      ],
    },
    {
      key: "analysis",
      label: "02 — Analysis & Reporting",
      description: "Analyze evidence, evaluate explanations and produce intelligence products.",
      items: [
        page("canvas", "Analysis Canvas"),
        page("fusion", "Fusion Workspace"),
        tab("mitre", "MITRE ATT&CK", true),
        tab("actors", "Threat Actors", true),
        tab("campaigns", "Campaigns", true),
        tab("malware", "Malware", true),
        tab("cves", "CVEs", true),
        tab("infrastructure", "Infrastructure Analysis", true),
        page("attribution", "Attribution"),
        page("reports", "Intelligence Products", "reports"),
      ],
    },
    {
      key: "shared",
      label: "Shared Workspace",
      description: "Access shared evidence, indicators, events and analytical resources.",
      items: [
        { key: "evidence", label: "Evidence Library", href: `${root}?tab=evidence&view=evidence`, tab: "evidence" },
        tab("indicators", "IOC Workbench", true),
        tab("timeline", "Timeline", true),
        tab("graph", "Knowledge Graph"),
        page("notes", "Analyst Notes", "notes"),
        tab("tasks", "Tasks"),
        ...(process.env.NEXT_PUBLIC_CITEM_STAGE3_COPILOT_ENABLED === "true"
          ? [tab("ai", "AI Copilot")]
          : []),
      ],
    },
  ];
}

export function isInvestigationNavItemActive(
  item: InvestigationNavItem,
  pathname: string,
  currentTab: string | null,
) {
  if (item.rootWithoutTab) {
    return pathname === item.href && currentTab === null;
  }

  const campaignAttribution = pathname.match(/^(\/projects\/[^/]+)\/campaigns\/[^/]+\/attribution(?:\/|$)/);
  if (campaignAttribution && (item.key === "attribution" || item.key === "campaigns")) {
    return item.pathPrefix === `${campaignAttribution[1]}/attribution`;
  }

  if (item.tab && currentTab === item.tab) {
    // Notes and reports also have legacy query-backed views at the Investigation root.
    const root = item.pathPrefix === item.href
      ? item.href.slice(0, item.href.lastIndexOf("/"))
      : item.href.split("?")[0];
    if (pathname === root) return true;
  }

  return Boolean(
    item.pathPrefix &&
    (pathname === item.pathPrefix || pathname.startsWith(`${item.pathPrefix}/`)),
  );
}

function DepartmentNavigation({
  groups,
  pathname,
  currentTab,
}: {
  groups: InvestigationNavGroup[];
  pathname: string;
  currentTab: string | null;
}) {
  const navId = useId();
  const activeGroup = groups.find((group) =>
    group.items.some((item) => isInvestigationNavItemActive(item, pathname, currentTab)),
  );
  const activeItem = activeGroup?.items.find((item) =>
    isInvestigationNavItemActive(item, pathname, currentTab),
  );
  const [openGroup, setOpenGroup] = useState(activeGroup?.key);

  return (
    <nav
      className="mx-auto mb-4 max-w-6xl rounded border border-stone-800/80 bg-black/10 p-2 text-xs"
      aria-label="Investigation workspace navigation"
    >
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {groups.map((group) => {
          const id = `${navId}-${group.key}`;
          const expanded = openGroup === group.key;
          const current = activeGroup?.key === group.key;
          const currentLabel = current && !expanded ? activeItem?.label : undefined;

          return (
            <button
              key={group.key}
              type="button"
              className={`flex min-w-0 flex-col rounded border border-l-2 px-2.5 py-2 text-left hover:bg-stone-900 sm:px-3 ${
                current
                  ? "border-stone-800 border-l-amber-500/70 bg-stone-900/60"
                  : "border-stone-800/80 border-l-stone-700/60"
              }`}
              aria-labelledby={`${id}-heading`}
              aria-describedby={`${id}-description${currentLabel ? ` ${id}-current` : ""}`}
              aria-expanded={expanded}
              aria-controls={`${id}-links`}
              onClick={() => setOpenGroup(expanded ? undefined : group.key)}
            >
              <span className="flex items-start justify-between gap-2">
                <span id={`${id}-heading`} className="font-semibold text-stone-100">{group.label}</span>
                <span aria-hidden="true" className="shrink-0 font-mono text-amber-400">{expanded ? "−" : "+"}</span>
              </span>
              <span id={`${id}-description`} className="mt-1 block leading-relaxed text-stone-400">
                {group.description}
              </span>
              {currentLabel && (
                <span id={`${id}-current`} className="mt-1 block font-medium text-amber-300">
                  Current: {currentLabel}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {groups.map((group) => {
        const id = `${navId}-${group.key}`;
        return (
          <div key={group.key} id={`${id}-links`} hidden={openGroup !== group.key}>
            <ul aria-labelledby={`${id}-heading`} className="mt-2 flex flex-wrap items-center gap-1 border-t border-stone-800/80 pt-2">
              {group.items.map((item) => {
                const active = item.key === activeItem?.key;
                return (
                  <li key={item.key} className="min-w-0 max-w-full">
                    <Link
                      className={`block rounded px-3 py-2 ${
                        active
                          ? "bg-stone-800 font-semibold text-amber-300 underline underline-offset-4"
                          : "text-stone-300 hover:bg-stone-900 hover:text-amber-300"
                      }`}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function InvestigationWorkspaceNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const currentTab = useSearchParams().get("tab");

  return (
    <DepartmentNavigation
      key={JSON.stringify([pathname, currentTab])}
      groups={getInvestigationNavGroups(projectId)}
      pathname={pathname}
      currentTab={currentTab}
    />
  );
}
