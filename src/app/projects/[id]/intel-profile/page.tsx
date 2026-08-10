import { createInvestigationIntelProfile } from "@/app/techint/actions";
import { IntelProfileDetail } from "@/components/techint/profile-detail";
import { IntelProfileForm } from "@/components/techint/profile-form";
import { requireUser } from "@/lib/auth";
import { listIntelProfileSignalFeed } from "@/lib/techint/intelligence/queries";
import { getInvestigationIntelProfile, listIntelProfileAudit, listIntelProfileItems } from "@/lib/techint/queries";

function pageNumber(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw ?? "0");
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ matchPage?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { supabase } = await requireUser();
  const matchPage = pageNumber(query.matchPage);
  const [{ data: project }, { data: profile }] = await Promise.all([
    supabase.from("projects").select("id,name").eq("id", id).single(),
    getInvestigationIntelProfile(supabase, id),
  ]);

  if (!project) return <div className="card text-red-300">Investigation not found.</div>;
  if (!profile) {
    return (
      <section className="space-y-5">
        <header className="citem-page-header">
          <div>
            <p className="citem-eyebrow">Investigation / Intel Profile</p>
            <h1 className="citem-title">Create Intel Profile for {project.name}</h1>
            <p className="citem-subtitle">Define the technical scope that CİTEM should continuously match for this Investigation.</p>
          </div>
        </header>
        <IntelProfileForm action={createInvestigationIntelProfile.bind(null, id)} />
      </section>
    );
  }

  const [{ data: items }, { data: audit }, feed] = await Promise.all([
    listIntelProfileItems(supabase, profile.id),
    listIntelProfileAudit(supabase, profile.id),
    listIntelProfileSignalFeed(supabase, profile.id, { page: matchPage, pageSize: 25 }),
  ]);

  return (
    <IntelProfileDetail
      profile={profile}
      items={items ?? []}
      audit={audit ?? []}
      investigation
      feed={{ items: feed.items, total: feed.total, page: feed.page, pageSize: feed.pageSize }}
      feedBaseHref={`/projects/${id}/intel-profile`}
    />
  );
}
