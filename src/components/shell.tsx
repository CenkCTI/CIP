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
        <Link href="/dashboard" className="citem-brand gap-3" aria-label="CİTEM dashboard">
          <CitemLogo variant="compact" priority />
          <span className="citem-wordmark">CİTEM</span>
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
          <p className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[1.08rem] font-semibold tracking-[0.72em] text-[#c9963e] drop-shadow-[0_0_7px_rgba(198,150,62,0.26)] sm:text-[1.2rem] md:text-[1.34rem] lg:text-[1.48rem] max-[460px]:relative max-[460px]:left-auto max-[460px]:mx-auto max-[460px]:translate-x-0 max-[460px]:text-[0.9rem] max-[460px]:tracking-[0.46em] max-[460px]:drop-shadow-[0_0_5px_rgba(198,150,62,0.2)]">
            B A Y K U S H
          </p>

          <div className="citem-topbar-actions ml-auto max-[460px]:ml-0">
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
