import Link from "next/link";

import { signOut } from "@/app/actions";
import { CitemLogo } from "@/components/citem-logo";
import { ShellNav } from "@/components/shell-nav";

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
          <CitemLogo priority />
        </Link>

        <div className="citem-sidebar-section-label">
          <p className="citem-label">Intelligence operations</p>
        </div>
        <ShellNav />

        <div className="citem-sidebar-footer">
          <div className="citem-security-panel panel-corners">
            <div className="citem-status-row">
              <span><span className="citem-status-dot" data-tone="secure" />Operational status</span>
              <span className="citem-badge" data-tone="secure">Secure</span>
            </div>
            <div className="citem-control-bars mt-3" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p className="mt-3 text-[11px] leading-5 text-stone-500">
              Private workspace · RLS enforced · analyst-controlled AI
            </p>
          </div>
        </div>
      </aside>

      <div className="citem-main">
        <header className="citem-topbar">
          <div className="citem-topbar-copy">
            <p className="citem-eyebrow">Cyber threat intelligence</p>
            <p className="citem-topbar-title">Collection · Analysis · Operational direction</p>
          </div>

          <div className="citem-topbar-actions">
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
