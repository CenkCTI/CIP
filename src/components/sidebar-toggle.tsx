"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "citem.sidebar.collapsed";

function SidebarIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="16" rx="1.75" stroke="currentColor" strokeWidth="1.35" />
      <path d="M9 4.5v15" stroke="currentColor" strokeWidth="1.35" />
      <path
        d={collapsed ? "m13 9 3 3-3 3" : "m16 9-3 3 3 3"}
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SidebarToggle() {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let storedCollapsed = false;

    try {
      storedCollapsed = window.localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      // Storage can be unavailable in hardened/private browser contexts.
    }

    setCollapsed(storedCollapsed);
    document.documentElement.dataset.citemSidebar = storedCollapsed ? "collapsed" : "expanded";
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    document.documentElement.dataset.citemSidebar = collapsed ? "collapsed" : "expanded";

    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "true" : "false");
    } catch {
      // The toggle still works for the current page when persistence is unavailable.
    }
  }, [collapsed, hydrated]);

  const label = collapsed ? "Show sidebar" : "Hide sidebar";

  return (
    <button
      type="button"
      className="citem-sidebar-toggle"
      aria-label={label}
      aria-controls="citem-primary-sidebar"
      aria-expanded={!collapsed}
      title={label}
      onClick={() => setCollapsed((current) => !current)}
    >
      <SidebarIcon collapsed={collapsed} />
    </button>
  );
}
