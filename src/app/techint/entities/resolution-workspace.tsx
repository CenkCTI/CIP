"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ByokConnectionPanel } from "@/components/ai/byok-connection-panel";
import { ENTITY_AI_MAX_RUN_GROUPS } from "@/lib/techint/entities/ai-batch";

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
  entityKind: string;
  displayValue: string;
  status: "AUTO_RESOLVED" | "REVIEW";
  reason: string;
  action: "LINK_EXISTING" | "CREATE_NEW" | "REVIEW_REQUIRED";
  decision: "MATCH_EXISTING" | "CREATE_NEW" | "UNSURE";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  candidateEntityId: string | null;
  proposedCanonicalName: string | null;
  canonicalName: string | null;
  entityId: string | null;
  assertionsLinked: number;
  created: boolean;
  rationale: string;
};

type AutoReport = {
  provider: string | null;
  model: string | null;
  groups_analyzed: number;
  model_batches: number;
  auto_resolved: number;
  auto_created: number;
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
  EXISTING_CANDIDATE_AVAILABLE: "an existing strong candidate must be reviewed instead of creating a duplicate",
  CONTEXT_INSUFFICIENT: "product context is not strong enough",
  CONTEXT_CONFLICT: "conflicting product context",
  CREATE_NAME_MISMATCH: "proposed canonical name changes the observed identity too much",
  NOT_HIGH_CONFIDENCE: "AI confidence below HIGH",
  UNSAFE_AI_DECISION: "AI did not return a safe automatic decision",
  CANDIDATE_NOT_ALLOWED: "candidate failed server validation",
  CANDIDATE_INACTIVE: "candidate is inactive",
  KIND_MISMATCH: "entity kind mismatch",
  CANDIDATE_NOT_STRONG: "match signal is not strong enough",
  KIND_NOT_ENABLED: "entity kind is not enabled for AI auto-resolution",
  DETERMINISTIC_KIND: "handled by deterministic resolver",
  WRITE_FAILED_SAFE: "trusted write failed safely",
  WRITE_PARTIAL_SAFE: "some assertions were linked but the case remains open because the whole group did not complete",
  SAFE_HIGH_CREATE: "safe HIGH-confidence canonical identity created and the full group resolved",
  SAFE_HIGH_MATCH: "safe HIGH-confidence existing identity linked and the full group resolved",
};

