import Link from "next/link";

import { signOut } from "@/app/actions";
import { ShellNav } from "@/components/shell-nav";

function CitemMark() {
  return (
    <svg viewBox="0 0 48 48" width="30" height="30" fill="none" aria-hidden="true">
      <path d="M10 12 20 7l4 8 4-8 10 5-4 21-10 8-10-8-4-21Z" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="18" cy="22" r="4" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="30" cy="22" r="4" stroke="currentColor" strokeWidth="1.4" />
      <path d="m24 24-3 5 3 2 3-2-3-5Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M14 13 8 7m26 6 6-6" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function AppShell({
  children,
  email,
}: {
  children: React.ReactNode;
  email?: string;
}) {
  return (
    <div className="citem-shell">
      <aside className="citem-sidebar">
        <Link href="/dashboard" className="citem-brand" aria-label="CİTEM dashboard">
          <span className="citem-brand-mark text-amber-400"><CitemMark /></span>
          <span>
            <span className="citem-brand-kicker block">BAYKUSH / CTI</span>
            <span className="citem-wordmark block">CİTEM</span>
          </span>
        </Link>

        <div className="px-4 pt-5">
          <p className="citem-label">Intelligence operations</p>
        </div>
        <ShellNav />

        <div className="citem-sidebar-footer">
          <div className="citem-security-panel panel-corners">
            <div className="citem-status-row">
              <span><span className="citem-status-dot" />Operational status</span>
              <span className="text-amber-300">SECURE</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1" aria-hidden="true">
              <span className="h-1 bg-amber-500/70" />
              <span className="h-1 bg-amber-500/35" />
              <span className="h-1 bg-amber-500/15" />
            </div>
            <p className="mt-3 text-[11px] leading-5 text-stone-500">
              Private workspace · RLS enforced · analyst-controlled AI
            </p>
          </div>
        </div>
      </aside>

      <div className="citem-main">
        <header className="citem-topbar">
          <div>
            <p className="citem-eyebrow">Cyber threat intelligence</p>
            <p className="citem-topbar-title">Collection · Analysis · Operational direction</p>
          </div>

          <div className="flex items-center gap-3">
            <span className="citem-user" title={email}>{email}</span>
            <form action={signOut}>
              <button className="citem-button-ghost" type="submit">Sign out</button>
            </form>
          </div>
        </header>

        <main className="citem-content">{children}</main>
      </div>
    </div>
  );
}
