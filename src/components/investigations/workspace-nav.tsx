"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type InvestigationNavItem = {
  key: string;
  label: string;
  href: string;
  tab?: string;
  pathPrefix?: string;
  rootWithoutTab?: boolean;
};

export type InvestigationNavGroup = {
  label: string;
  items: InvestigationNavItem[];
};

export function getInvestigationNavGroups(projectId: string): InvestigationNavGroup[] {
  const root = `/projects/${projectId}`;
  const tab = (key: string, label: string, tabName = key, pathPrefix?: string): InvestigationNavItem => ({
    key,
    label,
    href: `${root}?tab=${tabName}`,
    tab: tabName,
    pathPrefix,
  });

  return [
    {
      label: "Production",
      items: [
        { key: "direction", label: "Direction", href: root, rootWithoutTab: true },
        { key: "collection", label: "Collection", href: `${root}/collection`, pathPrefix: `${root}/collection` },
      ],
    },
    {
      label: "Research artefacts",
      items: [
        { key: "evidence", label: "Evidence", href: `${root}?tab=evidence&view=evidence`, tab: "evidence" },
        { key: "sources", label: "Sources", href: `${root}/sources`, pathPrefix: `${root}/sources` },
        { key: "intel-profile", label: "Intel Profile", href: `${root}/intel-profile`, pathPrefix: `${root}/intel-profile` },
      ],
    },
    {
      label: "Workspace",
      items: [
        tab("overview", "Overview"),
        { key: "notes", label: "Notes", href: `${root}/notes`, pathPrefix: `${root}/notes` },
        tab("timeline", "Timeline", "timeline", `${root}/timeline`),
        tab("tasks", "Tasks"),
        tab("actors", "Actors", "actors", `${root}/actors`),
        tab("campaigns", "Campaigns", "campaigns", `${root}/campaigns`),
        tab("indicators", "IOC Workbench", "indicators", `${root}/indicators`),
        tab("malware", "Malware", "malware", `${root}/malware`),
        tab("cves", "CVEs", "cves", `${root}/cves`),
        tab("mitre", "MITRE", "mitre", `${root}/mitre`),
        { key: "reports", label: "Reports", href: `${root}/reports`, pathPrefix: `${root}/reports` },
        tab("infrastructure", "Infrastructure", "infrastructure", `${root}/infrastructure`),
        tab("graph", "Graph"),
        tab("ai", "AI"),
      ],
    },
    {
      label: "Analysis",
      items: [
        { key: "attribution", label: "Attribution", href: `${root}/attribution`, pathPrefix: `${root}/attribution` },
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

  if (item.tab && pathname === item.href.split("?")[0] && currentTab === item.tab) {
    return true;
  }

  if (item.pathPrefix) {
    return pathname === item.pathPrefix || pathname.startsWith(`${item.pathPrefix}/`);
  }

  return false;
}

export function InvestigationWorkspaceNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab");
  const groups = getInvestigationNavGroups(projectId);

  return (
    <nav
      className="mx-auto mb-4 flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 rounded border border-stone-800/80 bg-black/10 px-3 py-2 text-xs"
      aria-label="Investigation workspace navigation"
    >
      {groups.map((group) => (
        <div key={group.label} className="flex flex-wrap items-center gap-1.5">
          <span className="citem-label mr-1 whitespace-nowrap">{group.label}</span>
          {group.items.map((item) => {
            const active = isInvestigationNavItemActive(item, pathname, currentTab);
            return (
              <Link
                key={item.key}
                className={`rounded px-3 py-1.5 ${
                  active
                    ? "bg-stone-800 text-amber-300"
                    : "text-stone-400 hover:bg-stone-900 hover:text-amber-300"
                }`}
                href={item.href}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}