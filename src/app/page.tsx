import Link from "next/link";

import { CitemLogo } from "@/components/citem-logo";
import { IntelligenceGlobe } from "@/components/intelligence-globe";

export default function Home() {
  return (
    <main className="citem-landing">
      <div className="citem-landing-inner">
        <nav className="citem-landing-nav" aria-label="Public navigation">
          <Link href="/" aria-label="CİTEM home">
            <CitemLogo priority />
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link className="citem-button-ghost" href="/demo">Public demo</Link>
            <Link className="citem-button-ghost" href="/auth/sign-in">Sign in</Link>
          </div>
        </nav>

        <section className="citem-landing-hero">
          <div>
            <p className="citem-eyebrow">Cyber Intelligence Threat Evaluation and Monitoring</p>
            <h1 className="citem-landing-title mt-6">
              Detect. <strong>Assess. Direct.</strong>
            </h1>
            <p className="mt-8 max-w-2xl text-base leading-8 text-stone-400 md:text-lg">
              CİTEM gives cyber intelligence teams a structured environment to collect evidence, analyze threat activity, and turn assessments into coordinated action.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link className="citem-button" href="/demo">Explore synthetic demo</Link>
              <Link className="citem-button-ghost" href="/auth/sign-up">Create secure workspace</Link>
            </div>
            <div className="citem-landing-stages mt-10">
              {[
                ["01", "Collect"],
                ["02", "Enrich"],
                ["03", "Analyze"],
                ["04", "Direct"],
              ].map(([index, label]) => (
                <div className="citem-landing-stage" key={index}>
                  <p className="citem-label">{index}</p>
                  <p className="mt-2 text-sm text-stone-300">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <IntelligenceGlobe />
        </section>

        <footer className="citem-landing-footer">
          <span>BAYKUSH Intelligence Ecosystem</span>
          <span><span className="citem-status-dot" data-tone="secure" />Operational status: secure</span>
        </footer>
      </div>
    </main>
  );
}
