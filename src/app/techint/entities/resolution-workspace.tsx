"use client";

import { useMemo, useState, useTransition } from "react";
import { ByokConnectionPanel } from "@/components/ai/byok-connection-panel";

type Group = {
  key: string;
  entityKind: string;
  displayValue: string;
  normalizedValue: string;
  occurrenceCount: number;
  sourceSystems: string[];
  semanticRoles: string[];
  sampleSignalTitles: string[];
};

type Entity = {
  id: string;
  entityKind: string;
  canonicalName: string;
};

type Suggestion = {
  groupKey: string;
  entityKind: string;
  displayValue: string;
  normalizedValue: string;
  occurrenceCount: number;
  decision: "MATCH_EXISTING" | "CREATE_NEW" | "UNSURE";
  candidateEntityId: string | null;
  proposedCanonicalName: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  rationale: string;
};

type ByokStatus = { connected?: boolean; provider?: string; providerId?: string; model?: string; state?: string };

export function EntityResolutionWorkspace({
  groups,
  entities,
  totalGroupCount,
  totalOccurrenceCount,
}: {
  groups: Group[];
  entities: Entity[];
  totalGroupCount: number;
  totalOccurrenceCount: number;
}) {
  const [byok, setByok] = useState<ByokStatus>({ connected: false });
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const entityById = useMemo(() => new Map(entities.map((entity) => [entity.id, entity])), [entities]);
  const visibleOccurrenceCount = groups.reduce((total, group) => total + group.occurrenceCount, 0);

  async function analyze() {
    setMessage("Sending a bounded batch of unresolved entity context to your connected BYOK provider. No resolution will be saved automatically.");
    startTransition(async () => {
      try {
        const response = await fetch("/api/techint/entities/suggest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ limit: Math.min(8, Math.max(groups.length, 1)) }),
        });
        const body = await response.json();
        if (!response.ok) {
          setMessage(body.error ?? "AI suggestions could not be generated.");
          return;
        }
        const next: Record<string, Suggestion> = {};
        for (const suggestion of (body.suggestions ?? []) as Suggestion[]) next[suggestion.groupKey] = suggestion;
        setSuggestions(next);
        setMessage(`Generated ${Object.keys(next).length} non-authoritative suggestion(s) with ${body.provider ?? "BYOK"}${body.model ? ` / ${body.model}` : ""}. Review before confirming.`);
      } catch {
        setMessage("AI entity suggestions could not be generated.");
      }
    });
  }

  async function resolveGroup(
    group: Group,
    input: { action: "LINK_EXISTING"; entityId: string } | { action: "CREATE_NEW"; canonicalName: string },
    rememberAlias: boolean,
  ) {
    setMessage(`Resolving the exact ${group.entityKind} group “${group.displayValue}”…`);
    startTransition(async () => {
      try {
        const response = await fetch("/api/techint/entities/resolve-group", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...input,
            entityKind: group.entityKind,
            normalizedValue: group.normalizedValue,
            rememberAlias,
          }),
        });
        const body = await response.json();
        if (!response.ok) {
          setMessage(body.error ?? "Entity group resolution failed.");
          return;
        }
        setMessage(`Resolved ${body.linked}/${body.matched} current assertion(s)${rememberAlias ? " and remembered the exact alias for future reconciliation" : ""}.`);
        window.setTimeout(() => window.location.reload(), 250);
      } catch {
        setMessage("Entity group resolution failed safely.");
      }
    });
  }

  return (
    <section className="space-y-4">
      <div className="card panel-corners border-l-2 border-l-amber-500/60">
        <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <p className="citem-eyebrow">Analyst decision queue</p>
            <h2 className="citem-section-title mt-1">Resolve only what the system cannot prove safely</h2>
            <p className="mt-2 max-w-3xl text-sm text-stone-400">
              Each card represents one repeated identity label, not one source record. Review the source context, decide what the label represents, and optionally teach that exact mapping for future automatic resolution.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded border border-stone-800 bg-stone-950/20 px-3 py-2">
              <p className="uppercase tracking-[0.13em] text-stone-500">Need decision</p>
              <p className="mt-1 text-lg font-semibold text-stone-200">{totalGroupCount}</p>
            </div>
            <div className="rounded border border-stone-800 bg-stone-950/20 px-3 py-2">
              <p className="uppercase tracking-[0.13em] text-stone-500">Source occurrences</p>
              <p className="mt-1 text-lg font-semibold text-stone-200">{totalOccurrenceCount}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-800 pt-3 text-xs text-stone-500">
          <span className="rounded border border-stone-800 px-2 py-1">Showing {groups.length} of {totalGroupCount} groups</span>
          <span className="rounded border border-stone-800 px-2 py-1">{visibleOccurrenceCount} occurrences in this visible queue</span>
          <span>Highest-repeat groups are shown first by the current bounded view.</span>
        </div>
      </div>

      <details className="card">
        <summary className="cursor-pointer list-none">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`mt-1.5 h-2.5 w-2.5 rounded-full border ${byok.connected ? "border-cyan-700 bg-cyan-900/50" : "border-stone-700 bg-stone-900"}`} />
              <div>
                <p className="citem-eyebrow">AI analyst aid · optional</p>
                <h3 className="mt-1 text-base font-medium text-stone-200">{byok.connected ? `${byok.provider ?? byok.providerId ?? "BYOK"}${byok.model ? ` / ${byok.model}` : ""}` : "Connect NVIDIA NIM or another BYOK provider"}</h3>
                <p className="mt-1 text-xs text-stone-500">AI proposes candidates for a bounded batch. The final identity decision always remains with you.</p>
              </div>
            </div>
            <span className={`rounded border px-2.5 py-1.5 text-xs uppercase tracking-[0.13em] ${byok.connected ? "border-cyan-900 text-cyan-200" : "border-stone-800 text-stone-500"}`}>
              {byok.connected ? "Connected · open controls" : "Disconnected · open setup"}
            </span>
          </div>
        </summary>

        <div className="mt-4 space-y-4 border-t border-stone-800 pt-4">
          <div className="rounded border border-amber-900/60 bg-amber-950/10 p-3 text-xs text-stone-400">
            <b className="text-amber-200">Decision boundary:</b> AI never writes a canonical entity or alias by itself. It receives only bounded labels, source names, a few signal titles, and server-selected canonical candidates. Suggestions remain ephemeral until you confirm them.
          </div>
          <ByokConnectionPanel scope="user" defaultProviderId="nvidia_nim" onStatusChange={setByok} />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-stone-800 bg-stone-950/20 p-3">
            <div>
              <p className="text-sm text-stone-300">Analyze the next bounded set of unresolved groups</p>
              <p className="mt-1 text-xs text-stone-500">NVIDIA NIM is the recommended default. At most eight groups are sent per suggestion call.</p>
            </div>
            <button className="citem-button" type="button" disabled={pending || !byok.connected || !groups.length} onClick={analyze}>
              {pending ? "Analyzing…" : "Analyze next 8 groups"}
            </button>
          </div>
        </div>
      </details>

      {message ? (
        <div className="card border-l-2 border-l-cyan-900 text-sm text-cyan-200" role="status">
          <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-700">System message</p>
          <p className="mt-1">{message}</p>
        </div>
      ) : null}

      {!groups.length ? (
        <div className="card border-l-2 border-l-stone-700">
          <p className="text-sm font-medium text-stone-300">No analyst decision is required in the bounded view.</p>
          <p className="mt-1 text-xs text-stone-500">Deterministic identities and confirmed aliases are already handled by the safe resolver.</p>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {groups.map((group, index) => (
            <GroupCard
              key={group.key}
              index={index + 1}
              group={group}
              entities={entities.filter((entity) => entity.entityKind === group.entityKind)}
              suggestion={suggestions[group.key]}
              entityById={entityById}
              pending={pending}
              onResolve={resolveGroup}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function GroupCard({
  index,
  group,
  entities,
  suggestion,
  entityById,
  pending,
  onResolve,
}: {
  index: number;
  group: Group;
  entities: Entity[];
  suggestion?: Suggestion;
  entityById: Map<string, Entity>;
  pending: boolean;
  onResolve: (
    group: Group,
    input: { action: "LINK_EXISTING"; entityId: string } | { action: "CREATE_NEW"; canonicalName: string },
    rememberAlias: boolean,
  ) => Promise<void>;
}) {
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [canonicalName, setCanonicalName] = useState(group.displayValue);
  const suggestedEntity = suggestion?.candidateEntityId ? entityById.get(suggestion.candidateEntityId) : null;

  return (
    <article className="card panel-corners flex h-full flex-col border-t border-t-stone-800">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] tracking-[0.18em] text-stone-600">CASE {String(index).padStart(2, "0")}</span>
            <span className="rounded border border-amber-900/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-amber-200">{group.entityKind}</span>
            <span className="text-[10px] uppercase tracking-[0.13em] text-stone-600">Decision required</span>
          </div>
          <h3 className="mt-2 truncate text-lg font-medium text-stone-100">{group.displayValue}</h3>
          <p className="mt-1 text-xs text-stone-500">What should CİTEM treat this source label as?</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-semibold text-stone-200">{group.occurrenceCount}</p>
          <p className="text-[10px] uppercase tracking-[0.13em] text-stone-600">occurrences</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded border border-stone-800 bg-stone-950/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">Source</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {group.sourceSystems.length
              ? group.sourceSystems.map((source) => <span className="rounded border border-stone-800 px-2 py-1 text-[11px] text-stone-400" key={source}>{source}</span>)
              : <span className="text-xs text-stone-600">Source unavailable</span>}
          </div>
        </div>
        <div className="rounded border border-stone-800 bg-stone-950/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">Observed role</p>
          <p className="mt-2 text-xs text-stone-400">{group.semanticRoles.join(" / ") || "ENTITY"}</p>
        </div>
      </div>

      {group.sampleSignalTitles.length ? (
        <div className="mt-3 rounded border border-stone-800 bg-stone-950/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">Context snapshot</p>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-stone-400">
            {group.sampleSignalTitles.map((title) => <li key={title}><span className="mr-2 text-stone-700">—</span>{title}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 flex-1">
        {suggestion ? (
          <div className="rounded border border-cyan-950 bg-cyan-950/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-cyan-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-200">AI candidate</span>
                <span className="text-[10px] uppercase tracking-[0.12em] text-stone-500">{suggestion.confidence} confidence</span>
              </div>
              <span className="font-mono text-[10px] text-stone-600">{suggestion.decision}</span>
            </div>
            <p className="mt-3 text-sm font-medium text-stone-200">
              {suggestion.decision === "MATCH_EXISTING"
                ? suggestedEntity?.canonicalName ?? "Invalid candidate"
                : suggestion.decision === "CREATE_NEW"
                  ? suggestion.proposedCanonicalName ?? "—"
                  : "No safe match proposed"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">{suggestion.rationale}</p>
            {suggestion.decision === "MATCH_EXISTING" && suggestedEntity ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="citem-button-ghost" disabled={pending} type="button" onClick={() => void onResolve(group, { action: "LINK_EXISTING", entityId: suggestedEntity.id }, false)}>Confirm current group</button>
                <button className="citem-button" disabled={pending} type="button" onClick={() => void onResolve(group, { action: "LINK_EXISTING", entityId: suggestedEntity.id }, true)}>Confirm &amp; teach exact alias</button>
              </div>
            ) : null}
            {suggestion.decision === "CREATE_NEW" && suggestion.proposedCanonicalName ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="citem-button-ghost" disabled={pending} type="button" onClick={() => void onResolve(group, { action: "CREATE_NEW", canonicalName: suggestion.proposedCanonicalName! }, false)}>Create &amp; resolve current group</button>
                <button className="citem-button" disabled={pending} type="button" onClick={() => void onResolve(group, { action: "CREATE_NEW", canonicalName: suggestion.proposedCanonicalName! }, true)}>Create &amp; teach exact alias</button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded border border-dashed border-stone-800 p-3">
            <p className="text-xs text-stone-500">No AI suggestion loaded for this case.</p>
            <p className="mt-1 text-[11px] text-stone-600">Open AI analyst aid above for optional assistance, or resolve manually below.</p>
          </div>
        )}
      </div>

      <details className="mt-3 rounded border border-stone-800 bg-stone-950/20 p-3">
        <summary className="cursor-pointer list-none text-sm font-medium text-stone-300">
          <div className="flex items-center justify-between gap-3">
            <span>Resolve manually</span>
            <span className="text-[10px] uppercase tracking-[0.13em] text-stone-600">Open decision controls</span>
          </div>
        </summary>
        <div className="mt-3 space-y-4 border-t border-stone-800 pt-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">Option A · Link to an existing identity</p>
            <select className="field mt-2 w-full" value={selectedEntityId} onChange={(event) => setSelectedEntityId(event.target.value)}>
              <option value="">Select an existing {group.entityKind}</option>
              {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.canonicalName}</option>)}
            </select>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="citem-button-ghost" type="button" disabled={pending || !selectedEntityId} onClick={() => void onResolve(group, { action: "LINK_EXISTING", entityId: selectedEntityId }, false)}>Link this group</button>
              <button className="citem-button" type="button" disabled={pending || !selectedEntityId} onClick={() => void onResolve(group, { action: "LINK_EXISTING", entityId: selectedEntityId }, true)}>Link &amp; remember exact alias</button>
            </div>
          </div>

          <div className="border-t border-stone-800 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">Option B · Create a new canonical identity</p>
            <input className="field mt-2 w-full" value={canonicalName} onChange={(event) => setCanonicalName(event.target.value)} maxLength={500} />
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="citem-button-ghost" type="button" disabled={pending || !canonicalName.trim()} onClick={() => void onResolve(group, { action: "CREATE_NEW", canonicalName: canonicalName.trim() }, false)}>Create for this group</button>
              <button className="citem-button" type="button" disabled={pending || !canonicalName.trim()} onClick={() => void onResolve(group, { action: "CREATE_NEW", canonicalName: canonicalName.trim() }, true)}>Create &amp; remember exact alias</button>
            </div>
          </div>

          <details className="rounded border border-stone-800 px-3 py-2">
            <summary className="cursor-pointer text-[11px] uppercase tracking-[0.13em] text-stone-600">Technical identity details</summary>
            <div className="mt-2 font-mono text-[11px] text-stone-600">
              <p>exact lookup: {group.normalizedValue}</p>
              <p>group key: {group.key}</p>
            </div>
          </details>
        </div>
      </details>
    </article>
  );
}
