"use client";

import { useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "citem.sidebar.collapsed";
const CHANGE_EVENT = "citem:sidebar-preference-change";

function readCollapsedPreference() {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return document.documentElement.dataset.citemSidebar === "collapsed";
  }
}

function subscribeToPreference(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
  };
}

function persistCollapsedPreference(collapsed: boolean) {
  document.documentElement.dataset.citemSidebar = collapsed ? "collapsed" : "expanded";

  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "true" : "false");
  } catch {
    // The toggle still works for the current page when persistence is unavailable.
  }

  window.dispatchEvent(new Event(CHANGE_EVENT));
}

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
  const collapsed = useSyncExternalStore(
    subscribeToPreference,
    readCollapsedPreference,
    () => false,
  );

  useEffect(() => {
    document.documentElement.dataset.citemSidebar = collapsed ? "collapsed" : "expanded";
  }, [collapsed]);

  const label = collapsed ? "Show sidebar" : "Hide sidebar";

  return (
    <button
      type="button"
      className="citem-sidebar-toggle"
      aria-label={label}
      aria-controls="citem-primary-sidebar"
      aria-expanded={!collapsed}
      title={label}
      onClick={() => persistCollapsedPreference(!collapsed)}
    >
      <SidebarIcon collapsed={collapsed} />
    </button>
  );
}
