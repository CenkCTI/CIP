import Link from "next/link";

function LandingMark() {
  return (
    <svg viewBox="0 0 72 72" width="68" height="68" fill="none" aria-hidden="true">
      <path d="M14 18 29 10l7 12 7-12 15 8-6 32-16 12-16-12-6-32Z" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="27" cy="33" r="6" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="45" cy="33" r="6" stroke="currentColor" strokeWidth="1.25" />
      <path d="m36 36-4 7 4 3 4-3-4-7Z" stroke="currentColor" strokeWidth="1.15" />
      <path d="M20 20 10 9m42 11L62 9" stroke="currentColor" strokeWidth="1.15" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="citem-landing">
      <div className="citem-landing-inner">
        <nav className="citem-landing-nav" aria-label="Public navigation">
          <Link href="/" className="flex items-center gap-4">
            <span className="citem-wordmark">BAYKUSH</span>
            <span className="h-5 w-px bg-amber-900/60" aria-hidden="true" />
            <span className="citem-brand-kicker">CİTEM</span>
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link className="citem-button-ghost" href="/demo">Public demo</Link>
            <Link className="citem-button-ghost" href="/auth/sign-in">Sign in</Link>
          </div>
        </nav>

        <section className="citem-landing-hero">
          <div>
            <p className="citem-eyebrow">Cyber threat intelligence environment</p>
            <h1 className="citem-landing-title mt-6">
              See the signal. <strong>Direct the response.</strong>
            </h1>
            <p className="mt-8 max-w-2xl text-base leading-8 text-stone-400 md:text-lg">
              CİTEM is the operational cyber intelligence module of BAYKUSH: a secure workspace for collecting evidence, structuring threat activity, developing assessments, and producing decision-ready intelligence.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link className="citem-button" href="/demo">Explore synthetic demo</Link>
              <Link className="citem-button-ghost" href="/auth/sign-up">Create secure workspace</Link>
            </div>
            <div className="mt-10 grid max-w-2xl grid-cols-2 gap-px border border-amber-900/25 bg-amber-900/25 sm:grid-cols-4">
              {[
                ["01", "Collect"],
                ["02", "Enrich"],
                ["03", "Analyze"],
                ["04", "Direct"],
              ].map(([index, label]) => (
                <div className="bg-[#070807] p-4" key={index}>
                  <p className="citem-label">{index}</p>
                  <p className="mt-2 text-sm text-stone-300">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="citem-orbit" aria-label="CİTEM intelligence system motif">
            <span className="absolute left-[4%] top-[48%] h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_18px_rgba(240,165,47,.9)]" />
            <span className="absolute right-[14%] top-[17%] h-1.5 w-1.5 rounded-full bg-amber-500/80" />
            <span className="absolute bottom-[12%] right-[25%] h-1 w-1 rounded-full bg-amber-300" />
            <div className="citem-orbit-core">
              <span className="grid place-items-center text-amber-300">
                <LandingMark />
                <span className="mt-1 text-[10px]">CİTEM</span>
              </span>
            </div>
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-900/25 py-5 text-xs text-stone-600">
          <span>BAYKUSH Intelligence Ecosystem</span>
          <span><span className="citem-status-dot" />Operational status: secure</span>
        </footer>
      </div>
    </main>
  );
}
