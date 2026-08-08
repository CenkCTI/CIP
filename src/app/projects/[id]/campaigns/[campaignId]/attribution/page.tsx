import { notFound } from "next/navigation";

import { AttributionWorkbench } from "@/components/attribution/attribution-workbench";
import { requireUser } from "@/lib/auth";
import { requiredUuidSchema } from "@/lib/workspace/schema";

export default async function AttributionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; campaignId: string }>;
  searchParams: Promise<{ historical?: string }>;
}) {
  const { id, campaignId } = await params;
  const historical = (await searchParams).historical === "1";

  if (
    !requiredUuidSchema.safeParse(id).success ||
    !requiredUuidSchema.safeParse(campaignId).success
  ) {
    notFound();
  }

  const { supabase, user } = await requireUser();
  const [{ data: project }, { data: campaign }] = await Promise.all([
    supabase.from("projects").select("id,owner_id").eq("id", id).maybeSingle(),
    supabase
      .from("campaigns")
      .select("id")
      .eq("project_id", id)
      .eq("id", campaignId)
      .maybeSingle(),
  ]);
  if (!project || project.owner_id !== user.id || !campaign) notFound();

  return (
    <main className="mx-auto max-w-6xl">
      <AttributionWorkbench
        projectId={id}
        campaignId={campaignId}
        historical={historical}
        baseHref={`/projects/${id}/campaigns/${campaignId}/attribution`}
        showCampaignBackLink
      />
    </main>
  );
}
