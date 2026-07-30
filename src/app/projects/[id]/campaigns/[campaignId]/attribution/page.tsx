import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  AssessmentForm,
  ArchiveForm,
  EvidenceForm,
  EvaluationForm,
  HypothesisForm,
} from "@/components/attribution/forms";
type R = Record<string, unknown>;
const s = (x: unknown) => String(x ?? "");
export default async function AttributionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; campaignId: string }>;
  searchParams: Promise<{ historical?: string }>;
}) {
  const { id, campaignId } = await params;
  const historical = (await searchParams).historical === "1";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(campaignId))
    notFound();
  const { supabase, user } = await requireUser();
  const [{ data: project }, { data: campaign }] = await Promise.all([
    supabase.from("projects").select("id,owner_id").eq("id", id).maybeSingle(),
    supabase
      .from("campaigns")
      .select("id,name")
      .eq("project_id", id)
      .eq("id", campaignId)
      .maybeSingle(),
  ]);
  if (!project || project.owner_id !== user.id || !campaign) notFound();
  const hq = supabase
    .from("attribution_hypotheses")
    .select("*")
    .eq("project_id", id)
    .eq("campaign_id", campaignId)
    .order("created_at");
  if (!historical) hq.is("archived_at", null).neq("status", "REJECTED");
  const eq = supabase
    .from("attribution_evidence_items")
    .select("*")
    .eq("project_id", id)
    .eq("campaign_id", campaignId)
    .order("created_at");
  if (!historical) eq.is("archived_at", null);
  const [
    assessment,
    hypotheses,
    evidence,
    evaluations,
    actors,
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
      .from("campaign_attribution_assessments")
      .select("*")
      .eq("project_id", id)
      .eq("campaign_id", campaignId)
      .maybeSingle(),
    hq,
    eq,
    supabase
      .from("attribution_evidence_evaluations")
      .select("*")
      .eq("project_id", id)
      .eq("campaign_id", campaignId),
    supabase.from("threat_actors").select("id,name").eq("project_id", id),
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
  const hs = (hypotheses.data ?? []) as R[],
    es = (evidence.data ?? []) as R[],
    ev = (evaluations.data ?? []) as R[];
  const label = (rows: R[], fn: (r: R) => string) =>
    rows.map((r) => ({ ...r, label: fn(r) }));
  const options = {
    source: label((sources.data ?? []) as R[], (r) => s(r.title)),
    evidence: label((evidenceRecords.data ?? []) as R[], (r) => s(r.title)),
    timeline_event: label(
      (events.data ?? []) as R[],
      (r) => `${s(r.event_date).slice(0, 10)} — ${s(r.event_name)}`,
    ),
    infrastructure_cluster: label((clusters.data ?? []) as R[], (r) =>
      s(r.name),
    ),
    indicator: label(
      (indicators.data ?? []) as R[],
      (r) => `${s(r.value)} (${s(r.type)})`,
    ),
    enrichment_result: label(
      (enrichments.data ?? []) as R[],
      (r) =>
        `${s(r.category)} · ${s(r.queried_at).slice(0, 10)} · Indicator ${s(r.indicator_id).slice(0, 8)}`,
    ),
    malware: label((malware.data ?? []) as R[], (r) => s(r.name)),
    mitre_technique: label(
      (mitre.data ?? []) as R[],
      (r) => `${s(r.technique_id)} — ${s(r.technique_name)}`,
    ),
  };
  return (
    <main className="space-y-6">
      <header>
        <Link
          className="text-cyan-300"
          href={`/projects/${id}/campaigns/${campaignId}`}
        >
          ← {campaign.name}
        </Link>
        <p className="citem-label mt-4">Campaign analysis</p>
        <h1 className="text-3xl font-semibold">
          Attribution and Competing Assessments
        </h1>
        <p className="mt-2 text-stone-400">
          Attribution Analysis compares multiple analyst-defined hypotheses
          against a shared Campaign evidence inventory. Each item may support,
          contradict or remain neutral. A preferred hypothesis is the analyst’s
          current best explanation—not a confirmed fact or automatic
          Campaign-to-Threat Actor relationship.
        </p>
      </header>
      <section className="card">
        <h2 className="text-xl font-semibold">
          1. Current Attribution Judgement
        </h2>
        <AssessmentForm
          projectId={id}
          campaignId={campaignId}
          row={(assessment.data ?? {}) as R}
          hypotheses={hs.filter(
            (h) => !h.archived_at && h.status !== "REJECTED",
          )}
        />
      </section>
      <section className="card">
        <div className="flex justify-between">
          <h2 className="text-xl font-semibold">2. Competing Hypotheses</h2>
          <Link
            className="text-cyan-300"
            href={`?historical=${historical ? "0" : "1"}`}
          >
            {historical ? "Active view" : "Historical view"}
          </Link>
        </div>
        <div className="mt-4 grid gap-4">
          {hs.map((h) => {
            const counts = ev.filter((x) => x.hypothesis_id === h.id);
            return (
              <article
                className="rounded border border-stone-700 p-4"
                key={s(h.id)}
              >
                <Link
                  className="font-semibold text-cyan-200"
                  href={`/projects/${id}/campaigns/${campaignId}/attribution/${s(h.id)}`}
                >
                  {s(h.title)}
                </Link>
                <p>
                  {s(h.subject_kind)} · {s(h.subject_label)} · {s(h.status)} ·{" "}
                  {s(h.confidence)}{" "}
                  {assessment.data?.preferred_hypothesis_id === h.id
                    ? "· CURRENTLY PREFERRED"
                    : ""}
                </p>
                <p className="mt-2">{s(h.proposition)}</p>
                <p className="text-sm text-stone-400">
                  {s(h.analytic_rationale) || "No rationale yet"}
                </p>
                <p className="text-xs">
                  SUPPORTS{" "}
                  {counts.filter((x) => x.impact === "SUPPORTS").length} ·
                  CONTRADICTS{" "}
                  {counts.filter((x) => x.impact === "CONTRADICTS").length} ·
                  NEUTRAL {counts.filter((x) => x.impact === "NEUTRAL").length}
                </p>
                <ArchiveForm
                  projectId={id}
                  campaignId={campaignId}
                  id={s(h.id)}
                  archived={!!h.archived_at}
                />
              </article>
            );
          })}
        </div>
        <details className="mt-4">
          <summary>Create hypothesis</summary>
          <HypothesisForm
            projectId={id}
            campaignId={campaignId}
            actors={(actors.data ?? []) as R[]}
          />
        </details>
      </section>
      <section className="card">
        <h2 className="text-xl font-semibold">3. Shared Evidence Inventory</h2>
        <ul>
          {es.map((e) => (
            <li className="border-b border-stone-800 py-2" key={s(e.id)}>
              <strong>{s(e.title)}</strong> — {s(e.relevance_note)} · evaluated{" "}
              {ev.filter((x) => x.evidence_item_id === e.id).length}/{hs.length}
              {e.archived_at ? " · ARCHIVED" : ""}
            </li>
          ))}
        </ul>
        <details>
          <summary>Add evidence</summary>
          <EvidenceForm
            projectId={id}
            campaignId={campaignId}
            options={options}
          />
        </details>
      </section>
      <section className="card">
        <h2 className="text-xl font-semibold">4. Evidence Evaluation</h2>
        <p className="text-sm text-stone-400">
          SUPPORTS does not prove; CONTRADICTS does not reject automatically;
          NEUTRAL is contextual; missing means analysis is incomplete.
        </p>
        <EvaluationForm
          projectId={id}
          campaignId={campaignId}
          hypotheses={hs}
          evidence={es}
        />
      </section>
      <section className="card overflow-x-auto">
        <h2 className="text-xl font-semibold">5. Comparison Matrix</h2>
        <p className="text-sm text-stone-400">
          Counts are neither scores, probabilities, nor an automated winner.
        </p>
        <table className="mt-3 min-w-max text-left text-sm">
          <thead>
            <tr>
              <th className="p-2">Shared evidence</th>
              {hs.map((h) => (
                <th className="p-2" key={s(h.id)}>
                  {s(h.title)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {es.map((e) => (
              <tr key={s(e.id)}>
                <th className="p-2">{s(e.title)}</th>
                {hs.map((h) => {
                  const x = ev.find(
                    (v) =>
                      v.evidence_item_id === e.id && v.hypothesis_id === h.id,
                  );
                  return (
                    <td
                      className="p-2"
                      aria-label={`${s(e.title)} against ${s(h.title)}: ${x ? s(x.impact) : "NOT YET ASSESSED"}`}
                      key={s(h.id)}
                    >
                      {x ? (
                        <>
                          <strong>{s(x.impact)}</strong>
                          <br />
                          {s(x.diagnostic_value)} ·{" "}
                          <abbr title={s(x.rationale)}>rationale</abbr>
                        </>
                      ) : (
                        <strong>NOT YET ASSESSED</strong>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2 className="text-xl font-semibold">6. Analytical Review Prompts</h2>
        <ul className="list-disc pl-5 text-stone-300">
          <li>Which evidence genuinely discriminates among alternatives?</li>
          <li>What assumptions could fail, and what deception is plausible?</li>
          <li>What information would change the current judgement?</li>
        </ul>
      </section>
    </main>
  );
}
