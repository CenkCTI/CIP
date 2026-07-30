import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  EvaluationForm,
  HypothesisForm,
  UnlinkEvaluation,
} from "@/components/attribution/forms";
type R = Record<string, unknown>;
const s = (x: unknown) => String(x ?? "");
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; campaignId: string; hypothesisId: string }>;
}) {
  const { id, campaignId, hypothesisId } = await params;
  if (![id, campaignId, hypothesisId].every((x) => /^[0-9a-f-]{36}$/i.test(x)))
    notFound();
  const { supabase, user } = await requireUser();
  const [
    { data: p },
    { data: c },
    { data: h },
    { data: actors },
    { data: evidence },
    { data: evaluations },
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
      .select("*")
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
  ]);
  if (p?.owner_id !== user.id || !c || !h) notFound();
  const es = (evidence ?? []) as R[],
    ev = (evaluations ?? []) as R[];
  return (
    <main className="space-y-6">
      <Link
        className="text-cyan-300"
        href={`/projects/${id}/campaigns/${campaignId}/attribution`}
      >
        ← Attribution workspace
      </Link>
      <section className="card">
        <p className="citem-label">Hypothesis Summary</p>
        <h1 className="text-2xl font-semibold">{h.title}</h1>
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
          return (
            <article className="border-b border-stone-800 py-3" key={s(x.id)}>
              <strong>{s(item?.title)}</strong> · {s(x.impact)} ·{" "}
              {s(x.diagnostic_value)}
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
