"use client";

import { useActionState, useMemo, useState, useTransition } from "react";

import {
  archiveSource,
  createSource,
  deleteSource,
  restoreSource,
  updateSource,
  type SourceActionState,
} from "@/app/projects/[id]/source-actions";
import {
  formatSourceDateInput,
  sourceReliabilities,
  sourceTypes,
  verificationStates,
} from "@/lib/sources/schema";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "");

type SourceRegistryProps = {
  projectId: string;
  sources: Row[];
  evidence: { id: string; title: string }[];
  referenceCounts: Record<string, { observations: number; enrichments: number }>;
};

const initialState: SourceActionState = {};

function SourceFields({
  source,
  evidence,
}: {
  source?: Row;
  evidence: { id: string; title: string }[];
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-sm text-stone-300 md:col-span-2">
        Title
        <input
          className="field mt-1"
          name="title"
          required
          maxLength={240}
          defaultValue={text(source?.title)}
        />
      </label>
      <label className="text-sm text-stone-300">
        Type
        <select
          className="field mt-1"
          name="source_type"
          defaultValue={text(source?.source_type || "OTHER")}
        >
          {sourceTypes.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label className="text-sm text-stone-300">
        Publisher
        <input
          className="field mt-1"
          name="publisher"
          maxLength={240}
          defaultValue={text(source?.publisher)}
        />
      </label>
      <label className="text-sm text-stone-300 md:col-span-2">
        URL
        <input
          className="field mt-1"
          name="url"
          type="url"
          maxLength={2048}
          placeholder="https://example.com/report"
          defaultValue={text(source?.url)}
        />
        <span className="mt-1 block text-xs text-stone-500">
          Stored as citation metadata only. CİTEM does not fetch a URL merely because
          it is entered.
        </span>
      </label>
      <label className="text-sm text-stone-300">
        Published time
        <input
          className="field mt-1"
          name="published_at"
          type="datetime-local"
          defaultValue={formatSourceDateInput(source?.published_at)}
        />
      </label>
      <label className="text-sm text-stone-300">
        Accessed time
        <input
          className="field mt-1"
          name="accessed_at"
          type="datetime-local"
          defaultValue={formatSourceDateInput(source?.accessed_at)}
        />
      </label>
      <label className="text-sm text-stone-300">
        Reliability
        <select
          className="field mt-1"
          name="reliability"
          defaultValue={text(source?.reliability || "UNKNOWN")}
        >
          {sourceReliabilities.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-stone-500">
          Reliability assesses the Source itself, not confidence in an analytical
          claim.
        </span>
      </label>
      <label className="text-sm text-stone-300">
        Verification state
        <select
          className="field mt-1"
          name="verification_state"
          defaultValue={text(source?.verification_state || "UNVERIFIED")}
        >
          {verificationStates.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label className="text-sm text-stone-300 md:col-span-2">
        Linked Evidence
        <select
          className="field mt-1"
          name="evidence_id"
          defaultValue={text(source?.evidence_id)}
        >
          <option value="">No linked Evidence</option>
          {evidence.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-stone-500">
          Source identifies origin and citation metadata. Evidence stores the actual
          research artefact.
        </span>
      </label>
      <label className="text-sm text-stone-300 md:col-span-2">
        Description
        <textarea
          className="field mt-1 min-h-24"
          name="description"
          maxLength={10000}
          defaultValue={text(source?.description)}
        />
      </label>
      <label className="text-sm text-stone-300 md:col-span-2">
        Analyst notes
        <textarea
          className="field mt-1 min-h-24"
          name="analyst_notes"
          maxLength={20000}
          defaultValue={text(source?.analyst_notes)}
        />
      </label>
    </div>
  );
}

function StateMessage({ state }: { state: SourceActionState }) {
  if (state.error)
    return (
      <p className="mt-3 text-sm text-red-300" role="alert">
        {state.error}
      </p>
    );
  if (state.success)
    return <p className="mt-3 text-sm text-emerald-300">{state.success}</p>;
  return null;
}

function CreateSourceForm({
  projectId,
  evidence,
}: {
  projectId: string;
  evidence: { id: string; title: string }[];
}) {
  const [state, action, pending] = useActionState(
    createSource.bind(null, projectId),
    initialState,
  );
  return (
    <form action={action} className="card">
      <p className="citem-label">Source Registry</p>
      <h2 className="mt-2 text-lg font-semibold text-stone-100">
        Create structured Source
      </h2>
      <p className="mt-2 text-sm leading-6 text-stone-500">
        Source records identify where information came from. Evidence stores the actual
        research artefact.
      </p>
      <div className="mt-4">
        <SourceFields evidence={evidence} />
      </div>
      <button className="citem-button mt-4" disabled={pending}>
        {pending ? "Creating…" : "Create Source"}
      </button>
      <StateMessage state={state} />
    </form>
  );
}

function EditSourceForm({
  projectId,
  source,
  evidence,
}: {
  projectId: string;
  source: Row;
  evidence: { id: string; title: string }[];
}) {
  const [state, action, pending] = useActionState(
    updateSource.bind(null, projectId, text(source.id)),
    initialState,
  );
  return (
    <form action={action} className="mt-4 border-t border-stone-800 pt-4">
      <SourceFields source={source} evidence={evidence} />
      <button className="citem-button mt-4" disabled={pending}>
        {pending ? "Saving…" : "Save Source"}
      </button>
      <StateMessage state={state} />
    </form>
  );
}

function SourceActions({
  projectId,
  source,
  referenced,
}: {
  projectId: string;
  source: Row;
  referenced: number;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<SourceActionState>({});
  const archived = Boolean(source.archived_at);
  const id = text(source.id);

  function run(action: () => Promise<SourceActionState>) {
    startTransition(() => {
      void action().then(setMessage);
    });
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button
        className="citem-button-ghost"
        disabled={pending}
        type="button"
        onClick={() =>
          run(() =>
            archived ? restoreSource(projectId, id) : archiveSource(projectId, id),
          )
        }
      >
        {archived ? "Restore" : "Archive"}
      </button>
      <button
        className="rounded border border-red-900/60 px-3 py-2 text-sm text-red-300 disabled:opacity-50"
        disabled={pending || referenced > 0}
        type="button"
        onClick={() => run(() => deleteSource(projectId, id))}
      >
        Delete unreferenced
      </button>
      {referenced > 0 ? (
        <span className="text-xs text-stone-500">
          Referenced Sources are preserved and may only be archived.
        </span>
      ) : null}
      <StateMessage state={message} />
    </div>
  );
}

export function SourceRegistry({
  projectId,
  sources,
  evidence,
  referenceCounts,
}: SourceRegistryProps) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [reliability, setReliability] = useState("");
  const [verification, setVerification] = useState("");
  const [archive, setArchive] = useState<"active" | "archived" | "all">(
    "active",
  );

  const visible = useMemo(
    () =>
      sources.filter((source) => {
        const haystack = [
          source.title,
          source.publisher,
          source.url,
          source.description,
        ]
          .map(text)
          .join(" ")
          .toLowerCase();
        if (query && !haystack.includes(query.toLowerCase())) return false;
        if (type && text(source.source_type) !== type) return false;
        if (reliability && text(source.reliability) !== reliability) return false;
        if (verification && text(source.verification_state) !== verification)
          return false;
        if (archive === "active" && source.archived_at) return false;
        if (archive === "archived" && !source.archived_at) return false;
        return true;
      }),
    [archive, query, reliability, sources, type, verification],
  );

  const evidenceById = new Map(evidence.map((item) => [item.id, item.title]));

  return (
    <div className="grid gap-5">
      <CreateSourceForm projectId={projectId} evidence={evidence} />

      <section className="card">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-stone-300">
            Search
            <input
              className="field mt-1"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </label>
          <label className="text-sm text-stone-300">
            Type
            <select
              className="field mt-1"
              value={type}
              onChange={(event) => setType(event.currentTarget.value)}
            >
              <option value="">All types</option>
              {sourceTypes.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-stone-300">
            Reliability
            <select
              className="field mt-1"
              value={reliability}
              onChange={(event) => setReliability(event.currentTarget.value)}
            >
              <option value="">All reliability</option>
              {sourceReliabilities.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-stone-300">
            Verification
            <select
              className="field mt-1"
              value={verification}
              onChange={(event) => setVerification(event.currentTarget.value)}
            >
              <option value="">All states</option>
              {verificationStates.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-stone-300">
            Archive
            <select
              className="field mt-1"
              value={archive}
              onChange={(event) =>
                setArchive(event.currentTarget.value as typeof archive)
              }
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
          </label>
        </div>
      </section>

      {visible.length ? (
        visible.map((source) => {
          const counts = referenceCounts[text(source.id)] ?? {
            observations: 0,
            enrichments: 0,
          };
          const referenced = counts.observations + counts.enrichments;
          return (
            <article className="card" key={text(source.id)}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <span className="citem-badge">{text(source.source_type)}</span>
                    <span className="citem-badge">{text(source.reliability)}</span>
                    <span className="citem-badge">
                      {text(source.verification_state)}
                    </span>
                    {source.archived_at ? (
                      <span className="citem-badge" data-tone="attention">
                        ARCHIVED
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-stone-100">
                    <a
                      className="hover:text-amber-300 hover:underline"
                      href={`/projects/${projectId}/sources/${text(source.id)}`}
                    >
                      {text(source.title)}
                    </a>
                  </h3>
                  <p className="mt-1 text-sm text-stone-400">
                    {text(source.publisher) || "No publisher"}
                  </p>
                </div>
                <span className="text-xs text-stone-500">
                  {counts.observations} observation · {counts.enrichments} enrichment
                  result
                </span>
              </div>
              {source.url ? (
                <a
                  className="mt-3 block break-all text-sm text-amber-300 hover:underline"
                  href={text(source.url)}
                  rel="noreferrer"
                  target="_blank"
                >
                  {text(source.url)}
                </a>
              ) : null}
              <p className="mt-3 whitespace-pre-wrap text-sm text-stone-300">
                {text(source.description) || "No description"}
              </p>
              <p className="mt-2 text-xs text-stone-500">
                Origin: {text(source.origin_kind)} · Evidence:{" "}
                {evidenceById.get(text(source.evidence_id)) ?? "none"}
              </p>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-amber-300">
                  Edit Source metadata
                </summary>
                <EditSourceForm
                  projectId={projectId}
                  source={source}
                  evidence={evidence}
                />
              </details>
              <SourceActions
                projectId={projectId}
                source={source}
                referenced={referenced}
              />
            </article>
          );
        })
      ) : (
        <p className="card text-stone-500">No Sources match this view.</p>
      )}
    </div>
  );
}
