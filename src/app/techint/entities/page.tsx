import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { buildAliasRecommendations } from "@/lib/techint/entities/alias-recommendations";
import { groupUnresolvedAssertions } from "@/lib/techint/entities/grouping";
import {
  listTechnicalEntities,
  listTechnicalEntityAliases,
  listTechnicalEntityAssertions,
  listTechnicalEntityAssertionsByIds,
  listTechnicalEntityAuditEvents,
  listTechnicalEntityResolutions,
  listTechnicalEntityResolutionsForAssertions,
  listTechnicalObservationLabels,
  listTechnicalSignalLabels,
} from "@/lib/techint/entities/queries";
import type { TechnicalEntityKind } from "@/lib/techint/entities/types";
import {
  addEntityAlias,
  createTechnicalEntity,
  reconcileTechnicalEntities,
  renameEntity,
  resetEntityAssertion,
  revokeEntityAlias,
  setEntityStatus,
} from "./actions";
import { EntityResolutionWorkspace } from "./resolution-workspace";

const deterministicKinds = new Set<TechnicalEntityKind>(["CVE", "INDICATOR", "ATTACK_TECHNIQUE"]);

function time(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function text(value: unknown) {
  return value == null ? "—" : String(value);
}

function auditActionLabel(value: unknown) {
  const labels: Record<string, string> = {
    ENTITY_CREATED: "Canonical identity created",
    ENTITY_RENAMED: "Canonical identity renamed",
    ENTITY_ARCHIVED: "Canonical identity archived",
    ENTITY_RESTORED: "Canonical identity restored",
    ALIAS_CONFIRMED: "Exact alias confirmed",
    ALIAS_REVOKED: "Exact alias revoked",
    ASSERTION_AUTO_RESOLVED: "Source assertion auto-resolved",
    ASSERTION_ANALYST_RESOLVED: "Analyst confirmed identity",
    ASSERTION_DISMISSED: "Source assertion dismissed",
    ASSERTION_RESET_TO_REVIEW: "Source assertion returned to review",
  };
  const key = String(value ?? "");
  return labels[key] ?? key.replaceAll("_", " ").toLowerCase();
}

export default async function Page() {
  const { supabase } = await requireUser();
  const [entityResult, aliasResult, assertionResult, auditResult, recentResolutionResult] = await Promise.all([
    listTechnicalEntities(supabase, 300),
    listTechnicalEntityAliases(supabase),
    listTechnicalEntityAssertions(supabase, 500),
    listTechnicalEntityAuditEvents(supabase),
    listTechnicalEntityResolutions(supabase, 500),
  ]);
  const assertions = (assertionResult.data ?? []) as Array<Record<string, unknown>>;
  const assertionIds = assertions.map((row) => String(row.id));
  const resolutionResult = await listTechnicalEntityResolutionsForAssertions(supabase, assertionIds);

  const migrationMissing = Boolean(entityResult.error || aliasResult.error || resolutionResult.error || auditResult.error || recentResolutionResult.error);
  const entities = (entityResult.data ?? []) as Array<Record<string, unknown>>;
  const aliases = (aliasResult.data ?? []) as Array<Record<string, unknown>>;
  const resolutions = (resolutionResult.data ?? []) as Array<Record<string, unknown>>;
  const recentResolutions = (recentResolutionResult.data ?? []) as Array<Record<string, unknown>>;
  const audits = (auditResult.data ?? []) as Array<Record<string, unknown>>;
  const typedAssertions = assertions.map((row) => ({
    id: String(row.id),
    entity_kind: String(row.entity_kind) as TechnicalEntityKind,
    display_value: String(row.display_value ?? ""),
    normalized_value: String(row.normalized_value ?? row.display_value ?? ""),
    semantic_role: row.semantic_role ? String(row.semantic_role) : null,
    source_observation_id: row.source_observation_id ? String(row.source_observation_id) : null,
    signal_id: row.signal_id ? String(row.signal_id) : null,
  }));
  const typedResolutions = resolutions.map((row) => ({ assertion_id: String(row.assertion_id), status: String(row.status) }));
  const groups = groupUnresolvedAssertions(typedAssertions, typedResolutions);
  const ambiguousGroups = groups.filter((group) => !deterministicKinds.has(group.entityKind));
  const deterministicPending = groups
    .filter((group) => deterministicKinds.has(group.entityKind))
    .reduce((sum, group) => sum + group.occurrenceCount, 0);
  const resolvedCount = resolutions.filter((row) => row.status === "RESOLVED").length;
  const dismissed = resolutions.filter((row) => row.status === "DISMISSED");
  const ambiguousOccurrenceCount = ambiguousGroups.reduce((sum, group) => sum + group.occurrenceCount, 0);

  const observationIds = [...new Set(ambiguousGroups.flatMap((group) => group.sourceObservationIds))].slice(0, 500);
  const signalIds = [...new Set(ambiguousGroups.flatMap((group) => group.signalIds))].slice(0, 500);
  const [{ data: observationRows }, { data: signalRows }] = await Promise.all([
    listTechnicalObservationLabels(supabase, observationIds),
    listTechnicalSignalLabels(supabase, signalIds),
  ]);
  const observationById = new Map(((observationRows ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row]));
  const signalById = new Map(((signalRows ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row]));
  const uiGroups = ambiguousGroups.slice(0, 100).map((group) => ({
    key: group.key,
    entityKind: group.entityKind,
    displayValue: group.displayValue,
    normalizedValue: group.normalizedValue,
    occurrenceCount: group.occurrenceCount,
    semanticRoles: group.semanticRoles,
    sourceSystems: [...new Set(group.sourceObservationIds.map((id) => String(observationById.get(id)?.source_system ?? "")).filter(Boolean))].slice(0, 8),
    sampleSignalTitles: [...new Set(group.signalIds.map((id) => String(signalById.get(id)?.title ?? "")).filter(Boolean))].slice(0, 3),
  }));
  const activeEntities = entities
    .filter((row) => row.status === "ACTIVE")
    .map((row) => ({ id: String(row.id), entityKind: String(row.entity_kind), canonicalName: String(row.canonical_name) }));
  const analystEntities = entities.filter((row) => !row.deterministic_key);
  const deterministicEntities = entities.filter((row) => Boolean(row.deterministic_key));
  const entityNameById = new Map(entities.map((row) => [String(row.id), String(row.canonical_name ?? "Unknown entity")]));
  const assertionNameById = new Map(assertions.map((row) => [String(row.id), String(row.display_value ?? "Unknown source label")]));

  const recommendationAssertionIds = [...new Set(recentResolutions.map((row) => String(row.assertion_id ?? "")).filter(Boolean))].slice(0, 500);
  const { data: recommendationAssertionRows } = await listTechnicalEntityAssertionsByIds(supabase, recommendationAssertionIds);
  const recommendationAssertions = (recommendationAssertionRows ?? []) as Array<Record<string, unknown>>;
  const recommendationObservationIds = [...new Set(recommendationAssertions.map((row) => String(row.source_observation_id ?? "")).filter(Boolean))].slice(0, 500);
  const { data: recommendationObservationRows } = await listTechnicalObservationLabels(supabase, recommendationObservationIds);
  const aliasRecommendations = buildAliasRecommendations({
    resolutions: recentResolutions,
    assertions: recommendationAssertions,
    entities,
    aliases,
    observations: (recommendationObservationRows ?? []) as Array<Record<string, unknown>>,
    minimumObservations: 3,
    limit: 12,
  });

  return (
    <section className="space-y-5">
      <header className="citem-page-header">
        <div>
          <p className="citem-eyebrow">CİTEM / TechINT / Resolution Control</p>
          <h1 className="citem-title">Entity Resolution Control</h1>
          <p className="citem-subtitle">
            CİTEM resolves safe identities automatically. You only decide the source labels that remain genuinely ambiguous.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="citem-button-ghost" href="/techint/sources">Technical Sources</Link>
          <Link className="citem-button-ghost" href="/techint">Global View</Link>
        </div>
      </header>

      <section className="card panel-corners border-l-2 border-l-amber-500/60">
        <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr] xl:items-center">
          <div>
            <p className="citem-eyebrow">Operational status</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-3xl font-semibold text-stone-100">{ambiguousGroups.length}</p>
              <p className="text-sm uppercase tracking-[0.16em] text-amber-200">identity groups require analyst review</p>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-stone-400">
              {ambiguousOccurrenceCount} unresolved source occurrences have already been collapsed into reusable decision groups. You are reviewing identities, not cleaning individual records.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded border border-stone-800 bg-stone-950/20 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-stone-500">Resolved</p>
              <p className="mt-1 text-xl font-semibold text-stone-100">{resolvedCount}</p>
            </div>
            <div className="rounded border border-stone-800 bg-stone-950/20 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-stone-500">Auto queue</p>
              <p className="mt-1 text-xl font-semibold text-stone-100">{deterministicPending}</p>
            </div>
            <div className="rounded border border-stone-800 bg-stone-950/20 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-stone-500">Dismissed</p>
              <p className="mt-1 text-xl font-semibold text-stone-100">{dismissed.length}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-2 lg:grid-cols-3">
        <div className="card border-l-2 border-l-stone-700">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold tracking-[0.2em] text-stone-500">01</span>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-300">Source truth</p>
          </div>
          <p className="mt-2 text-sm text-stone-500">Provider labels and provenance stay untouched as immutable source evidence.</p>
        </div>
        <div className="card border-l-2 border-l-amber-900/80">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold tracking-[0.2em] text-amber-300">02</span>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-300">Automatic resolution</p>
          </div>
          <p className="mt-2 text-sm text-stone-500">CVE, Indicator, ATT&amp;CK and known exact aliases are resolved without analyst work.</p>
        </div>
        <div className="card border-l-2 border-l-amber-500/60">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold tracking-[0.2em] text-amber-200">03</span>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-300">Analyst decision</p>
          </div>
          <p className="mt-2 text-sm text-stone-500">Only ambiguous identity groups reach you. AI may advise; you remain the decision authority.</p>
        </div>
      </section>

      {migrationMissing ? (
        <div className="card border border-amber-900 text-amber-200">
          Phase 2.3D tables are not available in this database yet. Apply the authorized Phase 2.3D migrations, reload PostgREST, then redeploy.
        </div>
      ) : null}

      <section className="card panel-corners">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex gap-3">
            <div className="mt-1 h-2.5 w-2.5 rounded-full border border-amber-700 bg-amber-900/40" />
            <div>
              <p className="citem-eyebrow">Safe automation</p>
              <h2 className="citem-section-title mt-1">{deterministicPending ? `${deterministicPending} safe occurrence(s) waiting` : "Automatic queue is clear"}</h2>
              <p className="mt-2 max-w-3xl text-sm text-stone-500">
                Successful Technical Source syncs now run this deterministic/confirmed-alias reconciliation automatically. This manual control remains for replay or recovery; it never calls providers or AI.
              </p>
            </div>
          </div>
          <form action={reconcileTechnicalEntities} className="flex items-end gap-2">
            <div>
              <label className="block text-[11px] uppercase tracking-[0.14em] text-stone-500">Batch</label>
              <input className="field w-24" name="limit" type="number" min="1" max="500" defaultValue="500" />
            </div>
            <button className={deterministicPending ? "citem-button" : "citem-button-ghost"} type="submit">
              {deterministicPending ? "Resolve safe queue" : "Re-run resolver"}
            </button>
          </form>
        </div>
      </section>

      <EntityResolutionWorkspace
        groups={uiGroups}
        entities={activeEntities}
        totalGroupCount={ambiguousGroups.length}
        totalOccurrenceCount={ambiguousOccurrenceCount}
      />

      <section className="card panel-corners border-l-2 border-l-amber-900/80">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="citem-eyebrow">Learning without autonomous taxonomy writes</p>
            <h2 className="citem-section-title mt-1">Alias recommendations</h2>
            <p className="mt-2 max-w-3xl text-sm text-stone-500">
              CİTEM recommends an exact reusable mapping only after the same label has been directly resolved to one canonical identity across at least three source observations with no conflicting direct target. You confirm it once; later exact matches resolve automatically after sync without AI.
            </p>
          </div>
          <span className="rounded border border-stone-800 px-2.5 py-1.5 text-xs text-stone-500">{aliasRecommendations.length} recommendation(s)</span>
        </div>

        {!aliasRecommendations.length ? (
          <p className="mt-4 text-sm text-stone-500">No repeated direct mapping is mature enough for an exact-alias recommendation yet.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {aliasRecommendations.map((recommendation) => (
              <article className="rounded border border-stone-800 bg-stone-950/20 p-3" key={`${recommendation.entityKind}:${recommendation.normalizedValue}:${recommendation.entityId}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded border border-amber-900/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-amber-200">{recommendation.entityKind}</span>
                  <div className="min-w-[220px] flex-1">
                    <p className="text-sm font-medium text-stone-200">{recommendation.displayValue} <span className="text-stone-600">→</span> {recommendation.canonicalName}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {recommendation.observationCount} direct observations · {recommendation.sourceSystems.length} source system(s) · {recommendation.aiVerifiedCount} AI-verified · {recommendation.analystConfirmedCount} analyst-confirmed
                      {recommendation.latestResolvedAt ? ` · latest ${time(recommendation.latestResolvedAt)}` : ""}
                    </p>
                  </div>
                  <form action={addEntityAlias.bind(null, recommendation.entityId)}>
                    <input type="hidden" name="displayValue" value={recommendation.displayValue} />
                    <button className="citem-button" type="submit">Confirm exact alias</button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {dismissed.length ? (
        <details className="card">
          <summary className="cursor-pointer list-none">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="citem-eyebrow">Deferred decisions</p>
                <h2 className="citem-section-title mt-1">{dismissed.length} dismissed assertion(s)</h2>
              </div>
              <span className="text-xs uppercase tracking-[0.14em] text-stone-500">Open list</span>
            </div>
          </summary>
          <div className="mt-4 flex flex-wrap gap-2">
            {dismissed.slice(0, 30).map((resolution) => (
              <form key={String(resolution.id)} action={resetEntityAssertion.bind(null, String(resolution.assertion_id))}>
                <button className="citem-button-ghost" type="submit">Return {String(resolution.assertion_id).slice(0, 8)}… to review</button>
              </form>
            ))}
          </div>
        </details>
      ) : null}

      <details className="card panel-corners">
        <summary className="cursor-pointer list-none">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="citem-eyebrow">Canonical registry</p>
              <h2 className="citem-section-title mt-1">Stable TechINT identities</h2>
              <p className="mt-1 text-sm text-stone-500">Manage analyst-owned names and aliases here. Deterministic CVEs stay out of the main decision surface.</p>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="rounded border border-stone-800 px-2.5 py-1.5 text-stone-400">{analystEntities.length} analyst</span>
              <span className="rounded border border-stone-800 px-2.5 py-1.5 text-stone-400">{deterministicEntities.length} deterministic</span>
              <span className="rounded border border-amber-900/70 px-2.5 py-1.5 text-amber-200">Open registry</span>
            </div>
          </div>
        </summary>

        <div className="mt-5 space-y-5 border-t border-stone-800 pt-5">
          <section>
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Create analyst identity</p>
              <p className="mt-1 text-xs text-stone-500">Use only when the reviewed source label represents a real reusable entity.</p>
            </div>
            <form action={createTechnicalEntity} className="grid gap-2 rounded border border-stone-800 bg-stone-950/20 p-3 md:grid-cols-4">
              <select className="field" name="kind" defaultValue="MALWARE">
                {["THREAT_ACTOR", "MALWARE", "CAMPAIGN", "VENDOR", "PRODUCT", "SECTOR", "COUNTRY", "REGION", "TAG"].map((kind) => <option key={kind}>{kind}</option>)}
              </select>
              <input className="field md:col-span-2" name="canonicalName" placeholder="Canonical name" maxLength={500} required />
              <button className="citem-button" type="submit">Create identity</button>
            </form>
          </section>

          <section>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Analyst-managed identities</p>
                <p className="mt-1 text-xs text-stone-500">Aliases stored here can teach future exact automatic resolutions.</p>
              </div>
              <span className="text-xs text-stone-500">{analystEntities.length} record(s)</span>
            </div>
            {!analystEntities.length ? <p className="mt-3 text-sm text-stone-500">No analyst-managed canonical entities yet.</p> : (
              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                {analystEntities.map((entity) => {
                  const entityId = String(entity.id);
                  const entityAliases = aliases.filter((alias) => String(alias.entity_id) === entityId);
                  return (
                    <article className="rounded border border-stone-800 bg-stone-950/20 p-4" key={entityId}>
                      <div className="flex flex-wrap justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded border border-amber-900/70 px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-amber-200">{text(entity.entity_kind)}</span>
                            <span className="text-[11px] uppercase tracking-[0.12em] text-stone-500">{text(entity.status)}</span>
                          </div>
                          <h3 className="mt-2 text-base font-medium text-stone-100">{text(entity.canonical_name)}</h3>
                        </div>
                        <form action={setEntityStatus.bind(null, entityId, entity.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED")}>
                          <button className="citem-button-ghost" type="submit">{entity.status === "ARCHIVED" ? "Restore" : "Archive"}</button>
                        </form>
                      </div>
                      <div className="mt-3 grid gap-2">
                        <form action={renameEntity.bind(null, entityId)} className="flex gap-2">
                          <input className="field flex-1" name="canonicalName" defaultValue={String(entity.canonical_name)} maxLength={500} />
                          <button className="citem-button-ghost" type="submit">Rename</button>
                        </form>
                        <form action={addEntityAlias.bind(null, entityId)} className="flex gap-2">
                          <input className="field flex-1" name="displayValue" placeholder="Confirmed exact alias" maxLength={500} required />
                          <button className="citem-button-ghost" type="submit">Add alias</button>
                        </form>
                      </div>
                      <div className="mt-3 space-y-1">
                        {entityAliases.filter((alias) => alias.status === "ACTIVE").map((alias) => (
                          <div className="flex items-center justify-between gap-2 rounded border border-stone-800 px-2.5 py-2 text-xs" key={String(alias.id)}>
                            <span className="text-stone-300"><b>{String(alias.basis) === "AUTHORITATIVE_SOURCE" ? "Authoritative" : "Analyst confirmed"}</b> · {text(alias.display_value)}</span>
                            <form action={revokeEntityAlias.bind(null, String(alias.id))}><button className="text-amber-300" type="submit">Revoke</button></form>
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <details className="rounded border border-stone-800 bg-stone-950/20 p-3">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Deterministic registry</p>
                  <p className="mt-1 text-xs text-stone-500">Machine-managed CVE / Indicator / ATT&amp;CK identities. No analyst action is normally required.</p>
                </div>
                <span className="text-xs text-stone-500">{deterministicEntities.length} record(s) · open technical list</span>
              </div>
            </summary>
            <div className="mt-3 divide-y divide-stone-800 border-t border-stone-800">
              {deterministicEntities.slice(0, 120).map((entity) => (
                <div className="grid gap-1 py-2 text-xs md:grid-cols-[1fr_180px_1.4fr]" key={String(entity.id)}>
                  <span className="font-medium text-stone-300">{text(entity.canonical_name)}</span>
                  <span className="text-stone-500">{text(entity.entity_kind)} · {text(entity.status)}</span>
                  <span className="truncate font-mono text-stone-600">{text(entity.deterministic_key)}</span>
                </div>
              ))}
            </div>
            {deterministicEntities.length > 120 ? <p className="mt-2 text-xs text-stone-600">Showing the first 120 deterministic identities in this bounded registry view.</p> : null}
          </details>
        </div>
      </details>

      <details className="card">
        <summary className="cursor-pointer list-none">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="citem-eyebrow">Decision log</p>
              <h2 className="citem-section-title mt-1">Resolution audit trail</h2>
              <p className="mt-1 text-sm text-stone-500">Human-readable decision history with technical IDs kept secondary.</p>
            </div>
            <span className="rounded border border-stone-800 px-2.5 py-1.5 text-xs text-stone-500">{audits.length} event(s) · open log</span>
          </div>
        </summary>
        {!audits.length ? <p className="mt-4 text-sm text-stone-500">No normalization audit events yet.</p> : (
          <div className="mt-4 divide-y divide-stone-800 border-t border-stone-800">
            {audits.slice(0, 40).map((audit) => {
              const entityId = audit.entity_id ? String(audit.entity_id) : null;
              const assertionId = audit.assertion_id ? String(audit.assertion_id) : null;
              return (
                <div className="grid gap-2 py-3 text-sm lg:grid-cols-[1fr_auto]" key={String(audit.id)}>
                  <div>
                    <p className="text-stone-300">{auditActionLabel(audit.action)}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {entityId ? `Entity: ${entityNameById.get(entityId) ?? "unknown"}` : "Entity: —"}
                      {assertionId ? ` · Source label: ${assertionNameById.get(assertionId) ?? "unknown"}` : ""}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-stone-700">
                      {entityId ? `entity ${entityId}` : ""}{entityId && assertionId ? " · " : ""}{assertionId ? `assertion ${assertionId}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-stone-500">{time(audit.created_at as string)}</span>
                </div>
              );
            })}
          </div>
        )}
      </details>
    </section>
  );
}
