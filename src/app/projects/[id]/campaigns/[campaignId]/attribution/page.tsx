import { AttributionWorkbench } from "@/components/attribution/attribution-workbench";

export default async function AttributionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; campaignId: string }>;
  searchParams: Promise<{ historical?: string }>;
}) {
  const { id, campaignId } = await params;
  const historical = (await searchParams).historical === "1";

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