export function EntityResolutionWorkspace({
  groups,
  entities,
  totalGroupCount,
  totalOccurrenceCount,
  children,
}: {
  groups: Group[];
  entities: Entity[];
  totalGroupCount: number;
  totalOccurrenceCount: number;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [byok, setByok] = useState<ByokStatus>({ connected: false });
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [autoReport, setAutoReport] = useState<AutoReport | null>(null);
  const [resolvedGroupKeys, setResolvedGroupKeys] = useState<Set<string>>(() => new Set());
  const [batchLimit, setBatchLimit] = useState(8);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const entityById = useMemo(() => new Map(entities.map((entity) => [entity.id, entity])), [entities]);
  const groupByKey = useMemo(() => new Map(groups.map((group) => [group.key, group])), [groups]);
  const autoOutcomeByKey = useMemo(
    () => new Map((autoReport?.outcomes ?? []).map((outcome) => [outcome.groupKey, outcome])),
    [autoReport],
  );
  const reviewGroups = groups.filter((group) => !resolvedGroupKeys.has(group.key));
  const locallyResolvedVisibleGroups = groups.filter((group) => resolvedGroupKeys.has(group.key));
  const locallyResolvedOccurrenceCount = locallyResolvedVisibleGroups.reduce((total, group) => total + group.occurrenceCount, 0);
  const visibleGroupCount = reviewGroups.length;
  const visibleOccurrenceCount = reviewGroups.reduce((total, group) => total + group.occurrenceCount, 0);
  const remainingGroupCount = Math.max(0, totalGroupCount - locallyResolvedVisibleGroups.length);
  const remainingOccurrenceCount = Math.max(0, totalOccurrenceCount - locallyResolvedOccurrenceCount);
  const selectedBatchCount = Math.min(batchLimit, remainingGroupCount);

  function rememberResolvedKeys(keys: string[]) {
    if (!keys.length) return;
    setResolvedGroupKeys((current) => {
      const next = new Set(current);
      for (const key of keys) next.add(key);
      return next;
    });
  }

  async function analyze() {
    if (selectedBatchCount < 1) return;
    setMessage(`Sending the first ${selectedBatchCount} unresolved group(s) in queue order to your connected BYOK provider for suggestions only. No resolution will be saved.`);
    startTransition(async () => {
      try {
        const response = await fetch("/api/techint/entities/suggest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ limit: selectedBatchCount }),
        });
        const body = await response.json();
        if (!response.ok) {
          setMessage(body.error ?? "AI suggestions could not be generated.");
          return;
        }
        const next: Record<string, Suggestion> = {};
        for (const suggestion of (body.suggestions ?? []) as Suggestion[]) next[suggestion.groupKey] = suggestion;
        setSuggestions((current) => ({ ...current, ...next }));
        setMessage(`Generated ${Object.keys(next).length} non-authoritative suggestion(s) in ${body.model_batches ?? 0} bounded model batch(es) with ${body.provider ?? "BYOK"}${body.model ? ` / ${body.model}` : ""}. Existing AI results for other open cases were preserved.`);
      } catch {
        setMessage("AI entity suggestions could not be generated.");
      }
    });
  }

  async function autoResolveSafe() {
    if (selectedBatchCount < 1) return;
    setMessage(`AI is assessing the first ${selectedBatchCount} unresolved group(s) in queue order. Safe groups will be written and closed automatically; ambiguous groups will remain for analyst review.`);
    startTransition(async () => {
      try {
        const response = await fetch("/api/techint/entities/auto-resolve-ai", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ limit: selectedBatchCount }),
        });
        const body = await response.json();
        if (!response.ok) {
          setMessage(body.error ?? "AI safe auto-resolution could not be completed.");
          return;
        }

        const report = body as AutoReport;
        const outcomes = report.outcomes ?? [];
        const resolvedKeys = outcomes.filter((outcome) => outcome.status === "AUTO_RESOLVED").map((outcome) => outcome.groupKey);
        rememberResolvedKeys(resolvedKeys);
        setAutoReport(report);
        setSuggestions((current) => {
          const next = { ...current };
          for (const outcome of outcomes) {
            if (outcome.status === "AUTO_RESOLVED") {
              delete next[outcome.groupKey];
              continue;
            }
            const group = groupByKey.get(outcome.groupKey);
            if (!group) continue;
            next[outcome.groupKey] = {
              groupKey: outcome.groupKey,
              entityKind: group.entityKind,
              displayValue: group.displayValue,
              normalizedValue: group.normalizedValue,
              occurrenceCount: group.occurrenceCount,
              decision: outcome.decision,
              candidateEntityId: outcome.candidateEntityId,
              proposedCanonicalName: outcome.proposedCanonicalName,
              confidence: outcome.confidence,
              rationale: outcome.rationale,
            };
          }
          return next;
        });
        setMessage(`AI assessed ${report.groups_analyzed ?? 0} group(s) in ${report.model_batches ?? 0} bounded model batch(es): ${report.auto_resolved ?? 0} case(s) closed automatically, ${report.auto_created ?? 0} canonical identity(s) created, ${report.assertions_linked ?? 0} assertion(s) linked, and ${report.review_remaining ?? 0} case(s) left for analyst review. No alias was taught automatically.`);
        router.refresh();
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

        const complete = body.failed === 0 && !body.truncated && body.linked === body.matched;
        if (complete) {
          rememberResolvedKeys([group.key]);
          setSuggestions((current) => {
            const next = { ...current };
            delete next[group.key];
            return next;
          });
        }
        setMessage(
          complete
            ? `Resolved ${body.linked}/${body.matched} current assertion(s)${rememberAlias ? " and remembered the exact alias for future reconciliation" : ""}. AI analyses for every other open case were preserved.`
            : `Resolved ${body.linked}/${body.matched} current assertion(s), but this case remains open because ${body.failed ? `${body.failed} write(s) failed` : "the bounded group was truncated"}. Other AI analyses were preserved.`,
        );
        router.refresh();
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
            <h2 className="citem-section-title mt-1">Exception review, not data cleaning</h2>
            <p className="mt-2 max-w-3xl text-sm text-stone-400">
              Repeated labels are collapsed into compact cases. Safe deterministic, alias and AI-verified decisions are removed before analyst review.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded border border-stone-800 bg-stone-950/20 px-3 py-2">
              <p className="uppercase tracking-[0.13em] text-stone-500">Need decision</p>
              <p className="mt-1 text-lg font-semibold text-stone-200">{remainingGroupCount}</p>
            </div>
            <div className="rounded border border-stone-800 bg-stone-950/20 px-3 py-2">
              <p className="uppercase tracking-[0.13em] text-stone-500">Occurrences</p>
              <p className="mt-1 text-lg font-semibold text-stone-200">{remainingOccurrenceCount}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-800 pt-3 text-xs text-stone-500">
          <span className="rounded border border-stone-800 px-2 py-1">Showing {visibleGroupCount} of {remainingGroupCount} groups</span>
          <span className="rounded border border-stone-800 px-2 py-1">{visibleOccurrenceCount} visible occurrences</span>
          <span>Use the triangle on a case only when you need evidence or manual controls.</span>
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
                <p className="mt-1 text-xs text-stone-500">AI may propose candidates and CİTEM may automatically execute only narrowly gated HIGH-confidence decisions.</p>
              </div>
            </div>
            <span className={`rounded border px-2.5 py-1.5 text-xs uppercase tracking-[0.13em] ${byok.connected ? "border-cyan-900 text-cyan-200" : "border-stone-800 text-stone-500"}`}>
              {byok.connected ? "Connected · controls available" : "Disconnected · open setup"}
            </span>
          </div>
        </summary>

        <div className="mt-4 space-y-4 border-t border-stone-800 pt-4">
          <div className="rounded border border-amber-900/60 bg-amber-950/10 p-3 text-xs text-stone-400">
            <b className="text-amber-200">Safety boundary:</b> AI confidence alone never authorizes a write. Existing matches require one strong ACTIVE same-kind candidate. CREATE_NEW is limited to a HIGH-confidence identity-equivalent name with no strong existing candidate, no generic label, and safe context. AI never teaches an alias automatically.
          </div>
          <ByokConnectionPanel scope="user" defaultProviderId="nvidia_nim" onStatusChange={setByok} />

          <div className="rounded border border-stone-800 bg-stone-950/20 p-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600" htmlFor="entity-ai-batch-limit">AI case count</label>
                <p className="mt-1 text-xs text-stone-500">Choose 0–{ENTITY_AI_MAX_RUN_GROUPS}. The selected batch applies to the full unresolved queue, while this page keeps only a bounded visible case list.</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <input
                  id="entity-ai-batch-limit"
                  className="field w-24"
                  type="number"
                  min={0}
                  max={ENTITY_AI_MAX_RUN_GROUPS}
                  step={1}
                  value={batchLimit}
                  onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber;
                    setBatchLimit(Number.isFinite(value) ? Math.min(ENTITY_AI_MAX_RUN_GROUPS, Math.max(0, Math.trunc(value))) : 0);
                  }}
                />
                <span className="rounded border border-stone-800 px-2.5 py-2 text-xs text-stone-400">{selectedBatchCount} selected now</span>
                <span className="rounded border border-stone-800 px-2.5 py-2 text-xs text-stone-500">{visibleGroupCount} visible on page</span>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-stone-600">Provider calls remain bounded internally to at most 8 cases per model request even when you select more. The API request uses the selected full-queue batch, not the visible-page count.</p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded border border-stone-800 bg-stone-950/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">Suggestion only</p>
              <p className="mt-2 text-sm text-stone-300">Ask AI for candidates without changing any resolution.</p>
              <p className="mt-1 text-xs text-stone-500">Existing AI analyses on other open cases stay intact.</p>
              <button className="citem-button-ghost mt-3" type="button" disabled={pending || !byok.connected || selectedBatchCount < 1} onClick={analyze}>
                {pending ? "Working…" : `Analyze next ${selectedBatchCount} group${selectedBatchCount === 1 ? "" : "s"}`}
              </button>
            </div>
            <div className="rounded border border-cyan-950 bg-cyan-950/10 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-700">AI auto resolution</p>
              <p className="mt-2 text-sm text-stone-300">Analyze, write safe matches/bootstraps, and close only fully resolved cases automatically.</p>
              <p className="mt-1 text-xs text-stone-500">No automatic alias teaching. Ambiguity or partial write always stays in review.</p>
              <button className="citem-button mt-3" type="button" disabled={pending || !byok.connected || selectedBatchCount < 1} onClick={autoResolveSafe}>
                {pending ? "Working…" : `Analyze & auto-resolve ${selectedBatchCount} safe group${selectedBatchCount === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      </details>

      {children ? <div>{children}</div> : null}

      {autoReport ? (
        <section className="card panel-corners border-l-2 border-l-cyan-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="citem-eyebrow">AI resolution report</p>
              <h3 className="citem-section-title mt-1">Guarded automation completed</h3>
              <p className="mt-1 text-xs text-stone-500">{autoReport.provider ?? "BYOK"}{autoReport.model ? ` / ${autoReport.model}` : ""} · {autoReport.model_batches ?? 0} bounded model batch(es) · aliases were never taught automatically.</p>
            </div>
            <button className="citem-button-ghost" type="button" onClick={() => router.refresh()}>Sync queue</button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-7">
            {[
              ["Analyzed", autoReport.groups_analyzed],
              ["Auto resolved", autoReport.auto_resolved],
              ["Auto created", autoReport.auto_created],
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

          {(autoReport.outcomes ?? []).length ? (
            <div className="mt-4 space-y-2 border-t border-stone-800 pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">Run activity</p>
              {(autoReport.outcomes ?? []).map((outcome, index) => (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-stone-800 bg-stone-950/20 px-3 py-2" key={`${outcome.groupKey}-${index}`}>
                  <span className={`rounded border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] ${outcome.status === "AUTO_RESOLVED" ? "border-cyan-900 text-cyan-200" : "border-amber-900/70 text-amber-200"}`}>
                    {outcome.status === "AUTO_RESOLVED" ? (outcome.created ? "Auto created + resolved" : "Auto linked + resolved") : "Review required"}
                  </span>
                  <span className="text-xs font-medium text-stone-200">{outcome.displayValue}</span>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-stone-600">{outcome.entityKind}</span>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-stone-500">AI {outcome.confidence} · {outcome.decision}</span>
                  {outcome.canonicalName ? <span className="text-xs text-stone-400">→ {outcome.canonicalName}</span> : null}
                  <span className="text-xs text-stone-500">{outcome.assertionsLinked} assertion(s) linked</span>
                  <span className="text-xs text-stone-600">{reasonLabels[outcome.reason] ?? outcome.reason.toLowerCase().replaceAll("_", " ")}</span>
                </div>
              ))}
            </div>
          ) : null}

          {autoReport.failed_writes ? <p className="mt-3 text-xs text-amber-200">{autoReport.failed_writes} trusted write(s) failed safely. Any partially completed case stays in analyst review; confirm additive migrations 038 and 039 are applied to the intended Preview/test environment before acceptance.</p> : null}
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
          <p className="mt-1 text-xs text-stone-500">Deterministic identities, confirmed aliases and guarded AI decisions have handled this visible queue.</p>
        </div>
      ) : (
        <div className="space-y-2">
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
  const [expanded, setExpanded] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [canonicalName, setCanonicalName] = useState(group.displayValue);
  const suggestedEntity = suggestion?.candidateEntityId ? entityById.get(suggestion.candidateEntityId) : null;
  const sourceCount = group.sourceSystems.length;

  return (
    <article className="card panel-corners border-l-2 border-l-stone-800 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} case details for ${group.displayValue}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-stone-800 bg-stone-950/20 text-xs text-stone-500 hover:border-amber-900 hover:text-amber-200"
          type="button"
          onClick={() => setExpanded((value) => !value)}
        >
          <span className={`transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
        </button>

        <div className="min-w-[190px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] tracking-[0.18em] text-stone-600">CASE {String(index).padStart(2, "0")}</span>
            <span className="rounded border border-amber-900/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-amber-200">{group.entityKind}</span>
            {autoOutcome?.status === "REVIEW" ? <span className="text-[10px] uppercase tracking-[0.13em] text-stone-600">Review required</span> : null}
          </div>
          <h3 className="mt-1 truncate text-base font-medium text-stone-100">{group.displayValue}</h3>
        </div>

        <div className="flex shrink-0 items-center gap-4 text-right">
          <div>
            <p className="text-sm font-semibold text-stone-200">{group.occurrenceCount}</p>
            <p className="text-[9px] uppercase tracking-[0.13em] text-stone-600">occurrences</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-stone-300">{sourceCount || "—"}</p>
            <p className="text-[9px] uppercase tracking-[0.13em] text-stone-600">source{sourceCount === 1 ? "" : "s"}</p>
          </div>
        </div>

        {suggestion ? (
          <div className={`shrink-0 rounded border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${suggestion.confidence === "HIGH" ? "border-cyan-900 text-cyan-200" : "border-stone-800 text-stone-500"}`}>
            AI {suggestion.confidence}
          </div>
        ) : (
          <div className="shrink-0 rounded border border-stone-800 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.13em] text-stone-600">AI —</div>
        )}

        {suggestion?.decision === "MATCH_EXISTING" && suggestedEntity ? (
          <div className="flex flex-wrap gap-2">
            <button className="citem-button-ghost" disabled={pending} type="button" onClick={() => void onResolve(group, { action: "LINK_EXISTING", entityId: suggestedEntity.id }, false)}>Resolve group</button>
            <button className="citem-button" disabled={pending} type="button" onClick={() => void onResolve(group, { action: "LINK_EXISTING", entityId: suggestedEntity.id }, true)}>Resolve + teach alias</button>
          </div>
        ) : null}

        {suggestion?.decision === "CREATE_NEW" && suggestion.proposedCanonicalName ? (
          <div className="flex flex-wrap gap-2">
            <button className="citem-button-ghost" disabled={pending} type="button" onClick={() => void onResolve(group, { action: "CREATE_NEW", canonicalName: suggestion.proposedCanonicalName! }, false)}>Create &amp; resolve</button>
            <button className="citem-button" disabled={pending} type="button" onClick={() => void onResolve(group, { action: "CREATE_NEW", canonicalName: suggestion.proposedCanonicalName! }, true)}>Create &amp; teach exact alias</button>
          </div>
        ) : null}
      </div>

      {expanded ? (
        <div className="mt-3 space-y-3 border-t border-stone-800 pt-3">
          {autoOutcome?.status === "REVIEW" ? (
            <div className={`rounded border p-2.5 text-xs ${autoOutcome.reason === "GENERIC_LABEL" ? "border-amber-900/70 bg-amber-950/10 text-amber-200" : "border-stone-800 bg-stone-950/20 text-stone-400"}`}>
              <span className="font-semibold uppercase tracking-[0.12em]">{autoOutcome.reason === "GENERIC_LABEL" ? "Generic label" : "Review required"}</span>
              <span className="text-stone-600"> · </span>
              <span>{reasonLabels[autoOutcome.reason] ?? autoOutcome.reason.toLowerCase().replaceAll("_", " ")}</span>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
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
            <div className="rounded border border-stone-800 bg-stone-950/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">Context snapshot</p>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-stone-400">
                {group.sampleSignalTitles.map((title) => <li key={title}><span className="mr-2 text-stone-700">—</span>{title}</li>)}
              </ul>
            </div>
          ) : null}

          {suggestion ? (
            <div className="rounded border border-cyan-950 bg-cyan-950/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-cyan-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-200">AI candidate</span>
                <span className="text-[10px] uppercase tracking-[0.12em] text-stone-500">{suggestion.confidence} confidence</span>
                <span className="font-mono text-[10px] text-stone-600">{suggestion.decision}</span>
              </div>
              <p className="mt-2 text-sm font-medium text-stone-200">
                {suggestion.decision === "MATCH_EXISTING"
                  ? suggestedEntity?.canonicalName ?? "Invalid candidate"
                  : suggestion.decision === "CREATE_NEW"
                    ? suggestion.proposedCanonicalName ?? "—"
                    : "No safe match proposed"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-stone-500">{suggestion.rationale}</p>
            </div>
          ) : (
            <div className="rounded border border-dashed border-stone-800 p-3 text-xs text-stone-500">No suggestion-only AI result loaded for this case.</div>
          )}

          <div className="rounded border border-stone-800 bg-stone-950/20 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">Manual decision controls</p>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-xs text-stone-400">Link to an existing {group.entityKind}</p>
                <select className="field mt-2 w-full" value={selectedEntityId} onChange={(event) => setSelectedEntityId(event.target.value)}>
                  <option value="">Select existing identity</option>
                  {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.canonicalName}</option>)}
                </select>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="citem-button-ghost" type="button" disabled={pending || !selectedEntityId} onClick={() => void onResolve(group, { action: "LINK_EXISTING", entityId: selectedEntityId }, false)}>Link group</button>
                  <button className="citem-button" type="button" disabled={pending || !selectedEntityId} onClick={() => void onResolve(group, { action: "LINK_EXISTING", entityId: selectedEntityId }, true)}>Link + teach alias</button>
                </div>
              </div>
              <div>
                <p className="text-xs text-stone-400">Create a new canonical identity</p>
                <input className="field mt-2 w-full" value={canonicalName} onChange={(event) => setCanonicalName(event.target.value)} maxLength={500} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="citem-button-ghost" type="button" disabled={pending || !canonicalName.trim()} onClick={() => void onResolve(group, { action: "CREATE_NEW", canonicalName: canonicalName.trim() }, false)}>Create for group</button>
                  <button className="citem-button" type="button" disabled={pending || !canonicalName.trim()} onClick={() => void onResolve(group, { action: "CREATE_NEW", canonicalName: canonicalName.trim() }, true)}>Create + teach alias</button>
                </div>
              </div>
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
      ) : null}
    </article>
  );
}
