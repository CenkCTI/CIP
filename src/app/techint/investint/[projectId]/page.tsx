import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { listIntelProfileSignalFeed } from "@/lib/techint/intelligence/queries";
import { getInvestigationIntelProfile } from "@/lib/techint/queries";
import type { IntelProfileItem } from "@/lib/techint/schema";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase } = await requireUser();
  const [{ data: profile }, { data: items }] = await Promise.all([
    getInvestigationIntelProfile(supabase, projectId),
    supabase.from("intel_profile_items").select("*").eq("source_project_id", projectId),
  ]);

  if (!profile) notFound();
  const typedItems = (items ?? []) as IntelProfileItem[];
  const active = typedItems.filter((item) => item.state === "ACTIVE").length;
  const pending = typedItems.filter((item) => item.state === "PENDING").length;
  const feed = await listIntelProfileSignalFeed(supabase, profile.id, { page: 0, pageSize: 10 });
  const critical = feed.items.filter((match) => match.globalPriority?.priority === "CRITICAL").length;
  const high = feed.items.filter((match) => match.relevance === "HIGH").length;

  return (
    <section className="space-y-5">
      <header className="citem-page-header">
        <div>
          <p className="citem-eyebrow">TechINT / InvestINT summary</p>
          <h1 className="citem-title">{profile.projects?.name ?? profile.name}</h1>
          <p className="citem-subtitle">
            Investigation-linked technical intelligence feed with deterministic relevance and Global Priority context.
          </p>
        </div>
      </header>
      <div className="card">
        <h2 className="citem-section-title">{profile.name}</h2>
        <p className="mt-2 text-sm text-stone-400">
          Status {profile.status} · Priority {profile.priority} · Active items {active} · Pending suggestions {pending}
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Metric label="Active matches" value={feed.total} />
          <Metric label="Critical on first page" value={critical} />
          <Metric label="High relevance" value={high} />
        </div>
        <div className="mt-4 flex gap-2">
          <Link className="citem-button-ghost" href={`/projects/${projectId}`}>
            Open Investigation
          </Link>
          <Link className="citem-button" href={`/projects/${projectId}/intel-profile`}>
            Open Investigation Intel Profile
          </Link>
        </div>
      </div>

      {feed.items.length > 0 && (
        <div className="card">
          <p className="citem-eyebrow">Recent matched signals</p>
          <div className="mt-3 space-y-2">
            {feed.items.slice(0, 5).map((match) => (
              <div key={match.id} className="rounded border border-stone-800 bg-stone-950/20 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-stone-200">{match.signal.title}</p>
                  <span className="text-xs text-stone-500">
                    {match.globalPriority?.priority ?? "UNRANKED"} global · {match.relevance} relevance · {match.match_quality}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-stone-800 bg-stone-950/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.13em] text-stone-600">{label}</p>
      <p className="mt-1 text-lg font-semibold text-stone-200">{value}</p>
    </div>
  );
}
