import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { requiredUuidSchema } from "@/lib/workspace/schema";
import {
  evidencePresentation,
  hypothesisSubjectName,
} from "@/lib/attribution/presentation";
import {
  EvaluationForm,
  HypothesisForm,
  UnlinkEvaluation,
} from "@/components/attribution/forms";
type R = Record<string, unknown>;
const s = (x: unknown) => String(x ?? "");
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; campaignId: string; hypothesisId: string }>;
  searchParams: Promise<{ historical?: string }>;
}) {
  const { id, campaignId, hypothesisId } = await params;
  const historical = (await searchParams).historical === "1";
  if (
    ![id, campaignId, hypothesisId].every(
      (x) => requiredUuidSchema.safeParse(x).success,
    )
  )
    notFound();
  const { supabase, user } = await requireUser();
  const [
    { data: p },
    { data: c },
    { data: h },
    { data: actors },
    { data: evidence },
    { data: evaluations },
    { data: sources },
    { data: evidenceRecords },
    { data: events },
    { data: clusters },
    { data: indicators },
    { data: enrichments },
    { data: malware },
    { data: mitre },
  ] = await Promise.all([
    supabase.from("projects").select("owner_id").eq("id", id).maybeSingle(),
    supabase
      .from("campaigns")
      .select("id,name")
      .eq("project_id", id)
      .eq("id", campaignId)
      .maybeSingle(),
    supabase
      .from("attribution_hypotheses")
      .select("*,threat_actors(name)")
      .eq("project_id", id)
      .eq("campaign_id", campaignId)
      .eq("id", hypothesisId)
      .maybeSingle(),
    supabase.from("threat_actors").select("id,name").eq("project_id", id),
    supabase
      .from("attribution_evidence_items")
      .select("*")
      .eq("project_id", id)
      .eq("campaign_id", campaignId),
    supabase
      .from("attribution_evidence_evaluations")
      .select("*")
      .eq("project_id", id)
      .eq("campaign_id", campaignId)
      .eq("hypothesis_id", hypothesisId),
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
      .select("id,category,queried_at,indicator_id")
      .eq("project_id", id),
    supabase.from("malware").select("id,name").eq("project_id", id),
    supabase
      .from("mitre_techniques")
      .select("id,technique_id,technique_name")
      .eq("project_id", id),
  ]);
  if (p?.owner_id !== user.id || !c || !h) notFound();
  const lookups: Record<string, R[]> = {
    sources: (sources ?? []) as R[],
    evidence: (evidenceRecords ?? []) as R[],
    timeline_event: (events ?? []) as R[],
    infrastructure_cluster: (clusters ?? []) as R[],
    indicator: (indicators ?? []) as R[],
    enrichment_result: (enrichments ?? []) as R[],
    malware: (malware ?? []) as R[],
    mitre_technique: (mitre ?? []) as R[],
  };
  const allEvidence: R[] = ((evidence ?? []) as R[]).map((item) => ({
    ...item,
    presentation: evidencePresentation(item, id, lookups),
  }));
  const es = historical
      ? allEvidence
      : allEvidence.filter((item) => !item.archived_at),
    ev = (evaluations ?? []) as R[];
  return (
    <main className="space-y-6">
      <Link
        className="text-cyan-300"
        href={`/projects/${id}/campaigns/${campaignId}/attribution`}
      >
        ← Attribution workspace
      </Link>
      <Link
        className="ml-4 text-cyan-300"
        href={`?historical=${historical ? "0" : "1"}`}
      >
        {historical ? "Hide archived evidence" : "Show archived evidence"}
      </Link>
      <section className="card">
        <p className="citem-label">Hypothesis Summary</p>
        <h1 className="text-2xl font-semibold">{h.title}</h1>
        <p>{hypothesisSubjectName(h as R)}</p>
        <p>{h.proposition}</p>
        <HypothesisForm
          projectId={id}
          campaignId={campaignId}
          actors={(actors ?? []) as R[]}
          row={h as R}
        />
      </section>
      <section className="card">
        <h2 className="text-xl font-semibold">Evaluated Evidence</h2>
        {ev.map((x) => {
          const item = es.find((e) => e.id === x.evidence_item_id)!;
          if (!item) return null;
          const presentation = item.presentation as {
            type: string;
            label: string;
            href: string;
          };
          return (
            <article className="border-b border-stone-800 py-3" key={s(x.id)}>
              <strong>{s(item?.title)}</strong> · {presentation.type} ·{" "}
              <Link className="text-cyan-200" href={presentation.href}>
                {presentation.label}
              </Link>{" "}
              · {s(x.impact)} · {s(x.diagnostic_value)}
              <p>{s(x.rationale)}</p>
              <EvaluationForm
                projectId={id}
                campaignId={campaignId}
                hypotheses={[h as R]}
                evidence={[item]}
                initial={x}
              />
              <UnlinkEvaluation
                projectId={id}
                campaignId={campaignId}
                id={s(x.id)}
              />
            </article>
          );
        })}
      </section>
      <section className="card">
        <h2 className="text-xl font-semibold">Unassessed Evidence</h2>
        {es
          .filter((e) => !ev.some((x) => x.evidence_item_id === e.id))
          .map((e) => (
            <article key={s(e.id)}>
              <strong>{s(e.title)} — NOT YET ASSESSED</strong>
              <p>
                {(e.presentation as { type: string }).type} ·{" "}
                <Link
                  className="text-cyan-200"
                  href={(e.presentation as { href: string }).href}
                >
                  {(e.presentation as { label: string }).label}
                </Link>{" "}
                {e.archived_at ? "· ARCHIVED" : ""}
              </p>
              <p>{s(e.relevance_note)}</p>
              {!e.archived_at ? (
                <EvaluationForm
                  projectId={id}
                  campaignId={campaignId}
                  hypotheses={[h as R]}
                  evidence={[e]}
                  initial={{
                    hypothesis_id: hypothesisId,
                    evidence_item_id: e.id,
                  }}
                />
              ) : null}
            </article>
          ))}
      </section>
      <section className="card">
        <h2 className="text-xl font-semibold">Assumptions and Weaknesses</h2>
        <p>{h.key_assumptions || "No assumptions recorded."}</p>
        <p>{h.known_weaknesses || "No weaknesses recorded."}</p>
        <p>{h.information_gaps || "No gaps recorded."}</p>
      </section>
      <section className="card">
        <h2 className="text-xl font-semibold">Historical Status</h2>
        <p>
          {h.status}{" "}
          {h.archived_at ? `· archived ${h.archived_at}` : "· current"}
        </p>
        <p>{h.status_rationale}</p>
      </section>
      <section className="card">
        <h2 className="text-xl font-semibold">Analyst Review Prompts</h2>
        <p>
          What evidence would falsify this proposition? Which alternative
          explains the same observations?
        </p>
      </section>
    </main>
  );
}
