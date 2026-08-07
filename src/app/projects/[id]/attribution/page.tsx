import Link from "next/link";
import { notFound } from "next/navigation";

import { AttributionWorkbench } from "@/components/attribution/attribution-workbench";
import { requireUser } from "@/lib/auth";
import { requiredUuidSchema } from "@/lib/workspace/schema";

type R = Record<string, unknown>;
const s = (value: unknown) => String(value ?? "");

export default async function InvestigationAttributionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ campaign?: string; historical?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!requiredUuidSchema.safeParse(id).success) notFound();

  const { supabase, user } = await requireUser();
  const [{ data: project }, { data: campaigns }] = await Promise.all([
    supabase
      .from("projects")
      .select("id,name,owner_id")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("campaigns")
      .select("id,name")
      .eq("project_id", id)
      .order("name"),
  ]);

  if (!project || project.owner_id !== user.id) notFound();

  const campaignRows = (campaigns ?? []) as R[];
  if (!campaignRows.length) {
    return (
      <main className="mx-auto max-w-6xl space-y-6">
        <header>
          <p className="citem-label">Investigation analysis</p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-100">
            Attribution Workbench
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-400">
            Attribution hypotheses belong to the Investigation analysis process,
            not to a Threat Actor profile. Create a Campaign first so competing
            hypotheses can be evaluated against a bounded operational context.
          </p>
        </header>
        <section className="card">
          <h2 className="text-xl font-semibold text-stone-100">
            No Campaigns available
          </h2>
          <p className="mt-2 text-sm text-stone-400">
            Attribution remains Campaign-scoped in the data model to preserve
            evidence and judgement integrity, while the workbench is accessed at
            Investigation level.
          </p>
          <Link
            className="mt-4 inline-block text-cyan-200"
            href={`/projects/${id}?tab=campaigns`}
          >
            Open Campaigns →
          </Link>
        </section>
      </main>
    );
  }

  const selectedCampaign =
    campaignRows.find((campaign) => s(campaign.id) === sp.campaign) ??
    campaignRows[0];
  const selectedCampaignId = s(selectedCampaign.id);
  const historical = sp.historical === "1";

  const [{ data: assessments }, { data: hypotheses }] = await Promise.all([
    supabase
      .from("campaign_attribution_assessments")
      .select("campaign_id,assessment_status,conclusion_type,confidence,preferred_hypothesis_id")
      .eq("project_id", id),
    supabase
      .from("attribution_hypotheses")
      .select("id,campaign_id,status,archived_at")
      .eq("project_id", id),
  ]);

  const assessmentRows = (assessments ?? []) as R[];
  const hypothesisRows = (hypotheses ?? []) as R[];

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="citem-label">Investigation analysis</p>
        <h1 className="mt-2 text-3xl font-semibold text-stone-100">
          Attribution Workbench
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-400">
          Develop and compare competing attribution hypotheses from the
          Investigation level. Threat Actor profiles remain reference entities;
          the active judgement stays anchored to the Campaign and its evidence.
        </p>
      </header>

      <section className="card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="citem-label">Campaign context</p>
            <h2 className="mt-2 text-xl font-semibold text-stone-100">
              Select analytical frame
            </h2>
          </div>
          <Link className="text-sm text-cyan-300" href={`/projects/${id}?tab=campaigns`}>
            Manage Campaigns →
          </Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {campaignRows.map((campaign) => {
            const campaignId = s(campaign.id);
            const assessment = assessmentRows.find(
              (row) => s(row.campaign_id) === campaignId,
            );
            const activeHypotheses = hypothesisRows.filter(
              (row) =>
                s(row.campaign_id) === campaignId &&
                !row.archived_at &&
                row.status !== "REJECTED",
            ).length;
            const active = campaignId === selectedCampaignId;
            return (
              <Link
                key={campaignId}
                href={`/projects/${id}/attribution?campaign=${campaignId}`}
                className={`rounded border p-4 transition ${
                  active
                    ? "border-cyan-700 bg-cyan-950/20"
                    : "border-stone-800 bg-black/10 hover:border-stone-700"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <strong className="text-stone-100">{s(campaign.name)}</strong>
                  <span className="citem-badge">
                    {s(assessment?.assessment_status) || "DRAFT"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-stone-500">
                  {s(assessment?.conclusion_type) || "UNRESOLVED"} ·{" "}
                  {s(assessment?.confidence) || "NOT ASSESSED"}
                </p>
                <p className="mt-2 text-xs text-stone-400">
                  {activeHypotheses} active hypotheses
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <AttributionWorkbench
        projectId={id}
        campaignId={selectedCampaignId}
        historical={historical}
        baseHref={`/projects/${id}/attribution?campaign=${selectedCampaignId}`}
      />
    </main>
  );
}
