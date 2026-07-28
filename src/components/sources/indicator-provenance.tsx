"use client";

import { useActionState } from "react";

import {
  linkObservationSource,
  type SourceActionState,
} from "@/app/projects/[id]/source-actions";
import { verificationStates } from "@/lib/sources/schema";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "");
const initialState: SourceActionState = {};

function formatDate(value: unknown) {
  if (!value) return "Not recorded";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : parsed.toLocaleString();
}

function SourceIdentity({ source, legacyLabel }: { source?: Row; legacyLabel: string }) {
  if (source) {
    return (
      <div className="mt-2 rounded border border-stone-800/80 bg-black/10 p-3">
        <div className="flex flex-wrap gap-2">
          <span className="citem-badge">{text(source.source_type)}</span>
          <span className="citem-badge">{text(source.reliability)}</span>
          <span className="citem-badge">{text(source.verification_state)}</span>
          {source.archived_at ? <span className="citem-badge" data-tone="attention">ARCHIVED</span> : null}
        </div>
        <p className="mt-2 font-semibold text-stone-200">{text(source.title)}</p>
        <p className="mt-1 text-xs text-stone-500">{text(source.publisher) || "No publisher"}</p>
        {source.url ? <a className="mt-2 block break-all text-xs text-amber-300 hover:underline" href={text(source.url)} target="_blank" rel="noreferrer">{text(source.url)}</a> : null}
        {legacyLabel ? <p className="mt-2 text-xs text-stone-500">Legacy label retained: {legacyLabel}</p> : null}
      </div>
    );
  }
  return <p className="mt-2 text-sm text-stone-500">{legacyLabel || "No source recorded"}</p>;
}

function ObservationSourceForm({
  projectId,
  observation,
  sources,
}: {
  projectId: string;
  observation: Row;
  sources: Row[];
}) {
  const [state, action, pending] = useActionState(
    linkObservationSource.bind(null, projectId, text(observation.id)),
    initialState,
  );
  return (
    <form action={action} className="mt-3 grid gap-2 border-t border-stone-800 pt-3 md:grid-cols-[1fr_220px_auto]">
      <label className="text-xs text-stone-500">
        Structured Source
        <select className="field mt-1" name="source_id" defaultValue={text(observation.source_id)}>
          <option value="">No structured Source</option>
          {sources.filter((source) => !source.archived_at).map((source) => (
            <option key={text(source.id)} value={text(source.id)}>{text(source.title)}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-stone-500">
        Observation verification
        <select className="field mt-1" name="verification_state" defaultValue={text(observation.verification_state || "UNVERIFIED")}>
          {verificationStates.map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      <button className="citem-button self-end" disabled={pending}>{pending ? "Saving…" : "Save provenance"}</button>
      {state.error ? <p className="text-xs text-red-300 md:col-span-3" role="alert">{state.error}</p> : null}
      {state.success ? <p className="text-xs text-emerald-300 md:col-span-3">{state.success}</p> : null}
    </form>
  );
}

export function IndicatorProvenance({
  projectId,
  observations,
  sources,
  enrichmentResults,
  currentUserId,
}: {
  projectId: string;
  observations: Row[];
  sources: Row[];
  enrichmentResults: Row[];
  currentUserId: string;
}) {
  const sourceById = new Map(sources.map((source) => [text(source.id), source]));
  const referencedIds = new Set<string>();
  for (const observation of observations) if (observation.source_id) referencedIds.add(text(observation.source_id));
  for (const result of enrichmentResults) if (result.source_id) referencedIds.add(text(result.source_id));
  const legacyLabels = Array.from(new Set(observations.map((row) => text(row.source_label)).filter(Boolean)));

  return (
    <>
      <section className="card" id="observations">
        <p className="citem-label">Provenance</p>
        <h2 className="mt-2 text-lg font-semibold text-stone-100">Observation history</h2>
        <p className="mt-2 text-sm leading-6 text-stone-500">The canonical Indicator remains unique while each accepted observed form and its Source relationship are preserved separately.</p>
        {observations.length ? (
          <ol className="mt-4 grid gap-3">
            {observations.map((observation) => {
              const source = observation.source_id ? sourceById.get(text(observation.source_id)) : undefined;
              return (
                <li className="rounded border border-stone-800/80 bg-black/10 p-3" key={text(observation.id)}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <code className="break-all text-sm text-stone-200">{text(observation.observed_value)}</code>
                    <div className="flex flex-wrap gap-2"><span className="citem-badge">{text(observation.origin_kind)}</span><span className="citem-badge">{text(observation.verification_state || "UNVERIFIED")}</span></div>
                  </div>
                  <dl className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                    <div><dt className="text-stone-600">Observed time</dt><dd className="mt-1 text-stone-400">{formatDate(observation.observed_at)}</dd></div>
                    <div><dt className="text-stone-600">Ingested time</dt><dd className="mt-1 text-stone-400">{formatDate(observation.ingested_at)}</dd></div>
                    <div><dt className="text-stone-600">Confidence</dt><dd className="mt-1 text-stone-400">{text(observation.confidence) || "Not assessed"}</dd></div>
                    <div><dt className="text-stone-600">Creator</dt><dd className="mt-1 text-stone-400">{text(observation.created_by) === currentUserId ? "Current analyst" : "Authorized analyst"}</dd></div>
                    <div className="md:col-span-2"><dt className="text-stone-600">Analyst note</dt><dd className="mt-1 whitespace-pre-wrap text-stone-400">{text(observation.analyst_note) || "No note"}</dd></div>
                  </dl>
                  <SourceIdentity source={source} legacyLabel={text(observation.source_label)} />
                  <ObservationSourceForm projectId={projectId} observation={observation} sources={sources} />
                </li>
              );
            })}
          </ol>
        ) : <p className="mt-4 text-sm text-stone-500">No observation records exist yet.</p>}
      </section>

      <section className="card" id="sources">
        <p className="citem-label">Source chains</p>
        <h2 className="mt-2 text-lg font-semibold text-stone-100">Sources</h2>
        <p className="mt-2 text-sm leading-6 text-stone-500">CİTEM links provenance to the specific observation or enrichment result: Indicator → Observation → Source and Indicator → Enrichment Run → Result → Source.</p>
        {referencedIds.size ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {Array.from(referencedIds).map((id) => {
              const source = sourceById.get(id);
              return source ? <SourceIdentity key={id} source={source} legacyLabel="" /> : null;
            })}
          </div>
        ) : <p className="mt-4 text-sm text-stone-500">No structured Sources are linked yet.</p>}
        {legacyLabels.length ? <div className="mt-4"><p className="citem-label">Legacy source labels</p><ul className="mt-2 list-disc pl-5 text-sm text-stone-400">{legacyLabels.map((label) => <li key={label}>{label}</li>)}</ul></div> : null}
      </section>
    </>
  );
}
