import { notFound } from "next/navigation";

import { InvestigationAttributionMatrix } from "@/components/attribution/investigation-attribution-matrix";
import { requireUser } from "@/lib/auth";
import {
  evidencePresentation,
  hypothesisSubjectName,
} from "@/lib/attribution/presentation";
import { requiredUuidSchema } from "@/lib/workspace/schema";

type R = Record<string, unknown>;
type Reference = { type: string; label: string; href: string };
const s = (value: unknown) => String(value ?? "");

export default async function InvestigationAttributionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!requiredUuidSchema.safeParse(id).success) notFound();

  const { supabase, user } = await requireUser();
  const { data: project } = await supabase
    .from("projects")
    .select("id,name,owner_id")
    .eq("id", id)
    .maybeSingle();
  if (!project || project.owner_id !== user.id) notFound();

  const [
    hypotheses,
    clues,
    evaluations,
    assessment,
    clueLinks,
    actors,
    campaigns,
    sources,
    evidenceRecords,
    events,
    clusters,
    indicators,
    enrichments,
    malware,
    mitre,
  ] = await Promise.all([
    supabase
      .from("attribution_hypotheses")
      .select("*,threat_actors(name)")
      .eq("project_id", id)
      .is("archived_at", null)
      .neq("status", "REJECTED")
      .order("created_at"),
    supabase
      .from("attribution_evidence_items")
      .select("*")
      .eq("project_id", id)
      .is("archived_at", null)
      .order("created_at"),
    supabase
      .from("attribution_evidence_evaluations")
      .select("*")
      .eq("project_id", id),
    supabase
      .from("investigation_attribution_assessments")
      .select("*")
      .eq("project_id", id)
      .maybeSingle(),
    supabase
      .from("attribution_evidence_item_links")
      .select("*")
      .eq("project_id", id)
      .order("created_at"),
    supabase.from("threat_actors").select("id,name").eq("project_id", id),
    supabase.from("campaigns").select("id,name").eq("project_id", id).order("name"),
    supabase.from("sources").select("id,title").eq("project_id", id),
    supabase.from("evidence").select("id,title").eq("project_id", id),
    supabase
      .from("timeline_events")
      .select("id,event_name,event_date")
      .eq("project_id", id),
    supabase
      .from("infrastructure_clusters")
      .select("id,name")
      .eq("project_id", id),
    supabase.from("indicators").select("id,value,type").eq("project_id", id),
    supabase
      .from("enrichment_results")
      .select("id,provider_key,category,queried_at,indicator_id")
      .eq("project_id", id),
    supabase.from("malware").select("id,name").eq("project_id", id),
    supabase
      .from("mitre_techniques")
      .select("id,technique_id,technique_name")
      .eq("project_id", id),
  ]);

  if (
    [
      hypotheses,
      clues,
      evaluations,
      assessment,
      clueLinks,
      actors,
      campaigns,
      sources,
      evidenceRecords,
      events,
      clusters,
      indicators,
      enrichments,
      malware,
      mitre,
    ].some((result) => result.error)
  ) {
    return (
      <main className="mx-auto max-w-7xl space-y-6">
        <header>
          <p className="citem-label">Investigation analysis</p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-100">Attribution</h1>
        </header>
        <section className="card text-red-300">
          Unable to load the Investigation attribution matrix. Apply migration 035
          for the Investigation-scoped attribution model, then refresh.
        </section>
      </main>
    );
  }

  const lookupRows: Record<string, R[]> = {
    sources: (sources.data ?? []) as R[],
    evidence: (evidenceRecords.data ?? []) as R[],
    timeline_event: (events.data ?? []) as R[],
    infrastructure_cluster: (clusters.data ?? []) as R[],
    indicator: (indicators.data ?? []) as R[],
    enrichment_result: (enrichments.data ?? []) as R[],
    malware: (malware.data ?? []) as R[],
    mitre_technique: (mitre.data ?? []) as R[],
  };
  const campaignRows = (campaigns.data ?? []) as R[];
  const linkRows = (clueLinks.data ?? []) as R[];

  const referenceForLink = (link: R): Reference => {
    if (link.campaign_id) {
      const campaign = campaignRows.find((row) => s(row.id) === s(link.campaign_id));
      return {
        type: "Campaign",
        label: s(campaign?.name) || "Unavailable Campaign",
        href: `/projects/${id}/campaigns/${s(link.campaign_id)}`,
      };
    }
    return evidencePresentation(link, id, lookupRows);
  };

  const hypothesisRows: R[] = ((hypotheses.data ?? []) as R[]).map((row) => ({
    ...row,
    subject_name: hypothesisSubjectName(row),
  }));

  const clueRows: R[] = ((clues.data ?? []) as R[]).map((item) => {
    const references: Reference[] = [];
    if (item.campaign_id) {
      const campaign = campaignRows.find((row) => s(row.id) === s(item.campaign_id));
      references.push({
        type: "Campaign",
        label: s(campaign?.name) || "Unavailable Campaign",
        href: `/projects/${id}/campaigns/${s(item.campaign_id)}`,
      });
    }
    const primary = evidencePresentation(item, id, lookupRows);
    if (primary.type !== "Unknown") references.push(primary);
    for (const link of linkRows.filter((row) => s(row.evidence_item_id) === s(item.id))) {
      references.push(referenceForLink(link));
    }
    const seen = new Set<string>();
    return {
      ...item,
      references: references.filter((reference) => {
        const key = `${reference.type}:${reference.href}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    };
  });

  const label = (rows: R[], format: (row: R) => string) =>
    rows.map((row) => ({ ...row, label: format(row) }));
  const referenceOptions: Record<string, R[]> = {
    evidence: label((evidenceRecords.data ?? []) as R[], (row) => s(row.title)),
    indicator: label(
      (indicators.data ?? []) as R[],
      (row) => `${s(row.value)} (${s(row.type)})`,
    ),
    campaign: label(campaignRows, (row) => s(row.name)),
    timeline_event: label(
      (events.data ?? []) as R[],
      (row) => `${s(row.event_date).slice(0, 10)} — ${s(row.event_name)}`,
    ),
    source: label((sources.data ?? []) as R[], (row) => s(row.title)),
    infrastructure_cluster: label(
      (clusters.data ?? []) as R[],
      (row) => s(row.name),
    ),
    malware: label((malware.data ?? []) as R[], (row) => s(row.name)),
    mitre_technique: label(
      (mitre.data ?? []) as R[],
      (row) => `${s(row.technique_id)} — ${s(row.technique_name)}`,
    ),
    enrichment_result: label(
      (enrichments.data ?? []) as R[],
      (row) => `${s(row.provider_key) || s(row.category)} · ${s(row.queried_at).slice(0, 10)}`,
    ),
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <header>
        <p className="citem-label">Investigation analysis</p>
        <h1 className="mt-2 text-3xl font-semibold text-stone-100">Attribution</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-400">
          Build competing explanations directly at Investigation level. Campaigns,
          Indicators, Evidence, Timeline Events and other CİTEM objects are supporting
          references to clues—not mandatory containers for the analysis.
        </p>
      </header>

      <InvestigationAttributionMatrix
        projectId={id}
        hypotheses={hypothesisRows}
        clues={clueRows}
        evaluations={(evaluations.data ?? []) as R[]}
        actors={(actors.data ?? []) as R[]}
        referenceOptions={referenceOptions}
        assessment={(assessment.data ?? {}) as R}
      />
    </main>
  );
}
