import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { listInvestigationIntelProfiles } from "@/lib/techint/queries";
import type { IntelProfile } from "@/lib/techint/schema";

type InvestIntRow = IntelProfile & {
  projects?: { name: string } | null;
  intel_profile_items?: Array<{ count: number }>;
};

export default async function Page() {
  const { supabase } = await requireUser();
  const { data, error } = await listInvestigationIntelProfiles(supabase);
  const rows = (data ?? []) as InvestIntRow[];

  return (
    <section className="space-y-5">
      <header className="citem-page-header">
        <div>
          <p className="citem-eyebrow">TechINT / InvestINT</p>
          <h1 className="citem-title">Investigation-linked INT Profiles</h1>
          <p className="citem-subtitle">
            Central index of INT Profiles created inside existing Investigations. Standalone profiles are excluded.
          </p>
        </div>
      </header>
      {error ? (
        <div className="card text-red-300">Unable to load InvestINT. Apply migration 031.</div>
      ) : !rows.length ? (
        <div className="citem-empty panel-corners">
          <h2 className="citem-section-title">No Investigation INT Profiles</h2>
          <p className="mt-2 text-sm text-stone-500">
            Open an Investigation and create its Intel Profile. Technical matches will be introduced in later phases.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <div className="card" key={row.id}>
              <h2 className="citem-section-title">{row.projects?.name ?? "Investigation"}</h2>
              <p className="mt-1 text-sm text-stone-400">
                {row.name} · {row.status} · {row.priority} · Updated {new Date(row.updated_at).toLocaleString()}
              </p>
              <p className="mt-2 text-xs text-stone-500">
                {row.intel_profile_items?.[0]?.count ?? 0} profile items. No match counts are shown in Phase 2.3A.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link className="citem-button-ghost" href={`/techint/investint/${row.project_id}`}>
                  Open profile summary
                </Link>
                <Link className="citem-button-ghost" href={`/projects/${row.project_id}`}>
                  Open Investigation
                </Link>
                <Link className="citem-button" href={`/projects/${row.project_id}/intel-profile`}>
                  Open Investigation Intel Profile
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
