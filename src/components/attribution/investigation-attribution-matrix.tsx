"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { ActionForm, SubmitButton } from "@/components/form-status";
import {
  addAttributionClue,
  addAttributionClueReference,
  clearAttributionCell,
  saveAttributionCellImpact,
  saveInvestigationAssessment,
  saveInvestigationHypothesis,
} from "@/app/projects/[id]/attribution-actions";

type R = Record<string, unknown>;
type Reference = { type: string; label: string; href: string };
type State = { error?: string; success?: string };
type StatefulAction = (state: State, formData: FormData) => Promise<State>;

const s = (value: unknown) => String(value ?? "");
const input = "w-full rounded border border-stone-700 bg-stone-950 p-2";

function impactSymbol(impact: unknown) {
  if (impact === "SUPPORTS") return "+";
  if (impact === "CONTRADICTS") return "−";
  if (impact === "NEUTRAL") return "~";
  return "?";
}

function impactTone(impact: unknown) {
  if (impact === "SUPPORTS") return "text-emerald-300 border-emerald-900/70 bg-emerald-950/20";
  if (impact === "CONTRADICTS") return "text-red-300 border-red-900/70 bg-red-950/20";
  if (impact === "NEUTRAL") return "text-amber-200 border-amber-900/70 bg-amber-950/20";
  return "text-stone-500 border-stone-800 bg-black/10";
}

function TinyAction({
  action,
  label,
  title,
}: {
  action: StatefulAction;
  label: string;
  title: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction}>
      <button
        className="w-full rounded border border-stone-700 px-2 py-1.5 text-left text-xs text-stone-200 hover:border-cyan-700 hover:text-cyan-200 disabled:opacity-50"
        disabled={pending}
        title={title}
        type="submit"
      >
        {pending ? "Saving…" : label}
      </button>
      {state.error ? (
        <p className="mt-1 max-w-48 text-[10px] text-red-300">{state.error}</p>
      ) : null}
    </form>
  );
}

function MatrixCell({
  projectId,
  hypothesis,
  clue,
  evaluation,
}: {
  projectId: string;
  hypothesis: R;
  clue: R;
  evaluation?: R;
}) {
  const hypothesisId = s(hypothesis.id);
  const clueId = s(clue.id);
  const rationale = s(evaluation?.rationale);
  const diagnosticValue = s(evaluation?.diagnostic_value) || "MEDIUM";
  const impact = evaluation?.impact;
  const quickAction = (nextImpact: "SUPPORTS" | "CONTRADICTS" | "NEUTRAL") =>
    saveAttributionCellImpact.bind(
      null,
      projectId,
      hypothesisId,
      clueId,
      nextImpact,
    );

  return (
    <details className="relative">
      <summary
        className={`mx-auto flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded border text-lg font-semibold transition hover:border-cyan-600 ${impactTone(impact)}`}
        title={`${s(clue.title)} × ${s(hypothesis.title)} — click to assess`}
      >
        {impactSymbol(impact)}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-64 rounded border border-stone-700 bg-stone-950 p-3 text-left shadow-xl">
        <p className="text-xs font-semibold text-stone-100">Assess this relationship</p>
        <p className="mt-1 line-clamp-2 text-[11px] text-stone-500">
          {s(clue.title)} × {s(hypothesis.title)}
        </p>
        <div className="mt-3 grid gap-2">
          {[
            ["SUPPORTS", "+ Supports", "Mark this clue as supporting the hypothesis."],
            ["CONTRADICTS", "− Contradicts", "Mark this clue as contradicting the hypothesis."],
            ["NEUTRAL", "~ Neutral", "Mark this clue as non-discriminating for the hypothesis."],
          ].map(([nextImpact, label, title]) => (
            <div key={nextImpact}>
              <ActionForm
                action={quickAction(nextImpact as "SUPPORTS" | "CONTRADICTS" | "NEUTRAL")}
              >
                <input type="hidden" name="diagnostic_value" value={diagnosticValue} readOnly />
                <input type="hidden" name="rationale" value={rationale} readOnly />
                <button
                  className="w-full rounded border border-stone-700 px-2 py-1.5 text-left text-xs text-stone-200 hover:border-cyan-700 hover:text-cyan-200"
                  title={title}
                  type="submit"
                >
                  {label}
                </button>
              </ActionForm>
            </div>
          ))}
          {evaluation ? (
            <TinyAction
              action={clearAttributionCell.bind(null, projectId, hypothesisId, clueId)}
              label="? Clear assessment"
              title="Return this cell to not assessed."
            />
          ) : null}
        </div>
        {evaluation ? (
          <details className="mt-3 border-t border-stone-800 pt-3">
            <summary className="cursor-pointer text-xs text-cyan-300">
              Rationale / diagnostic value
            </summary>
            <div className="mt-3">
              <ActionForm
                action={saveAttributionCellImpact.bind(
                  null,
                  projectId,
                  hypothesisId,
                  clueId,
                  s(evaluation.impact),
                )}
              >
                <label className="text-xs text-stone-400">
                  Diagnostic value
                  <select
                    className={input}
                    name="diagnostic_value"
                    defaultValue={diagnosticValue}
                  >
                    <option>LOW</option>
                    <option>MEDIUM</option>
                    <option>HIGH</option>
                  </select>
                </label>
                <label className="text-xs text-stone-400">
                  Rationale (optional)
                  <textarea
                    className={input}
                    name="rationale"
                    defaultValue={rationale}
                    placeholder="Why does this clue support or contradict the hypothesis?"
                  />
                </label>
                <SubmitButton>Save details</SubmitButton>
              </ActionForm>
            </div>
          </details>
        ) : null}
      </div>
    </details>
  );
}

