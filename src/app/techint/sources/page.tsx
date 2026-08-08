import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listTechnicalSources } from "@/lib/techint/collection/registry";
import { listRecentTechnicalCollectionRuns, listRecentTechnicalSourceAuditEvents, listTechnicalSourceConnections } from "@/lib/techint/collection/queries";
import type { SourceSettingField } from "@/lib/techint/collection/types";
import {
  enableTechnicalSource,
  setTechnicalSourceStatus,
  syncTechnicalSourceNow,
  updateTechnicalSourceSettings,
} from "./actions";

function time(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function SettingsFields({ fields, settings }: { fields: readonly SourceSettingField[]; settings: Record<string, unknown> }) {
  return fields.map((field) => (
    <div className="space-y-1" key={field.name}>
      <label className="block text-xs text-stone-400" htmlFor={field.name}>{field.label}</label>
      <input
        className="field"
        id={field.name}
        name={field.name}
        type="number"
        min={field.minimum}
        max={field.maximum}
        step={field.step ?? (field.type === "integer" ? 1 : "any")}
        defaultValue={Number(settings[field.name] ?? field.defaultValue)}
      />
    </div>
  ));
}

export default async function Page() {
  const { supabase } = await requireUser();
  const [{ data: connectionData, error: connectionError }, { data: runData }, { data: auditData }] = await Promise.all([
    listTechnicalSourceConnections(supabase),
    listRecentTechnicalCollectionRuns(supabase),
    listRecentTechnicalSourceAuditEvents(supabase),
  ]);
  const connections = (connectionData ?? []) as Array<Record<string, unknown>>;
  const runs = (runData ?? []) as Array<Record<string, unknown>>;
  const audits = (auditData ?? []) as Array<Record<string, unknown>>;
  const registry = listTechnicalSources();
  const byKey = new Map(connections.map((connection) => [String(connection.source_key), connection]));
  const latestRunByKey = new Map<string, Record<string, unknown>>();
  for (const run of runs) {
    const key = String(run.source_key);
    if (!latestRunByKey.has(key)) latestRunByKey.set(key, run);
  }

  return (
    <section className="space-y-5">
      <header className="citem-page-header">
        <div>
          <p className="citem-eyebrow">CİTEM / TechINT / Collection Operations</p>
          <h1 className="citem-title">Technical sources</h1>
          <p className="citem-subtitle">
            Fixed, server-owned sources record bounded source-backed Technical Signals. They do not represent CİTEM&apos;s final analyst assessment.
          </p>
        </div>
        <Link className="citem-button-ghost" href="/techint">Back to Global View</Link>
      </header>

      {connectionError ? <div className="card text-red-300">Unable to load Technical Sources. Verify the latest TechINT source migration.</div> : null}

      <div className="grid gap-4 xl:grid-cols-3">
        {registry.map((adapter) => {
          const connection = byKey.get(adapter.metadata.key);
          const id = connection ? String(connection.id) : null;
          const status = connection ? String(connection.status) : "NOT_ENABLED";
          const settings = (connection?.settings ?? {}) as Record<string, unknown>;
          const latestRun = latestRunByKey.get(adapter.metadata.key);
          const fields = adapter.metadata.settingsFields ?? [];
          return (
            <article className="card space-y-4" key={adapter.metadata.key}>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="citem-section-title">{adapter.metadata.displayName}</h2>
                  {adapter.metadata.testSynthetic ? <span className="rounded border border-amber-700 px-2 py-1 text-xs text-amber-300">TEST / SYNTHETIC</span> : null}
                </div>
                <p className="mt-2 text-sm text-stone-500">{adapter.metadata.description}</p>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs text-stone-400">
                <div><dt>Status</dt><dd className="text-stone-200">{status}</dd></div>
                <div><dt>Family</dt><dd className="text-stone-200">{adapter.metadata.sourceFamily}</dd></div>
                <div><dt>Credential</dt><dd className="text-stone-200">{adapter.metadata.credentialRequirement}</dd></div>
                <div><dt>Interval</dt><dd className="text-stone-200">{connection ? `${String(connection.interval_minutes)} min` : `${adapter.metadata.defaultIntervalMinutes} min`}</dd></div>
                <div><dt>Scheduling</dt><dd className="text-stone-200">{adapter.metadata.scheduled ? (status === "ENABLED" ? "Enabled" : "Inactive") : "Manual only"}</dd></div>
                <div><dt>Next run</dt><dd className="text-stone-200">{time(connection?.next_run_at as string | null)}</dd></div>
                <div><dt>Last started</dt><dd className="text-stone-200">{time(connection?.last_started_at as string | null)}</dd></div>
                <div><dt>Last success</dt><dd className="text-stone-200">{time(connection?.last_succeeded_at as string | null)}</dd></div>
                <div><dt>Last failure</dt><dd className="text-stone-200">{time(connection?.last_failed_at as string | null)}</dd></div>
                <div><dt>Failures</dt><dd className="text-stone-200">{connection ? String(connection.consecutive_failures) : "0"}</dd></div>
                <div><dt>Latest run</dt><dd className="text-stone-200">{latestRun ? `${String(latestRun.status)} · ${String(latestRun.records_mapped)} mapped` : "—"}</dd></div>
                <div><dt>Latest error</dt><dd className="truncate text-stone-200">{latestRun?.controlled_error_code ? String(latestRun.controlled_error_code) : "—"}</dd></div>
              </dl>

              {!connection ? (
                <form action={enableTechnicalSource} className="space-y-2">
                  <input type="hidden" name="sourceKey" value={adapter.metadata.key} />
                  <label className="block text-xs text-stone-400">Interval minutes</label>
                  <input className="field" name="intervalMinutes" type="number" min={adapter.metadata.minimumIntervalMinutes} max={adapter.metadata.maximumIntervalMinutes} defaultValue={adapter.metadata.defaultIntervalMinutes} />
                  <SettingsFields fields={fields} settings={{}} />
                  <button className="citem-button" type="submit">Enable source</button>
                </form>
              ) : (
                <div className="space-y-3">
                  {status !== "ARCHIVED" ? (
                    <form action={updateTechnicalSourceSettings.bind(null, id!, adapter.metadata.key)} className="space-y-2">
                      <label className="block text-xs text-stone-400">Interval minutes</label>
                      <input className="field" name="intervalMinutes" type="number" min={adapter.metadata.minimumIntervalMinutes} max={adapter.metadata.maximumIntervalMinutes} defaultValue={Number(connection.interval_minutes)} />
                      <SettingsFields fields={fields} settings={settings} />
                      <button className="citem-button-ghost" type="submit">Save settings</button>
                    </form>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {status !== "ARCHIVED" ? <form action={syncTechnicalSourceNow.bind(null, id!)}><button className="citem-button" type="submit">Sync now</button></form> : null}
                    {status === "ENABLED" ? <form action={setTechnicalSourceStatus.bind(null, id!, "PAUSED")}><button className="citem-button-ghost">Pause</button></form> : null}
                    {status === "PAUSED" ? <form action={setTechnicalSourceStatus.bind(null, id!, "ENABLED")}><button className="citem-button-ghost">Resume</button></form> : null}
                    {status !== "ARCHIVED" ? <form action={setTechnicalSourceStatus.bind(null, id!, "ARCHIVED")}><button className="citem-button-ghost">Archive</button></form> : null}
                    {status === "ARCHIVED" ? <form action={setTechnicalSourceStatus.bind(null, id!, "PAUSED")}><button className="citem-button-ghost">Restore paused</button></form> : null}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <section className="card">
        <h2 className="citem-section-title">Recent collection runs</h2>
        {!runs.length ? <p className="mt-3 text-sm text-stone-500">No collection runs yet.</p> : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-stone-500"><tr><th className="pb-2">Source</th><th>Status</th><th>Trigger</th><th>Started</th><th>Mapped</th><th>Created</th><th>Error</th></tr></thead>
              <tbody>{runs.map((run) => <tr className="border-t border-stone-800" key={String(run.id)}><td className="py-3">{String(run.source_key)}</td><td>{String(run.status)}</td><td>{String(run.trigger)}</td><td>{time(run.started_at as string)}</td><td>{String(run.records_mapped)}</td><td>{String(run.observations_created)}</td><td className="max-w-xs truncate text-stone-500">{run.controlled_error_code ? `${String(run.controlled_error_code)}: ${String(run.controlled_error_message ?? "")}` : "—"}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="citem-section-title">Source audit history</h2>
        {!audits.length ? <p className="mt-3 text-sm text-stone-500">No source lifecycle events yet.</p> : (
          <div className="mt-4 grid gap-2">
            {audits.map((audit) => (
              <div className="flex flex-wrap justify-between gap-3 border-t border-stone-800 py-3 text-sm" key={String(audit.id)}>
                <span>{String(audit.source_key)} · {String(audit.action)}</span>
                <span className="text-stone-500">{time(audit.created_at as string)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
