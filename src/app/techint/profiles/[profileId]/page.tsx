import { notFound } from "next/navigation";
import { IntelProfileDetail } from "@/components/techint/profile-detail";
import { requireUser } from "@/lib/auth";
import { listIntelProfileSignalFeed } from "@/lib/techint/intelligence/queries";
import { getIntelProfile, listIntelProfileAudit, listIntelProfileItems } from "@/lib/techint/queries";

function pageNumber(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw ?? "0");
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ profileId: string }>;
  searchParams: Promise<{ matchPage?: string | string[] }>;
}) {
  const [{ profileId }, query] = await Promise.all([params, searchParams]);
  const { supabase } = await requireUser();
  const matchPage = pageNumber(query.matchPage);
  const [{ data: profile }, { data: items }, { data: audit }, feed] = await Promise.all([
    getIntelProfile(supabase, profileId),
    listIntelProfileItems(supabase, profileId),
    listIntelProfileAudit(supabase, profileId),
    listIntelProfileSignalFeed(supabase, profileId, { page: matchPage, pageSize: 25 }),
  ]);
  if (!profile || profile.kind !== "STANDALONE") notFound();

  return (
    <IntelProfileDetail
      profile={profile}
      items={items ?? []}
      audit={audit ?? []}
      feed={{ items: feed.items, total: feed.total, page: feed.page, pageSize: feed.pageSize }}
      feedBaseHref={`/techint/profiles/${profileId}`}
    />
  );
}
