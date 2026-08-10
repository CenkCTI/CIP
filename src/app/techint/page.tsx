import Link from "next/link";
import { EmptyTechInt } from "@/components/techint/nav";

export default function Page(){
  const cards=["Global Technical Picture","Global Critical","Vulnerability Watch","Malware & Campaigns","Technical Reports","Daily Technical Brief"];
  return <section className="space-y-5">
    <header className="citem-page-header">
      <div>
        <p className="citem-eyebrow">CİTEM / TechINT / Global View</p>
        <h1 className="citem-title">Global View</h1>
        <p className="citem-subtitle">Profile-independent technical intelligence overview. Phase 2.3D adds canonical entity normalization but does not populate rankings, matches, alerts, or analyst assessments.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link className="citem-button" href="/techint/entities">Entity normalization</Link>
        <Link className="citem-button-ghost" href="/techint/sources">Collection operations</Link>
      </div>
    </header>
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card panel-corners">
        <p className="citem-eyebrow">Phase 2.3C</p>
        <h2 className="citem-section-title mt-2">Technical source collection</h2>
        <p className="mt-2 text-sm text-stone-500">Manage fixed Technical Sources, manual synchronization, bounded schedules, and run history. External source-backed signals do not represent CİTEM&apos;s final analyst assessment.</p>
      </div>
      <div className="card panel-corners">
        <p className="citem-eyebrow">Phase 2.3D</p>
        <h2 className="citem-section-title mt-2">Taxonomy &amp; entity normalization</h2>
        <p className="mt-2 text-sm text-stone-500">Resolve immutable source assertions into owner-global canonical entities with deterministic identity or explicit confirmed aliases. Ambiguous names remain reviewable.</p>
      </div>
    </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{cards.map(c=><EmptyTechInt key={c} title={c} body="Not populated in Phase 2.3D. Matching, ranking, alerts, reports, and AI briefs remain later-phase work."/>)}</div>
  </section>
}