function InvestigationHypothesisForm({
  projectId,
  actors,
  row = {},
}: {
  projectId: string;
  actors: R[];
  row?: R;
}) {
  const [subjectKind, setSubjectKind] = useState(
    s(row.subject_kind) || "UNKNOWN_ACTOR",
  );
  return (
    <ActionForm
      action={saveInvestigationHypothesis.bind(
        null,
        projectId,
        s(row.id) || undefined,
      )}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <label>
          Title
          <input className={input} name="title" required defaultValue={s(row.title)} />
        </label>
        <label>
          Subject kind
          <select
            className={input}
            name="subject_kind"
            value={subjectKind}
            onChange={(event) => setSubjectKind(event.target.value)}
          >
            <option>EXISTING_THREAT_ACTOR</option>
            <option>ACTOR_CLASS</option>
            <option>UNKNOWN_ACTOR</option>
            <option>NON_ATTRIBUTION_ALTERNATIVE</option>
          </select>
        </label>
        {subjectKind === "EXISTING_THREAT_ACTOR" ? (
          <label>
            Threat Actor
            <select className={input} name="threat_actor_id" defaultValue={s(row.threat_actor_id)}>
              <option value="">Select actor</option>
              {actors.map((actor) => (
                <option key={s(actor.id)} value={s(actor.id)}>
                  {s(actor.name)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="threat_actor_id" value="" />
        )}
        {subjectKind !== "EXISTING_THREAT_ACTOR" ? (
          <label>
            Subject label
            <input className={input} name="subject_label" defaultValue={s(row.subject_label)} />
          </label>
        ) : (
          <input type="hidden" name="subject_label" value="" />
        )}
        <label>
          Status
          <select className={input} name="status" defaultValue={s(row.status) || "DRAFT"}>
            <option>DRAFT</option>
            <option>ACTIVE</option>
            <option>DISFAVORED</option>
            <option>REJECTED</option>
          </select>
        </label>
        <label>
          Confidence
          <select className={input} name="confidence" defaultValue={s(row.confidence) || "MEDIUM"}>
            <option>LOW</option>
            <option>MEDIUM</option>
            <option>HIGH</option>
          </select>
        </label>
      </div>
      <label>
        Proposition
        <textarea className={input} name="proposition" required defaultValue={s(row.proposition)} />
      </label>
      <details className="rounded border border-stone-800 p-3">
        <summary className="cursor-pointer text-xs text-cyan-300">Analytical details</summary>
        <div className="mt-3 grid gap-3">
          {[
            ["analytic_rationale", "Analytic rationale"],
            ["key_assumptions", "Key assumptions"],
            ["known_weaknesses", "Known weaknesses"],
            ["information_gaps", "Information gaps"],
            ["status_rationale", "Status rationale"],
          ].map(([name, label]) => (
            <label key={name}>
              {label}
              <textarea className={input} name={name} defaultValue={s(row[name])} />
            </label>
          ))}
        </div>
      </details>
      <SubmitButton>{row.id ? "Save hypothesis" : "Add hypothesis column"}</SubmitButton>
    </ActionForm>
  );
}

function ClueForm({ projectId }: { projectId: string }) {
  return (
    <ActionForm action={addAttributionClue.bind(null, projectId)}>
      <label>
        Clue label
        <input
          className={input}
          name="title"
          required
          placeholder="e.g. Infrastructure overlap"
        />
      </label>
      <label>
        What did you observe?
        <textarea
          className={input}
          name="relevance_note"
          required
          placeholder="State the observable clue without forcing an attribution conclusion."
        />
      </label>
      <SubmitButton>Add clue row</SubmitButton>
    </ActionForm>
  );
}

function ClueReferenceForm({
  projectId,
  clueId,
  options,
}: {
  projectId: string;
  clueId: string;
  options: Record<string, R[]>;
}) {
  const types = Object.keys(options);
  const [referenceType, setReferenceType] = useState(types[0] ?? "evidence");
  const rows = options[referenceType] ?? [];
  return (
    <ActionForm action={addAttributionClueReference.bind(null, projectId, clueId)}>
      <label className="text-xs text-stone-400">
        Reference type
        <select
          className={input}
          name="reference_type"
          value={referenceType}
          onChange={(event) => setReferenceType(event.target.value)}
        >
          {types.map((type) => (
            <option key={type} value={type}>
              {type.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-stone-400">
        Supporting material
        <select className={input} name="reference_id" required defaultValue="" key={referenceType}>
          <option value="" disabled>
            Select record
          </option>
          {rows.map((row) => (
            <option key={s(row.id)} value={s(row.id)}>
              {s(row.label)}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton>Link</SubmitButton>
    </ActionForm>
  );
}

function InvestigationAssessmentForm({
  projectId,
  row,
  hypotheses,
}: {
  projectId: string;
  row: R;
  hypotheses: R[];
}) {
  const [conclusion, setConclusion] = useState(s(row.conclusion_type) || "UNRESOLVED");
  return (
    <ActionForm action={saveInvestigationAssessment.bind(null, projectId)}>
      <div className="grid gap-3 md:grid-cols-3">
        <label>
          Status
          <select className={input} name="assessment_status" defaultValue={s(row.assessment_status) || "DRAFT"}>
            <option>DRAFT</option>
            <option>ASSESSED</option>
          </select>
        </label>
        <label>
          Conclusion
          <select
            className={input}
            name="conclusion_type"
            value={conclusion}
            onChange={(event) => setConclusion(event.target.value)}
          >
            <option>UNRESOLVED</option>
            <option>PREFERRED_HYPOTHESIS</option>
            <option>MULTIPLE_PLAUSIBLE</option>
            <option>INSUFFICIENT_EVIDENCE</option>
            <option>ATTRIBUTION_WITHHELD</option>
          </select>
        </label>
        <label>
          Confidence
          <select className={input} name="confidence" defaultValue={s(row.confidence) || "MEDIUM"}>
            <option>LOW</option>
            <option>MEDIUM</option>
            <option>HIGH</option>
          </select>
        </label>
      </div>
      {conclusion === "PREFERRED_HYPOTHESIS" ? (
        <label>
          Preferred hypothesis
          <select className={input} name="preferred_hypothesis_id" defaultValue={s(row.preferred_hypothesis_id)}>
            <option value="">Select hypothesis</option>
            {hypotheses.map((hypothesis, index) => (
              <option key={s(hypothesis.id)} value={s(hypothesis.id)}>
                H{index + 1} — {s(hypothesis.title)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="preferred_hypothesis_id" value="" />
      )}
      <label>
        Current judgement
        <textarea className={input} name="current_judgment" defaultValue={s(row.current_judgment)} />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label>
          Alternative explanations
          <textarea className={input} name="alternative_explanations" defaultValue={s(row.alternative_explanations)} />
        </label>
        <label>
          Key uncertainties
          <textarea className={input} name="key_uncertainties" defaultValue={s(row.key_uncertainties)} />
        </label>
      </div>
      <label>
        Discriminating information needed
        <textarea
          className={input}
          name="discriminating_information_needed"
          defaultValue={s(row.discriminating_information_needed)}
        />
      </label>
      <label>
        Assessed at
        <input
          className={input}
          name="assessed_at"
          type="datetime-local"
          defaultValue={s(row.assessed_at).slice(0, 16)}
        />
      </label>
      <SubmitButton>Save judgement</SubmitButton>
    </ActionForm>
  );
}

export function InvestigationAttributionMatrix({
  projectId,
  hypotheses,
  clues,
  evaluations,
  actors,
  referenceOptions,
  assessment,
}: {
  projectId: string;
  hypotheses: R[];
  clues: R[];
  evaluations: R[];
  actors: R[];
  referenceOptions: Record<string, R[]>;
  assessment: R;
}) {
  return (
    <div className="space-y-6">
      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="citem-label">Attribution matrix</p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-100">
              Competing hypotheses × clues
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-400">
              Start with observations, not a preferred actor. Add hypothesis columns and clue rows,
              then click an intersection to mark whether the clue supports, contradicts, or is
              neutral to that hypothesis.
            </p>
          </div>
          <p className="text-xs text-stone-500">
            + supports · − contradicts · ~ neutral · ? not assessed
          </p>
        </div>

        <table className="mt-5 min-w-max border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 min-w-72 border-b border-r border-stone-800 bg-stone-950 p-3 align-bottom">
                <span className="text-xs uppercase tracking-wider text-stone-500">Clues</span>
              </th>
              {hypotheses.map((hypothesis, index) => (
                <th
                  className="min-w-48 border-b border-r border-stone-800 bg-black/10 p-3 align-top"
                  key={s(hypothesis.id)}
                >
                  <details>
                    <summary className="cursor-pointer list-none">
                      <span className="text-xs text-cyan-400">H{index + 1}</span>
                      <strong className="mt-1 block text-stone-100">{s(hypothesis.title)}</strong>
                      <span className="mt-1 block text-xs font-normal text-stone-500">
                        {s(hypothesis.subject_name)} · {s(hypothesis.confidence)}
                      </span>
                    </summary>
                    <div className="mt-3 w-80 rounded border border-stone-800 bg-stone-950 p-3 font-normal">
                      <InvestigationHypothesisForm
                        projectId={projectId}
                        actors={actors}
                        row={hypothesis}
                      />
                    </div>
                  </details>
                </th>
              ))}
              <th className="min-w-48 border-b border-stone-800 p-3 align-top">
                <details>
                  <summary className="cursor-pointer list-none rounded border border-dashed border-cyan-800 px-3 py-3 text-center text-cyan-300 hover:border-cyan-500">
                    + Hypothesis
                  </summary>
                  <div className="mt-3 w-80 rounded border border-stone-800 bg-stone-950 p-3 font-normal">
                    <InvestigationHypothesisForm projectId={projectId} actors={actors} />
                  </div>
                </details>
              </th>
            </tr>
          </thead>
          <tbody>
            {clues.map((clue) => {
              const references = (clue.references ?? []) as Reference[];
              return (
                <tr key={s(clue.id)}>
                  <th className="sticky left-0 z-10 border-b border-r border-stone-800 bg-stone-950 p-3 align-top font-normal">
                    <details>
                      <summary className="cursor-pointer list-none">
                        <strong className="text-stone-100">{s(clue.title)}</strong>
                        <p className="mt-1 max-w-72 whitespace-pre-wrap text-xs leading-5 text-stone-400">
                          {s(clue.relevance_note)}
                        </p>
                        {references.length ? (
                          <div className="mt-2 flex max-w-72 flex-wrap gap-1">
                            {references.slice(0, 3).map((reference, index) => (
                              <span className="citem-badge" key={`${reference.type}-${index}`}>
                                {reference.type}
                              </span>
                            ))}
                            {references.length > 3 ? (
                              <span className="text-[10px] text-stone-500">+{references.length - 3}</span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="mt-2 block text-[10px] text-stone-600">No supporting material linked yet</span>
                        )}
                      </summary>
                      <div className="mt-3 max-w-72 border-t border-stone-800 pt-3">
                        {references.length ? (
                          <ul className="grid gap-1 text-xs">
                            {references.map((reference, index) => (
                              <li key={`${reference.href}-${index}`}>
                                <Link className="text-cyan-300" href={reference.href}>
                                  {reference.type}: {reference.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs text-cyan-300">+ Link supporting material</summary>
                          <div className="mt-3">
                            <ClueReferenceForm
                              projectId={projectId}
                              clueId={s(clue.id)}
                              options={referenceOptions}
                            />
                          </div>
                        </details>
                      </div>
                    </details>
                  </th>
                  {hypotheses.map((hypothesis) => {
                    const evaluation = evaluations.find(
                      (row) =>
                        s(row.hypothesis_id) === s(hypothesis.id) &&
                        s(row.evidence_item_id) === s(clue.id),
                    );
                    return (
                      <td
                        className="border-b border-r border-stone-800 p-3 text-center align-middle"
                        key={s(hypothesis.id)}
                      >
                        <MatrixCell
                          projectId={projectId}
                          hypothesis={hypothesis}
                          clue={clue}
                          evaluation={evaluation}
                        />
                      </td>
                    );
                  })}
                  <td className="border-b border-stone-800" />
                </tr>
              );
            })}
            <tr>
              <th className="sticky left-0 z-10 border-r border-stone-800 bg-stone-950 p-3 align-top font-normal">
                <details>
                  <summary className="cursor-pointer list-none rounded border border-dashed border-cyan-800 px-3 py-3 text-center text-cyan-300 hover:border-cyan-500">
                    + Clue
                  </summary>
                  <div className="mt-3">
                    <ClueForm projectId={projectId} />
                  </div>
                </details>
              </th>
              <td colSpan={Math.max(1, hypotheses.length + 1)} />
            </tr>
          </tbody>
        </table>

        {!hypotheses.length || !clues.length ? (
          <p className="mt-4 text-xs text-stone-500">
            {!hypotheses.length && !clues.length
              ? "Add at least one hypothesis and one clue to start comparing explanations."
              : !hypotheses.length
                ? "Add a hypothesis column to begin evaluating the existing clues."
                : "Add a clue row to begin testing the hypotheses."}
          </p>
        ) : null}
      </section>

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="citem-label">Current assessment</p>
            <h2 className="mt-2 text-xl font-semibold text-stone-100">
              Analyst judgement
            </h2>
          </div>
          <div className="flex gap-2">
            <span className="citem-badge">{s(assessment.assessment_status) || "DRAFT"}</span>
            <span className="citem-badge" data-tone="attention">
              {s(assessment.confidence) || "NOT ASSESSED"}
            </span>
          </div>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm text-stone-300">
          {s(assessment.current_judgment) || "No Investigation-level attribution judgement recorded yet."}
        </p>
        <details className="mt-4 rounded border border-stone-800 p-3">
          <summary className="cursor-pointer text-sm text-cyan-300">Edit judgement</summary>
          <div className="mt-4">
            <InvestigationAssessmentForm
              projectId={projectId}
              row={assessment}
              hypotheses={hypotheses}
            />
          </div>
        </details>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="card">
          <p className="citem-label">Key assumptions</p>
          <div className="mt-3 grid gap-3 text-sm text-stone-300">
            {hypotheses.filter((h) => s(h.key_assumptions)).map((h, index) => (
              <div key={s(h.id)}>
                <strong className="text-xs text-cyan-300">H{index + 1} · {s(h.title)}</strong>
                <p className="mt-1 whitespace-pre-wrap">{s(h.key_assumptions)}</p>
              </div>
            ))}
            {!hypotheses.some((h) => s(h.key_assumptions)) ? <p className="text-stone-500">None recorded.</p> : null}
          </div>
        </article>
        <article className="card">
          <p className="citem-label">Information gaps</p>
          <div className="mt-3 grid gap-3 text-sm text-stone-300">
            {hypotheses.filter((h) => s(h.information_gaps)).map((h, index) => (
              <div key={s(h.id)}>
                <strong className="text-xs text-cyan-300">H{index + 1} · {s(h.title)}</strong>
                <p className="mt-1 whitespace-pre-wrap">{s(h.information_gaps)}</p>
              </div>
            ))}
            {!hypotheses.some((h) => s(h.information_gaps)) ? <p className="text-stone-500">None recorded.</p> : null}
          </div>
        </article>
        <article className="card">
          <p className="citem-label">Alternative explanations</p>
          <p className="mt-3 whitespace-pre-wrap text-sm text-stone-300">
            {s(assessment.alternative_explanations) || "No assessment-level alternatives recorded yet."}
          </p>
        </article>
      </section>
    </div>
  );
}
