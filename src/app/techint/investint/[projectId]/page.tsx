import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
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

  return (
    <section className="space-y-5">
      <header className="citem-page-header">
        <div>
          <p className="citem-eyebrow">TechINT / InvestINT summary</p>
          <h1 className="citem-title">{profile.projects?.name ?? profile.name}</h1>
          <p className="citem-subtitle">
            This summary shows profile definition and status only. Technical matches will be introduced later.
          </p>
        </div>
      </header>
      <div className="card">
        <h2 className="citem-section-title">{profile.name}</h2>
        <p className="mt-2 text-sm text-stone-400">
          Status {profile.status} · Priority {profile.priority} · Active items {active} · Pending suggestions {pending}
        </p>
        <div className="mt-4 flex gap-2">
          <Link className="citem-button-ghost" href={`/projects/${projectId}`}>
            Open Investigation
          </Link>
          <Link className="citem-button" href={`/projects/${projectId}/intel-profile`}>
            Open Investigation Intel Profile
          </Link>
        </div>
      </div>
    </section>
  );
}
