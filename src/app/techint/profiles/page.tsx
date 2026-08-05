import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { listStandaloneIntelProfiles } from "@/lib/techint/queries";
import type { IntelProfile } from "@/lib/techint/schema";

type ProfileRow = IntelProfile & { intel_profile_items?: Array<{ count: number }> };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const { data, error } = await listStandaloneIntelProfiles(supabase);
  let rows = (data ?? []) as ProfileRow[];

  if (sp.q) rows = rows.filter((row) => row.name.toLowerCase().includes(sp.q!.toLowerCase()));
  if (sp.priority) rows = rows.filter((row) => row.priority === sp.priority);
  if (sp.status) rows = rows.filter((row) => row.status === sp.status);

  return (
    <section className="space-y-5">
      <header className="citem-page-header">
        <div>
          <p className="citem-eyebrow">TechINT / Profiles</p>
          <h1 className="citem-title">Standalone profiles</h1>
          <p className="citem-subtitle">
            Independent TechINT profile definitions. Investigation-linked INT Profiles are excluded from this list.
          </p>
        </div>
        <Link className="citem-button" href="/techint/profiles/new">
          Create profile
        </Link>
      </header>
      <form className="citem-filter-panel panel-corners grid gap-3 md:grid-cols-4">
        <input className="field" name="q" placeholder="Search name" defaultValue={sp.q} />
        <select className="field" name="priority" defaultValue={sp.priority ?? ""}>
          <option value="">All priorities</option>
          <option>LOW</option>
          <option>MEDIUM</option>
          <option>HIGH</option>
          <option>CRITICAL</option>
        </select>
        <select className="field" name="status" defaultValue={sp.status ?? ""}>
          <option value="">All statuses</option>
          <option>ACTIVE</option>
          <option>PAUSED</option>
          <option>ARCHIVED</option>
        </select>
        <button className="citem-button-ghost">Apply filters</button>
      </form>
      {error ? (
        <div className="card text-red-300">Unable to load standalone TechINT profiles. Apply migration 031.</div>
      ) : !rows.length ? (
        <div className="citem-empty panel-corners">
          <h2 className="citem-section-title">No standalone TechINT profiles</h2>
          <p className="mt-2 text-sm text-stone-500">
            Create a standalone profile when you want a technical monitoring definition independent of any Investigation.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <Link className="card block hover:border-amber-600" key={row.id} href={`/techint/profiles/${row.id}`}>
              <h2 className="citem-section-title">{row.name}</h2>
              <p className="mt-1 text-sm text-stone-500">
                {row.description || row.intelligence_question || "No description."}
              </p>
              <p className="mt-3 text-xs text-stone-400">
                {row.priority} · {row.status} · {row.intel_profile_items?.[0]?.count ?? 0} items · Updated{" "}
                {new Date(row.updated_at).toLocaleString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
