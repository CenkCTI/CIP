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

type AutoOutcome = {
  groupKey: string;
  displayValue: string;
  status: "AUTO_RESOLVED" | "REVIEW";
  reason: string;
};

type AutoReport = {
  provider: string | null;
  model: string | null;
  groups_analyzed: number;
  auto_resolved: number;
  assertions_linked: number;
  review_remaining: number;
  rejected_by_safety_gate: number;
  unsure: number;
  generic_labels: number;
  conflicts: number;
  failed_writes: number;
  outcomes?: AutoOutcome[];
};

type ByokStatus = { connected?: boolean; provider?: string; providerId?: string; model?: string; state?: string };

const reasonLabels: Record<string, string> = {
  GENERIC_LABEL: "generic provider label",
  COMPETING_CANDIDATES: "multiple strong candidates",
  CONTEXT_CONFLICT: "conflicting product context",
  NOT_HIGH_CONFIDENCE: "AI confidence below HIGH",
  NOT_MATCH_EXISTING: "no existing identity match",
  CANDIDATE_NOT_ALLOWED: "candidate failed server validation",
  CANDIDATE_INACTIVE: "candidate is inactive",
  KIND_MISMATCH: "entity kind mismatch",
  CANDIDATE_NOT_STRONG: "match signal is not strong enough",
  KIND_NOT_ENABLED: "entity kind is not enabled for AI auto-resolution",
  DETERMINISTIC_KIND: "handled by deterministic resolver",
  WRITE_FAILED_SAFE: "trusted write failed safely",
};

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
  const [autoReport, setAutoReport] = useState<AutoReport | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const entityById = useMemo(() => new Map(entities.map((entity) => [entity.id, entity])), [entities]);
  const autoOutcomeByKey = useMemo(
    () => new Map((autoReport?.outcomes ?? []).map((outcome) => [outcome.groupKey, outcome])),
    [autoReport],
  );
  const autoResolvedKeys = useMemo(
    () => new Set((autoReport?.outcomes ?? []).filter((outcome) => outcome.status === "AUTO_RESOLVED").map((outcome) => outcome.groupKey)),
    [autoReport],
  );
  const reviewGroups = groups.filter((group) => !autoResolvedKeys.has(group.key));
  const visibleOccurrenceCount = reviewGroups.reduce((total, group) => total + group.occurrenceCount, 0);
  const remainingGroupCount = Math.max(0, totalGroupCount - autoResolvedKeys.size);

  async function analyze() {
    setMessage("Sending a bounded batch to your connected BYOK provider for suggestions only. No resolution will be saved.");
    startTransition(async () => {
      try {
        const response = await fetch("/api/techint/entities/suggest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ limit: Math.min(8, Math.max(reviewGroups.length, 1)) }),
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

  async function autoResolveSafe() {
    setMessage("AI is assessing a bounded batch. Only HIGH-confidence existing-entity matches that pass every server-side safety gate may be linked.");
    startTransition(async () => {
      try {
        const response = await fetch("/api/techint/entities/auto-resolve-ai", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ limit: Math.min(8, Math.max(reviewGroups.length, 1)) }),
        });
        const body = await response.json();
        if (!response.ok) {
          setMessage(body.error ?? "AI safe auto-resolution could not be completed.");
          return;
        }
        setAutoReport(body as AutoReport);
        setMessage(`AI assessed ${body.groups_analyzed ?? 0} group(s): ${body.auto_resolved ?? 0} auto-resolved, ${body.review_remaining ?? 0} left for analyst review. No alias or canonical entity was created.`);
      } catch {
        setMessage("AI safe auto-resolution failed without changing unresolved groups.");
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
              Each card represents one repeated identity label, not one source record. Deterministic rules, confirmed aliases and guarded AI automation reduce this queue before you make manual identity decisions.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded border border-stone-800 bg-stone-950/20 px-3 py-2">
              <p className="uppercase tracking-[0.13em] text-stone-500">Need decision</p>
              <p className="mt-1 text-lg font-semibold text-stone-200">{remainingGroupCount}</p>
            </div>
            <div className="rounded border border-stone-800 bg-stone-950/20 px-3 py-2">
              <p className="uppercase tracking-[0.13em] text-stone-500">Source occurrences</p>
              <p className="mt-1 text-lg font-semibold text-stone-200">{totalOccurrenceCount}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-800 pt-3 text-xs text-stone-500">
          <span className="rounded border border-stone-800 px-2 py-1">Showing {reviewGroups.length} of {remainingGroupCount} groups</span>
          <span className="rounded border border-stone-800 px-2 py-1">{visibleOccurrenceCount} occurrences in this visible queue</span>
          <span>Highest-repeat groups are shown first by the current bounded view.</span>
        </div>
      </div>

      <details className="card" open={Boolean(byok.connected)}>
        <summary className="cursor-pointer list-none">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`mt-1.5 h-2.5 w-2.5 rounded-full border ${byok.connected ? "border-cyan-700 bg-cyan-900/50" : "border-stone-700 bg-stone-900"}`} />
              <div>
                <p className="citem-eyebrow">AI analyst aid · optional</p>
                <h3 className="mt-1 text-base font-medium text-stone-200">{byok.connected ? `${byok.provider ?? byok.providerId ?? "BYOK"}${byok.model ? ` / ${byok.model}` : ""}` : "Connect NVIDIA NIM or another BYOK provider"}</h3>
                <p className="mt-1 text-xs text-stone-500">AI can suggest matches, or safely auto-link only a narrow subset that passes every structural gate.</p>
              </div>
            </div>
            <span className={`rounded border px-2.5 py-1.5 text-xs uppercase tracking-[0.13em] ${byok.connected ? "border-cyan-900 text-cyan-200" : "border-stone-800 text-stone-500"}`}>
              {byok.connected ? "Connected · controls available" : "Disconnected · open setup"}
            </span>
          </div>
        </summary>

        <div className="mt-4 space-y-4 border-t border-stone-800 pt-4">
          <div className="rounded border border-amber-900/60 bg-amber-950/10 p-3 text-xs text-stone-400">
            <b className="text-amber-200">Safety boundary:</b> AI confidence alone never authorizes a write. Automatic linking requires HIGH confidence, one strong ACTIVE same-kind candidate, no competing identity, no generic label and no conflicting product context. AI never creates an entity or teaches an alias automatically.
          </div>
          <ByokConnectionPanel scope="user" defaultProviderId="nvidia_nim" onStatusChange={setByok} />
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded border border-stone-800 bg-stone-950/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">Suggestion only</p>
              <p className="mt-2 text-sm text-stone-300">Ask AI for candidates without changing any resolution.</p>
              <p className="mt-1 text-xs text-stone-500">At most eight groups per call.</p>
              <button className="citem-button-ghost mt-3" type="button" disabled={pending || !byok.connected || !reviewGroups.length} onClick={analyze}>
                {pending ? "Working…" : "Analyze next 8 groups"}
              </button>
            </div>
            <div className="rounded border border-cyan-950 bg-cyan-950/10 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-700">AI auto resolution</p>
              <p className="mt-2 text-sm text-stone-300">Assess and auto-link only groups that pass every server-side safety gate.</p>
              <p className="mt-1 text-xs text-stone-500">Current-group links only. No automatic entity creation or alias teaching.</p>
              <button className="citem-button mt-3" type="button" disabled={pending || !byok.connected || !reviewGroups.length} onClick={autoResolveSafe}>
                {pending ? "Working…" : "Analyze & auto-resolve safe groups"}
              </button>
            </div>
          </div>
        </div>
      </details>

      {autoReport ? (
        <section className="card panel-corners border-l-2 border-l-cyan-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="citem-eyebrow">AI resolution report</p>
              <h3 className="citem-section-title mt-1">Guarded automation completed</h3>
              <p className="mt-1 text-xs text-stone-500">{autoReport.provider ?? "BYOK"}{autoReport.model ? ` / ${autoReport.model}` : ""} · no alias or canonical entity was created automatically.</p>
            </div>
            {autoReport.auto_resolved > 0 ? <button className="citem-button-ghost" type="button" onClick={() => window.location.reload()}>Refresh queue</button> : null}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-6">
            {[
              ["Analyzed", autoReport.groups_analyzed],
              ["Auto resolved", autoReport.auto_resolved],
              ["Needs review", autoReport.review_remaining],
              ["Generic", autoReport.generic_labels],
              ["Conflicts", autoReport.conflicts],
              ["Unsure", autoReport.unsure],
            ].map(([label, value]) => (
              <div className="rounded border border-stone-800 bg-stone-950/20 p-3" key={String(label)}>
                <p className="text-[10px] uppercase tracking-[0.12em] text-stone-600">{label}</p>
                <p className="mt-1 text-lg font-semibold text-stone-200">{value}</p>
              </div>
            ))}
          </div>
          {autoReport.failed_writes ? <p className="mt-3 text-xs text-amber-200">{autoReport.failed_writes} trusted write(s) failed safely. Check that additive migration 038 is applied to the intended environment before acceptance.</p> : null}
        </section>
      ) : null}

      {message ? (
        <div className="card border-l-2 border-l-cyan-900 text-sm text-cyan-200" role="status">
          <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-700">System message</p>
          <p className="mt-1">{message}</p>
        </div>
      ) : null}

      {!reviewGroups.length ? (
        <div className="card border-l-2 border-l-stone-700">
          <p className="text-sm font-medium text-stone-300">No analyst decision is required in the bounded view.</p>
          <p className="mt-1 text-xs text-stone-500">Deterministic identities, confirmed aliases and safe AI-verified links have handled this visible queue.</p>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {reviewGroups.map((group, index) => (
            <GroupCard
              key={group.key}
              index={index + 1}
              group={group}
              entities={entities.filter((entity) => entity.entityKind === group.entityKind)}
              suggestion={suggestions[group.key]}
              autoOutcome={autoOutcomeByKey.get(group.key)}
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
  autoOutcome,
  entityById,
  pending,
  onResolve,
}: {
  index: number;
  group: Group;
  entities: Entity[];
  suggestion?: Suggestion;
  autoOutcome?: AutoOutcome;
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

      {autoOutcome?.status === "REVIEW" ? (
        <div className={`mt-3 rounded border p-2.5 text-xs ${autoOutcome.reason === "GENERIC_LABEL" ? "border-amber-900/70 bg-amber-950/10 text-amber-200" : "border-stone-800 bg-stone-950/20 text-stone-400"}`}>
          <span className="font-semibold uppercase tracking-[0.12em]">{autoOutcome.reason === "GENERIC_LABEL" ? "Generic label" : "Review required"}</span>
          <span className="text-stone-600"> · </span>
          <span>{reasonLabels[autoOutcome.reason] ?? autoOutcome.reason.toLowerCase().replaceAll("_", " ")}</span>
        </div>
      ) : null}

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
            <p className="text-xs text-stone-500">No suggestion-only AI result loaded for this case.</p>
            <p className="mt-1 text-[11px] text-stone-600">Use guarded AI automation above or resolve manually below.</p>
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
