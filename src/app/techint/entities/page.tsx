import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  listTechnicalEntities,
  listTechnicalEntityAliases,
  listTechnicalEntityAssertions,
  listTechnicalEntityAuditEvents,
  listTechnicalEntityResolutions,
  listTechnicalObservationLabels,
  listTechnicalSignalLabels,
} from "@/lib/techint/entities/queries";
import {
  addEntityAlias,
  createEntityFromAssertion,
  createTechnicalEntity,
  dismissEntityAssertion,
  linkEntityAssertion,
  reconcileTechnicalEntities,
  renameEntity,
  resetEntityAssertion,
  revokeEntityAlias,
  setEntityStatus,
} from "./actions";

function time(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function text(value: unknown) {
  return value == null ? "—" : String(value);
}

export default async function Page() {
  const { supabase } = await requireUser();
  const [entityResult, aliasResult, assertionResult, resolutionResult, auditResult] = await Promise.all([
    listTechnicalEntities(supabase),
    listTechnicalEntityAliases(supabase),
    listTechnicalEntityAssertions(supabase),
    listTechnicalEntityResolutions(supabase),
    listTechnicalEntityAuditEvents(supabase),
  ]);

  const migrationMissing = Boolean(entityResult.error || aliasResult.error || resolutionResult.error || auditResult.error);
  const entities = (entityResult.data ?? []) as Array<Record<string, unknown>>;
  const aliases = (aliasResult.data ?? []) as Array<Record<string, unknown>>;
  const assertions = (assertionResult.data ?? []) as Array<Record<string, unknown>>;
  const resolutions = (resolutionResult.data ?? []) as Array<Record<string, unknown>>;
  const audits = (auditResult.data ?? []) as Array<Record<string, unknown>>;
  const resolutionByAssertion = new Map(resolutions.map((row) => [String(row.assertion_id), row]));
  const signalIds = [...new Set(assertions.map((row) => String(row.signal_id)))];
  const observationIds = [...new Set(assertions.map((row) => String(row.source_observation_id)))];
  const [{ data: signalRows }, { data: observationRows }] = await Promise.all([
    listTechnicalSignalLabels(supabase, signalIds),
    listTechnicalObservationLabels(supabase, observationIds),
  ]);
  const signalById = new Map(((signalRows ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row]));
  const observationById = new Map(((observationRows ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row]));
  const review = assertions.filter((row) => {
    const resolution = resolutionByAssertion.get(String(row.id));
    return !resolution || resolution.status === "NEEDS_REVIEW" || resolution.status === "DISMISSED";
  });
  const activeEntities = entities.filter((row) => row.status === "ACTIVE");

  return (
    <section className="space-y-5">
      <header className="citem-page-header">
        <div>
          <p className="citem-eyebrow">CİTEM / TechINT / Entity Normalization</p>
          <h1 className="citem-title">Canonical entities</h1>
          <p className="citem-subtitle">
            Resolve immutable source assertions into owner-scoped canonical TechINT entities without creating Investigation records, profile matches, attribution, or priority scores.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="citem-button-ghost" href="/techint/sources">Technical Sources</Link>
          <Link className="citem-button-ghost" href="/techint">Back to Global View</Link>
        </div>
      </header>

      <div className="card panel-corners grid gap-3 md:grid-cols-3">
        <div><p className="citem-eyebrow">SOURCE ASSERTION</p><p className="mt-2 text-sm text-stone-400">Immutable provider/system observation. Never rewritten by normalization.</p></div>
        <div><p className="citem-eyebrow">CANONICAL ENTITY</p><p className="mt-2 text-sm text-stone-400">Owner-global TechINT identity used later by matching and priority logic.</p></div>
        <div><p className="citem-eyebrow">ANALYTICAL ENTITY</p><p className="mt-2 text-sm text-stone-400">Investigation Threat Actor, Malware, CVE, Indicator, Campaign, and MITRE records remain separate.</p></div>
      </div>

      {migrationMissing ? (
        <div className="card border border-amber-900 text-amber-200">
          Phase 2.3D tables are not available in this database yet. Apply migration 037 only through the authorized Preview deployment procedure, reload PostgREST, then redeploy.
        </div>
      ) : null}

      <section className="card space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="citem-eyebrow">Review Queue</p>
            <h2 className="citem-section-title mt-2">Unresolved source assertions</h2>
            <p className="mt-2 text-sm text-stone-500">Deterministic CVE, ATT&amp;CK, and Indicator identities may resolve automatically. Ambiguous names require an exact confirmed alias or analyst decision.</p>
          </div>
          <form action={reconcileTechnicalEntities} className="flex items-end gap-2">
            <div><label className="block text-xs text-stone-500">Batch limit</label><input className="field w-24" name="limit" type="number" min="1" max="500" defaultValue="200" /></div>
            <button className="citem-button" type="submit">Run safe reconciliation</button>
          </form>
        </div>

        {!review.length ? <p className="text-sm text-stone-500">No unresolved assertions in the bounded view.</p> : (
          <div className="grid gap-3">
            {review.slice(0, 100).map((assertion) => {
              const id = String(assertion.id);
              const resolution = resolutionByAssertion.get(id);
              const signal = signalById.get(String(assertion.signal_id));
              const observation = observationById.get(String(assertion.source_observation_id));
              const sameKind = activeEntities.filter((entity) => entity.entity_kind === assertion.entity_kind);
              const dismissed = resolution?.status === "DISMISSED";
              return (
                <article className="rounded border border-stone-800 p-4" key={id}>
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded border border-stone-700 px-2 py-1 text-xs text-stone-300">SOURCE ASSERTION</span>
                        <span className="text-xs text-stone-500">{text(assertion.entity_kind)} · {text(assertion.semantic_role)} · {dismissed ? "DISMISSED" : "NEEDS REVIEW"}</span>
                      </div>
                      <h3 className="mt-2 font-medium text-stone-100">{text(assertion.display_value)}</h3>
                      <p className="mt-1 text-xs text-stone-500">Lookup: {text(assertion.normalized_value)}</p>
                    </div>
                    <div className="max-w-md text-xs text-stone-500">
                      <p>Signal: {text(signal?.title)}</p>
                      <p>Source: {text(observation?.source_system)} · {text(observation?.source_record_key)}</p>
                      <p>Source title: {text(observation?.source_title)}</p>
                      <p>Assertion: {text(assertion.assertion_basis)} · confidence {text(assertion.confidence)}</p>
                    </div>
                  </div>

                  {dismissed ? (
                    <form action={resetEntityAssertion.bind(null, id)} className="mt-4"><button className="citem-button-ghost" type="submit">Reset to review</button></form>
                  ) : (
                    <div className="mt-4 grid gap-3 xl:grid-cols-2">
                      <form action={linkEntityAssertion.bind(null, id)} className="rounded border border-stone-800 p-3 space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wider text-stone-400">Link to existing canonical entity</p>
                        <select className="field" name="entityId" required defaultValue="">
                          <option value="" disabled>Select entity</option>
                          {sameKind.map((entity) => <option key={String(entity.id)} value={String(entity.id)}>{text(entity.canonical_name)}{entity.deterministic_key ? ` · ${text(entity.deterministic_key)}` : ""}</option>)}
                        </select>
                        <label className="flex items-center gap-2 text-xs text-stone-400"><input name="rememberAlias" type="checkbox" />Remember this exact value as an ANALYST-CONFIRMED ALIAS</label>
                        <button className="citem-button-ghost" type="submit">Link assertion</button>
                      </form>

                      <form action={createEntityFromAssertion.bind(null, id)} className="rounded border border-stone-800 p-3 space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wider text-stone-400">Create canonical entity</p>
                        <input className="field" name="canonicalName" defaultValue={String(assertion.display_value ?? "")} maxLength={500} />
                        <label className="flex items-center gap-2 text-xs text-stone-400"><input name="rememberAlias" type="checkbox" />Remember source value as an ANALYST-CONFIRMED ALIAS</label>
                        <div className="flex flex-wrap gap-2"><button className="citem-button" type="submit">Create &amp; link</button><button className="citem-button-ghost" formAction={dismissEntityAssertion.bind(null, id)} type="submit">Dismiss</button></div>
                      </form>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="card space-y-4">
        <div>
          <p className="citem-eyebrow">Canonical Entities</p>
          <h2 className="citem-section-title mt-2">Owner-global taxonomy</h2>
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
                    {entityAliases.filter((alias) => alias.status === "ACTIVE").map((alias) => <div className="flex items-center justify-between gap-2 text-xs" key={String(alias.id)}><span><b>ANALYST-CONFIRMED ALIAS</b> · {text(alias.display_value)} · {text(alias.basis)}</span><form action={revokeEntityAlias.bind(null, String(alias.id))}><button className="text-amber-300" type="submit">Revoke</button></form></div>)}
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
