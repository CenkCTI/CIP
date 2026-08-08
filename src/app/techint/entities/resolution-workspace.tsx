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

export function EntityResolutionWorkspace({ groups, entities }: { groups: Group[]; entities: Entity[] }) {
  const [byok, setByok] = useState<ByokStatus>({ connected: false });
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const entityById = useMemo(() => new Map(entities.map((entity) => [entity.id, entity])), [entities]);

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

  async function resolveGroup(group: Group, input: { action: "LINK_EXISTING"; entityId: string } | { action: "CREATE_NEW"; canonicalName: string }, rememberAlias: boolean) {
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
    <section className="space-y-5">
      <div className="card panel-corners space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="citem-eyebrow">AI-assisted exception review</p>
            <h2 className="citem-section-title mt-2">Resolve groups, not individual assertions</h2>
            <p className="mt-2 max-w-3xl text-sm text-stone-400">
              Equal unresolved labels are grouped once. CİTEM handles deterministic identities and known confirmed aliases first; BYOK is optional and only proposes matches for the remaining ambiguous groups. AI never writes a canonical entity or alias by itself.
            </p>
          </div>
          <div className="rounded border border-stone-800 px-3 py-2 text-xs text-stone-400">
            {groups.length} review group(s) · {groups.reduce((total, group) => total + group.occurrenceCount, 0)} assertion occurrence(s)
          </div>
        </div>
        <p className="text-xs text-amber-200">
          NVIDIA NIM is the recommended default for this workflow. When you click Analyze, bounded entity labels, source-system names, a few signal titles, and server-selected canonical candidates are sent to your chosen BYOK provider. API keys are never included in CİTEM records.
        </p>
      </div>

      <ByokConnectionPanel scope="user" defaultProviderId="nvidia_nim" onStatusChange={setByok} />

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-stone-300">AI state: <strong>{byok.connected ? `${byok.provider ?? byok.providerId ?? "BYOK"}${byok.model ? ` / ${byok.model}` : ""}` : "not connected"}</strong></p>
          <p className="mt-1 text-xs text-stone-500">Suggestions are ephemeral until you explicitly confirm a group.</p>
        </div>
        <button className="citem-button" type="button" disabled={pending || !byok.connected || !groups.length} onClick={analyze}>
          {pending ? "Working…" : "Analyze next unresolved groups"}
        </button>
      </div>

      {message ? <div className="card text-sm text-cyan-200" role="status">{message}</div> : null}

      {!groups.length ? (
        <div className="card text-sm text-stone-500">No ambiguous entity groups need analyst review in the bounded view.</div>
      ) : (
        <div className="grid gap-3">
          {groups.map((group) => (
            <GroupCard
              key={group.key}
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
  group,
  entities,
  suggestion,
  entityById,
  pending,
  onResolve,
}: {
  group: Group;
  entities: Entity[];
  suggestion?: Suggestion;
  entityById: Map<string, Entity>;
  pending: boolean;
  onResolve: (group: Group, input: { action: "LINK_EXISTING"; entityId: string } | { action: "CREATE_NEW"; canonicalName: string }, rememberAlias: boolean) => Promise<void>;
}) {
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [canonicalName, setCanonicalName] = useState(group.displayValue);
  const suggestedEntity = suggestion?.candidateEntityId ? entityById.get(suggestion.candidateEntityId) : null;

  return (
    <article className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-stone-700 px-2 py-1 text-xs text-stone-300">{group.entityKind}</span>
            <span className="text-xs text-stone-500">{group.semanticRoles.join(" / ") || "ENTITY"}</span>
          </div>
          <h3 className="mt-2 text-lg font-medium text-stone-100">{group.displayValue}</h3>
          <p className="mt-1 text-xs text-stone-500">Exact lookup group: {group.normalizedValue}</p>
        </div>
        <div className="text-right text-xs text-stone-400">
          <p><strong className="text-stone-200">{group.occurrenceCount}</strong> occurrence(s)</p>
          <p>{group.sourceSystems.length ? group.sourceSystems.join(" · ") : "source unavailable"}</p>
        </div>
      </div>

      {group.sampleSignalTitles.length ? (
        <div className="rounded border border-stone-800 p-3">
          <p className="text-xs uppercase tracking-wider text-stone-500">Example context</p>
          <ul className="mt-2 space-y-1 text-xs text-stone-400">{group.sampleSignalTitles.map((title) => <li key={title}>• {title}</li>)}</ul>
        </div>
      ) : null}

      {suggestion ? (
        <div className="rounded border border-cyan-950 bg-cyan-950/10 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-cyan-800 px-2 py-1 text-xs text-cyan-200">AI SUGGESTION · {suggestion.confidence}</span>
            <span className="text-xs text-stone-400">{suggestion.decision}</span>
          </div>
          <p className="text-sm text-stone-300">
            {suggestion.decision === "MATCH_EXISTING" ? `Suggested canonical entity: ${suggestedEntity?.canonicalName ?? "invalid candidate"}` : suggestion.decision === "CREATE_NEW" ? `Suggested new canonical name: ${suggestion.proposedCanonicalName ?? "—"}` : "AI could not make a safe identity suggestion."}
          </p>
          <p className="text-xs text-stone-500">{suggestion.rationale}</p>
          {suggestion.decision === "MATCH_EXISTING" && suggestedEntity ? (
            <div className="flex flex-wrap gap-2">
              <button className="citem-button-ghost" disabled={pending} type="button" onClick={() => void onResolve(group, { action: "LINK_EXISTING", entityId: suggestedEntity.id }, false)}>Confirm current group</button>
              <button className="citem-button" disabled={pending} type="button" onClick={() => void onResolve(group, { action: "LINK_EXISTING", entityId: suggestedEntity.id }, true)}>Confirm &amp; teach exact alias</button>
            </div>
          ) : null}
          {suggestion.decision === "CREATE_NEW" && suggestion.proposedCanonicalName ? (
            <div className="flex flex-wrap gap-2">
              <button className="citem-button-ghost" disabled={pending} type="button" onClick={() => void onResolve(group, { action: "CREATE_NEW", canonicalName: suggestion.proposedCanonicalName! }, false)}>Create &amp; resolve current group</button>
              <button className="citem-button" disabled={pending} type="button" onClick={() => void onResolve(group, { action: "CREATE_NEW", canonicalName: suggestion.proposedCanonicalName! }, true)}>Create &amp; teach exact alias</button>
            </div>
          ) : null}
        </div>
      ) : null}

      <details className="rounded border border-stone-800 p-3">
        <summary className="cursor-pointer text-sm text-stone-300">Manual resolution</summary>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-stone-500">Link to existing canonical entity</p>
            <select className="field w-full" value={selectedEntityId} onChange={(event) => setSelectedEntityId(event.target.value)}>
              <option value="">Select an existing {group.entityKind}</option>
              {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.canonicalName}</option>)}
            </select>
            <div className="flex flex-wrap gap-2">
              <button className="citem-button-ghost" type="button" disabled={pending || !selectedEntityId} onClick={() => void onResolve(group, { action: "LINK_EXISTING", entityId: selectedEntityId }, false)}>Link current group</button>
              <button className="citem-button" type="button" disabled={pending || !selectedEntityId} onClick={() => void onResolve(group, { action: "LINK_EXISTING", entityId: selectedEntityId }, true)}>Link &amp; teach alias</button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-stone-500">Create canonical entity</p>
            <input className="field w-full" value={canonicalName} onChange={(event) => setCanonicalName(event.target.value)} maxLength={500} />
            <div className="flex flex-wrap gap-2">
              <button className="citem-button-ghost" type="button" disabled={pending || !canonicalName.trim()} onClick={() => void onResolve(group, { action: "CREATE_NEW", canonicalName: canonicalName.trim() }, false)}>Create current group</button>
              <button className="citem-button" type="button" disabled={pending || !canonicalName.trim()} onClick={() => void onResolve(group, { action: "CREATE_NEW", canonicalName: canonicalName.trim() }, true)}>Create &amp; teach alias</button>
            </div>
          </div>
        </div>
      </details>
    </article>
  );
}
