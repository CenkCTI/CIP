"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type IconName = "dashboard" | "projects" | "findings";

const navigation: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/dashboard", label: "Operational picture", icon: "dashboard" },
  { href: "/projects", label: "Intelligence projects", icon: "projects" },
];

function NavIcon({ name }: { name: IconName }) {
  if (name === "dashboard") {
    return (
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true">
        <path d="M4 4h6v6H4V4Zm10 0h6v10h-6V4ZM4 14h6v6H4v-6Zm10 4h6v2h-6v-2Z" stroke="currentColor" strokeWidth="1.35" />
      </svg>
    );
  }

  if (name === "projects") {
    return (
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true">
        <path d="M4 7.5h6l1.6 2H20v9.25A1.25 1.25 0 0 1 18.75 20H5.25A1.25 1.25 0 0 1 4 18.75V7.5Z" stroke="currentColor" strokeWidth="1.35" />
        <path d="M4 10h16" stroke="currentColor" strokeWidth="1.35" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.35" />
      <path d="m12 8 .9 2.1L15 11l-2.1.9L12 14l-.9-2.1L9 11l2.1-.9L12 8Z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function ShellNav() {
  const pathname = usePathname();

  return (
    <nav className="citem-nav" aria-label="Primary navigation">
      {navigation.map((item) => {
        const active =
          pathname === item.href ||
          (item.href === "/projects" && pathname.startsWith("/projects/"));

        return (
          <Link
            key={item.href}
            href={item.href}
            className="citem-nav-link"
            data-active={active}
            aria-current={active ? "page" : undefined}
          >
            <span className="citem-nav-icon"><NavIcon name={item.icon} /></span>
            <span>{item.label}</span>
          </Link>
        );
      })}

      <span className="citem-nav-link citem-nav-disabled" aria-disabled="true">
        <span className="citem-nav-icon"><NavIcon name="findings" /></span>
        <span>Strategic findings</span>
      </span>
    </nav>
  );
}
