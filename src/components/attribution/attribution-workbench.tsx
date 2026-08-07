import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ArchiveForm,
  AssessmentForm,
  EvidenceArchiveForm,
  EvidenceForm,
  EvaluationForm,
  HypothesisForm,
} from "@/components/attribution/forms";
import { requireUser } from "@/lib/auth";
import {
  evidencePresentation,
  hypothesisSubjectName,
} from "@/lib/attribution/presentation";
import { requiredUuidSchema } from "@/lib/workspace/schema";

type R = Record<string, unknown>;
const s = (value: unknown) => String(value ?? "");

function impactSymbol(impact: unknown) {
  if (impact === "SUPPORTS") return "+";
  if (impact === "CONTRADICTS") return "−";
  if (impact === "NEUTRAL") return "~";
  return "?";
}

function boundedList(values: unknown[], fallback: string) {
  const rows = values.map((value) => s(value).trim()).filter(Boolean);
  return rows.length ? rows : [fallback];
}

export async function AttributionWorkbench({
  projectId,
  campaignId,
  historical = false,
  baseHref,
  showCampaignBackLink = false,
}: {
  projectId: string;
  campaignId: string;
  historical?: boolean;
  baseHref: string;
  showCampaignBackLink?: boolean;
}) {
  if (
    !requiredUuidSchema.safeParse(projectId).success ||
    !requiredUuidSchema.safeParse(campaignId).success
  ) {
    notFound();
  }

  const { supabase, user } = await requireUser();
  const [{ data: project }, { data: campaign }] = await Promise.all([
    supabase
      .from("projects")
      .select("id,owner_id")
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("campaigns")
      .select("id,name")
      .eq("project_id", projectId)
      .eq("id", campaignId)
      .maybeSingle(),
  ]);

  if (!project || project.owner_id !== user.id || !campaign) notFound();

  const hypothesisQuery = supabase
    .from("attribution_hypotheses")
    .select("*,threat_actors(name)")
    .eq("project_id", projectId)
    .eq("campaign_id", campaignId)
    .order("created_at");
  if (!historical) {
    hypothesisQuery.is("archived_at", null).neq("status", "REJECTED");
  }

  const evidenceQuery = supabase
    .from("attribution_evidence_items")
    .select("*")
    .eq("project_id", projectId)
    .eq("campaign_id", campaignId)
    .order("created_at");
  if (!historical) evidenceQuery.is("archived_at", null);

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
      .eq("project_id", projectId)
      .eq("campaign_id", campaignId)
      .maybeSingle(),
    hypothesisQuery,
    evidenceQuery,
    supabase
      .from("attribution_evidence_evaluations")
      .select("*")
      .eq("project_id", projectId)
      .eq("campaign_id", campaignId),
    supabase
      .from("threat_actors")
      .select("id,name")
      .eq("project_id", projectId),
    supabase.from("sources").select("id,title").eq("project_id", projectId),
    supabase.from("evidence").select("id,title").eq("project_id", projectId),
    supabase
      .from("timeline_events")
      .select("id,event_name,event_date")
      .eq("project_id", projectId),
    supabase
      .from("infrastructure_clusters")
      .select("id,name")
      .eq("project_id", projectId),
    supabase
      .from("indicators")
      .select("id,value,type")
      .eq("project_id", projectId),
    supabase
      .from("enrichment_results")
      .select("id,category,queried_at,indicator_id")
      .eq("project_id", projectId),
    supabase.from("malware").select("id,name").eq("project_id", projectId),
    supabase
      .from("mitre_techniques")
      .select("id,technique_id,technique_name")
      .eq("project_id", projectId),
  ]);

  if (
    [
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
    ].some((result) => result.error)
  ) {
    return (
      <div className="card text-red-300">
        Unable to load Attribution Workbench. Apply the Phase 2.1E attribution
        migration and refresh.
      </div>
    );
  }

  const hs: R[] = ((hypotheses.data ?? []) as R[]).map((hypothesis) => ({
    ...hypothesis,
    subject_name: hypothesisSubjectName(hypothesis),
  }));
  const evidenceItems = (evidence.data ?? []) as R[];
  const evaluationRows = (evaluations.data ?? []) as R[];
  const assessmentRow = (assessment.data ?? {}) as R;

  const label = (rows: R[], format: (row: R) => string) =>
    rows.map((row) => ({ ...row, label: format(row) }));
  const options = {
    source: label((sources.data ?? []) as R[], (row) => s(row.title)),
    evidence: label((evidenceRecords.data ?? []) as R[], (row) => s(row.title)),
    timeline_event: label(
      (events.data ?? []) as R[],
      (row) => `${s(row.event_date).slice(0, 10)} — ${s(row.event_name)}`,
    ),
    infrastructure_cluster: label(
      (clusters.data ?? []) as R[],
      (row) => s(row.name),
    ),
    indicator: label(
      (indicators.data ?? []) as R[],
      (row) => `${s(row.value)} (${s(row.type)})`,
    ),
    enrichment_result: label(
      (enrichments.data ?? []) as R[],
      (row) =>
        `${s(row.category)} · ${s(row.queried_at).slice(0, 10)} · Indicator ${s(row.indicator_id).slice(0, 8)}`,
    ),
    malware: label((malware.data ?? []) as R[], (row) => s(row.name)),
    mitre_technique: label(
      (mitre.data ?? []) as R[],
      (row) => `${s(row.technique_id)} — ${s(row.technique_name)}`,
    ),
  };
  const lookups: Record<string, R[]> = {
    sources: (sources.data ?? []) as R[],
    evidence: (evidenceRecords.data ?? []) as R[],
    timeline_event: (events.data ?? []) as R[],
    infrastructure_cluster: (clusters.data ?? []) as R[],
    indicator: (indicators.data ?? []) as R[],
    enrichment_result: (enrichments.data ?? []) as R[],
    malware: (malware.data ?? []) as R[],
    mitre_technique: (mitre.data ?? []) as R[],
  };
  const presentedEvidence: R[] = evidenceItems.map((item) => ({
    ...item,
    presentation: evidencePresentation(item, projectId, lookups),
  }));
  const activeEvidence = presentedEvidence.filter((item) => !item.archived_at);
  const preferred = hs.find(
    (hypothesis) => hypothesis.id === assessmentRow.preferred_hypothesis_id,
  );
  const toggleHref = `${baseHref}${baseHref.includes("?") ? "&" : "?"}historical=${historical ? "0" : "1"}`;

  const assumptions = boundedList(
    hs.map((hypothesis) => hypothesis.key_assumptions),
    "No key assumptions recorded yet.",
  );
  const informationGaps = boundedList(
    hs.map((hypothesis) => hypothesis.information_gaps),
    "No hypothesis-level information gaps recorded yet.",
  );
  const analystNotes = boundedList(
    hs.map((hypothesis) => hypothesis.analytic_rationale),
    "No analyst rationale recorded yet.",
  );

  return (
    <div className="space-y-6">
      <header className="rounded border border-stone-800/80 bg-black/10 p-5">
        {showCampaignBackLink ? (
          <Link
            className="text-sm text-cyan-300"
            href={`/projects/${projectId}/campaigns/${campaignId}`}
          >
            ← Campaign detail
          </Link>
        ) : null}
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="citem-label">Attribution Workbench</p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-100">
              {campaign.name}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-400">
              Compare competing explanations against shared evidence. A preferred
              hypothesis is the analyst&apos;s current best explanation, not a
              confirmed actor relationship.
            </p>
          </div>
          <Link className="text-sm text-cyan-300" href={toggleHref}>
            {historical ? "Active view" : "Historical view"}
          </Link>
        </div>
      </header>

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="citem-label">Current judgement</p>
            <h3 className="mt-2 text-xl font-semibold text-stone-100">
              {preferred
                ? `Likely responsible: ${s(preferred.subject_name)}`
                : s(assessmentRow.conclusion_type) || "Unresolved"}
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="citem-badge">
              {s(assessmentRow.assessment_status) || "DRAFT"}
            </span>
            <span className="citem-badge" data-tone="attention">
              {s(assessmentRow.confidence) || "NOT ASSESSED"}
            </span>
          </div>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-stone-300">
          {s(assessmentRow.current_judgment) || "No current judgement recorded."}
        </p>
        <details className="mt-5 rounded border border-stone-800 p-3">
          <summary className="cursor-pointer text-sm font-medium text-cyan-200">
            Edit current judgement
          </summary>
          <div className="mt-4">
            <AssessmentForm
              projectId={projectId}
              campaignId={campaignId}
              row={assessmentRow}
              hypotheses={hs.filter(
                (hypothesis) =>
                  !hypothesis.archived_at && hypothesis.status !== "REJECTED",
              )}
            />
          </div>
        </details>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="citem-label">Competing hypotheses</p>
            <h3 className="mt-2 text-xl font-semibold text-stone-100">
              Alternative explanations
            </h3>
          </div>
          <span className="text-xs text-stone-500">
            {hs.length} hypotheses in view
          </span>
        </div>
        <div className="mt-4 grid gap-3">
          {hs.length ? (
            hs.map((hypothesis, index) => {
              const hypothesisEvaluations = evaluationRows.filter(
                (evaluation) => evaluation.hypothesis_id === hypothesis.id,
              );
              return (
                <article
                  className="rounded border border-stone-800 bg-black/10 p-4"
                  key={s(hypothesis.id)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link
                        className="font-semibold text-cyan-200"
                        href={`/projects/${projectId}/campaigns/${campaignId}/attribution/${s(hypothesis.id)}`}
                      >
                        H{index + 1} · {s(hypothesis.title)}
                      </Link>
                      <p className="mt-1 text-sm text-stone-400">
                        {s(hypothesis.subject_name)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="citem-badge">{s(hypothesis.status)}</span>
                      <span className="citem-badge" data-tone="attention">
                        {s(hypothesis.confidence)}
                      </span>
                      {assessmentRow.preferred_hypothesis_id === hypothesis.id ? (
                        <span className="citem-badge">CURRENTLY PREFERRED</span>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-stone-300">
                    {s(hypothesis.proposition)}
                  </p>
                  <p className="mt-3 text-xs text-stone-500">
                    + {hypothesisEvaluations.filter((row) => row.impact === "SUPPORTS").length}
                    {" · "}− {hypothesisEvaluations.filter((row) => row.impact === "CONTRADICTS").length}
                    {" · "}~ {hypothesisEvaluations.filter((row) => row.impact === "NEUTRAL").length}
                  </p>
                  <ArchiveForm
                    projectId={projectId}
                    campaignId={campaignId}
                    id={s(hypothesis.id)}
                    archived={Boolean(hypothesis.archived_at)}
                  />
                </article>
              );
            })
          ) : (
            <p className="text-sm text-stone-500">
              No hypotheses are in the current view.
            </p>
          )}
        </div>
        <details className="mt-4 rounded border border-stone-800 p-3">
          <summary className="cursor-pointer text-sm font-medium text-cyan-200">
            Create hypothesis
          </summary>
          <div className="mt-4">
            <HypothesisForm
              projectId={projectId}
              campaignId={campaignId}
              actors={(actors.data ?? []) as R[]}
            />
          </div>
        </details>
      </section>

      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="citem-label">Evidence matrix</p>
            <h3 className="mt-2 text-xl font-semibold text-stone-100">
              Discriminating evidence
            </h3>
          </div>
          <p className="text-xs text-stone-500">
            + supports · − contradicts · ~ neutral · ? not assessed
          </p>
        </div>
        <table className="mt-4 min-w-max text-left text-sm">
          <thead>
            <tr className="border-b border-stone-800">
              <th className="p-2">Evidence</th>
              {hs.map((hypothesis, index) => (
                <th className="p-2" key={s(hypothesis.id)}>
                  H{index + 1}
                  <span className="block max-w-44 truncate text-xs font-normal text-stone-500">
                    {s(hypothesis.title)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {presentedEvidence.map((item) => {
              const presentation = item.presentation as {
                type: string;
                label: string;
                href: string;
              };
              return (
                <tr className="border-b border-stone-900" key={s(item.id)}>
                  <th className="p-2 font-normal">
                    <Link className="text-cyan-200" href={presentation.href}>
                      {presentation.label}
                    </Link>
                    <span className="block text-xs text-stone-500">
                      {presentation.type} · {s(item.title)}
                      {item.archived_at ? " · ARCHIVED" : ""}
                    </span>
                  </th>
                  {hs.map((hypothesis) => {
                    const evaluation = evaluationRows.find(
                      (row) =>
                        row.evidence_item_id === item.id &&
                        row.hypothesis_id === hypothesis.id,
                    );
                    return (
                      <td
                        className="p-2 text-center text-lg font-semibold"
                        key={s(hypothesis.id)}
                        title={evaluation ? s(evaluation.rationale) : "Not yet assessed"}
                      >
                        {impactSymbol(evaluation?.impact)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!presentedEvidence.length ? (
          <p className="mt-4 text-sm text-stone-500">
            No shared attribution evidence has been added yet.
          </p>
        ) : null}
        <details className="mt-4 rounded border border-stone-800 p-3">
          <summary className="cursor-pointer text-sm font-medium text-cyan-200">
            Evaluate evidence
          </summary>
          <div className="mt-4">
            <EvaluationForm
              projectId={projectId}
              campaignId={campaignId}
              hypotheses={hs}
              evidence={activeEvidence}
            />
          </div>
        </details>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="card">
          <p className="citem-label">Key assumptions</p>
          <ul className="mt-3 grid gap-2 text-sm text-stone-300">
            {assumptions.map((value, index) => (
              <li className="whitespace-pre-wrap" key={`${value}-${index}`}>
                {value}
              </li>
            ))}
          </ul>
        </article>
        <article className="card">
          <p className="citem-label">Information gaps</p>
          <ul className="mt-3 grid gap-2 text-sm text-stone-300">
            {informationGaps.map((value, index) => (
              <li className="whitespace-pre-wrap" key={`${value}-${index}`}>
                {value}
              </li>
            ))}
          </ul>
          {s(assessmentRow.discriminating_information_needed) ? (
            <p className="mt-3 border-t border-stone-800 pt-3 text-sm text-stone-400">
              <strong className="text-stone-300">Needed to discriminate:</strong>{" "}
              {s(assessmentRow.discriminating_information_needed)}
            </p>
          ) : null}
        </article>
        <article className="card">
          <p className="citem-label">Alternative explanations</p>
          <p className="mt-3 whitespace-pre-wrap text-sm text-stone-300">
            {s(assessmentRow.alternative_explanations) ||
              "No assessment-level alternative explanations recorded yet."}
          </p>
          {s(assessmentRow.key_uncertainties) ? (
            <p className="mt-3 border-t border-stone-800 pt-3 text-sm text-stone-400">
              <strong className="text-stone-300">Key uncertainties:</strong>{" "}
              {s(assessmentRow.key_uncertainties)}
            </p>
          ) : null}
        </article>
        <article className="card">
          <p className="citem-label">Analyst notes / rationale</p>
          <ul className="mt-3 grid gap-2 text-sm text-stone-300">
            {analystNotes.map((value, index) => (
              <li className="whitespace-pre-wrap" key={`${value}-${index}`}>
                {value}
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="citem-label">Shared evidence inventory</p>
            <h3 className="mt-2 text-xl font-semibold text-stone-100">
              Attribution evidence
            </h3>
          </div>
          <span className="text-xs text-stone-500">
            {presentedEvidence.length} items
          </span>
        </div>
        <ul className="mt-4 grid gap-3">
          {presentedEvidence.map((item) => {
            const presentation = item.presentation as {
              type: string;
              label: string;
              href: string;
            };
            return (
              <li
                className="rounded border border-stone-800 p-3"
                key={s(item.id)}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <strong>{s(item.title)}</strong>
                    <p className="text-sm text-stone-400">
                      <Link className="text-cyan-200" href={presentation.href}>
                        {presentation.label}
                      </Link>{" "}
                      · {presentation.type}
                    </p>
                    <p className="mt-2 text-sm text-stone-400">
                      {s(item.relevance_note)}
                    </p>
                  </div>
                  <span className="text-xs text-stone-500">
                    evaluated{" "}
                    {
                      evaluationRows.filter(
                        (row) => row.evidence_item_id === item.id,
                      ).length
                    }
                    /{hs.length}
                  </span>
                </div>
                <EvidenceArchiveForm
                  projectId={projectId}
                  campaignId={campaignId}
                  id={s(item.id)}
                  archived={Boolean(item.archived_at)}
                />
              </li>
            );
          })}
        </ul>
        <details className="mt-4 rounded border border-stone-800 p-3">
          <summary className="cursor-pointer text-sm font-medium text-cyan-200">
            Add evidence
          </summary>
          <div className="mt-4">
            <EvidenceForm
              projectId={projectId}
              campaignId={campaignId}
              options={options}
            />
          </div>
        </details>
      </section>
    </div>
  );
}
