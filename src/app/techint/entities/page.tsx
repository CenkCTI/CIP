import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { groupUnresolvedAssertions } from "@/lib/techint/entities/grouping";
import {
  listTechnicalEntities,
  listTechnicalEntityAliases,
  listTechnicalEntityAssertions,
  listTechnicalEntityAuditEvents,
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

export default async function Page() {
  const { supabase } = await requireUser();
  const [entityResult, aliasResult, assertionResult, auditResult] = await Promise.all([
    listTechnicalEntities(supabase, 300),
    listTechnicalEntityAliases(supabase),
    listTechnicalEntityAssertions(supabase, 500),
    listTechnicalEntityAuditEvents(supabase),
  ]);
  const assertions = (assertionResult.data ?? []) as Array<Record<string, unknown>>;
  const assertionIds = assertions.map((row) => String(row.id));
  const resolutionResult = await listTechnicalEntityResolutionsForAssertions(supabase, assertionIds);

  const migrationMissing = Boolean(entityResult.error || aliasResult.error || resolutionResult.error || auditResult.error);
  const entities = (entityResult.data ?? []) as Array<Record<string, unknown>>;
  const aliases = (aliasResult.data ?? []) as Array<Record<string, unknown>>;
  const resolutions = (resolutionResult.data ?? []) as Array<Record<string, unknown>>;
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
  const deterministicPending = groups.filter((group) => deterministicKinds.has(group.entityKind)).reduce((sum, group) => sum + group.occurrenceCount, 0);
  const resolvedCount = resolutions.filter((row) => row.status === "RESOLVED").length;
  const dismissed = resolutions.filter((row) => row.status === "DISMISSED");

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

  return (
    <section className="space-y-5">
      <header className="citem-page-header">
        <div>
          <p className="citem-eyebrow">CİTEM / TechINT / Entity Resolution</p>
          <h1 className="citem-title">Entity resolution</h1>
          <p className="citem-subtitle">
            Turn repeated source labels into stable canonical identities automatically where safe, and send only genuinely ambiguous groups to analyst review.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="citem-button-ghost" href="/techint/sources">Technical Sources</Link>
          <Link className="citem-button-ghost" href="/techint">Back to Global View</Link>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="card"><p className="citem-eyebrow">Resolved</p><p className="mt-2 text-2xl font-semibold text-stone-100">{resolvedCount}</p><p className="mt-1 text-xs text-stone-500">Current resolutions in the bounded view</p></div>
        <div className="card"><p className="citem-eyebrow">Automatic pending</p><p className="mt-2 text-2xl font-semibold text-stone-100">{deterministicPending}</p><p className="mt-1 text-xs text-stone-500">CVE / Indicator / ATT&amp;CK occurrences</p></div>
        <div className="card"><p className="citem-eyebrow">Analyst review</p><p className="mt-2 text-2xl font-semibold text-stone-100">{ambiguousGroups.length}</p><p className="mt-1 text-xs text-stone-500">Deduplicated ambiguous groups, not raw assertions</p></div>
        <div className="card"><p className="citem-eyebrow">Dismissed</p><p className="mt-2 text-2xl font-semibold text-stone-100">{dismissed.length}</p><p className="mt-1 text-xs text-stone-500">Explicitly skipped assertion decisions</p></div>
      </div>

      <div className="card panel-corners grid gap-3 md:grid-cols-3">
        <div><p className="citem-eyebrow">1 · SOURCE</p><p className="mt-2 text-sm text-stone-400">Providers keep their exact immutable labels and provenance.</p></div>
        <div><p className="citem-eyebrow">2 · RESOLVE</p><p className="mt-2 text-sm text-stone-400">Deterministic identity and confirmed aliases resolve automatically; equal unresolved labels are grouped.</p></div>
        <div><p className="citem-eyebrow">3 · REVIEW EXCEPTIONS</p><p className="mt-2 text-sm text-stone-400">Optional BYOK/NVIDIA NIM proposes candidates. The analyst confirms only ambiguous identity decisions.</p></div>
      </div>

      {migrationMissing ? (
        <div className="card border border-amber-900 text-amber-200">
          Phase 2.3D tables are not available in this database yet. Apply migration 037 only through the authorized Preview deployment procedure, reload PostgREST, then redeploy.
        </div>
      ) : null}

      <section className="card flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="citem-eyebrow">Automatic resolver</p>
          <h2 className="citem-section-title mt-2">Resolve safe identities first</h2>
          <p className="mt-2 max-w-3xl text-sm text-stone-500">CVE, Indicator and ATT&amp;CK identities plus already-confirmed exact aliases do not require AI or analyst cleanup. Reconciliation is bounded, idempotent, and performs no provider network request.</p>
        </div>
        <form action={reconcileTechnicalEntities} className="flex items-end gap-2">
          <div><label className="block text-xs text-stone-500">Batch limit</label><input className="field w-24" name="limit" type="number" min="1" max="500" defaultValue="500" /></div>
          <button className="citem-button" type="submit">Run automatic resolver</button>
        </form>
      </section>

      <EntityResolutionWorkspace groups={uiGroups} entities={activeEntities} />

      {dismissed.length ? (
        <section className="card">
          <p className="citem-eyebrow">Dismissed</p>
          <h2 className="citem-section-title mt-2">Return an assertion to review</h2>
          <div className="mt-3 flex flex-wrap gap-2">{dismissed.slice(0, 30).map((resolution) => <form key={String(resolution.id)} action={resetEntityAssertion.bind(null, String(resolution.assertion_id))}><button className="citem-button-ghost" type="submit">Reset {String(resolution.assertion_id).slice(0, 8)}…</button></form>)}</div>
        </section>
      ) : null}

      <section className="card space-y-4">
        <div>
          <p className="citem-eyebrow">Canonical Entities</p>
          <h2 className="citem-section-title mt-2">Owner-global taxonomy</h2>
          <p className="mt-2 text-sm text-stone-500">These are stable TechINT identities, not Investigation assessments. Confirmed aliases teach future exact resolutions.</p>
        </div>
        <form action={createTechnicalEntity} className="grid gap-2 rounded border border-stone-800 p-3 md:grid-cols-4">
          <select className="field" name="kind" defaultValue="MALWARE">
            {["THREAT_ACTOR","MALWARE","CAMPAIGN","VENDOR","PRODUCT","SECTOR","COUNTRY","REGION","TAG"].map((kind) => <option key={kind}>{kind}</option>)}
          </select>
          <input className="field md:col-span-2" name="canonicalName" placeholder="Canonical name" maxLength={500} required />
          <button className="citem-button" type="submit">Create analyst entity</button>
        </form>
        {!entities.length ? <p className="text-sm text-stone-500">No canonical entities yet.</p> : (
          <div className="grid gap-3 xl:grid-cols-2">
            {entities.map((entity) => {
              const entityId = String(entity.id);
              const entityAliases = aliases.filter((alias) => alias.entity_id === entity.id);
              return (
                <article className="rounded border border-stone-800 p-4" key={entityId}>
                  <div className="flex flex-wrap justify-between gap-3">
                    <div><span className="rounded border border-stone-700 px-2 py-1 text-xs">CANONICAL ENTITY</span><h3 className="mt-2 font-medium">{text(entity.canonical_name)}</h3><p className="text-xs text-stone-500">{text(entity.entity_kind)} · {text(entity.origin)} · {text(entity.status)}</p><p className="text-xs text-stone-500">{text(entity.deterministic_key)}</p></div>
                    <form action={setEntityStatus.bind(null, entityId, entity.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED")}><button className="citem-button-ghost" type="submit">{entity.status === "ARCHIVED" ? "Restore" : "Archive"}</button></form>
                  </div>
                  {!entity.deterministic_key ? (
                    <div className="mt-3 grid gap-2">
                      <form action={renameEntity.bind(null, entityId)} className="flex gap-2"><input className="field flex-1" name="canonicalName" defaultValue={String(entity.canonical_name)} maxLength={500} /><button className="citem-button-ghost">Rename</button></form>
                      <form action={addEntityAlias.bind(null, entityId)} className="flex gap-2"><input className="field flex-1" name="displayValue" placeholder="Confirmed alias" maxLength={500} required /><button className="citem-button-ghost">Add alias</button></form>
                    </div>
                  ) : <p className="mt-3 text-xs text-stone-500">Deterministic identity is immutable. Correct identity by resolving to the correct entity instead of renaming.</p>}
                  <div className="mt-3 space-y-1">
                    {entityAliases.filter((alias) => alias.status === "ACTIVE").map((alias) => <div className="flex items-center justify-between gap-2 text-xs" key={String(alias.id)}><span><b>{String(alias.basis) === "AUTHORITATIVE_SOURCE" ? "AUTHORITATIVE ALIAS" : "ANALYST-CONFIRMED ALIAS"}</b> · {text(alias.display_value)}</span><form action={revokeEntityAlias.bind(null, String(alias.id))}><button className="text-amber-300" type="submit">Revoke</button></form></div>)}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <p className="citem-eyebrow">Audit / History</p>
        <h2 className="citem-section-title mt-2">Normalization audit</h2>
        {!audits.length ? <p className="mt-3 text-sm text-stone-500">No normalization audit events yet.</p> : <div className="mt-3 divide-y divide-stone-800">{audits.map((audit) => <div className="flex flex-wrap justify-between gap-3 py-3 text-sm" key={String(audit.id)}><span>{text(audit.action)} · entity {text(audit.entity_id)} · assertion {text(audit.assertion_id)}</span><span className="text-stone-500">{time(audit.created_at as string)}</span></div>)}</div>}
      </section>
    </section>
  );
}
