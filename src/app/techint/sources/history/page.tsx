import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  getTechnicalHistoryMaintenanceState,
  listTechnicalActivityBuckets,
  listTechnicalCoverageBuckets,
  listTechnicalHistoryBackfillState,
} from "@/lib/techint/history/queries";

function time(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default async function Page() {
  const { supabase } = await requireUser();
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [ingestion, effective, coverage, backfill, maintenance] = await Promise.all([
    listTechnicalActivityBuckets(supabase, { granularity: "HOUR", timeAxis: "INGESTION_TIME", from, limit: 300 }),
    listTechnicalActivityBuckets(supabase, { granularity: "HOUR", timeAxis: "SOURCE_EFFECTIVE_TIME", from, limit: 300 }),
    listTechnicalCoverageBuckets(supabase, { granularity: "HOUR", from, limit: 300 }),
    listTechnicalHistoryBackfillState(supabase),
    getTechnicalHistoryMaintenanceState(supabase),
  ]);

  const unavailable = ingestion.error || effective.error || coverage.error || backfill.error || maintenance.error;
  const ingestionRows = (ingestion.data ?? []) as Array<Record<string, unknown>>;
  const effectiveRows = (effective.data ?? []) as Array<Record<string, unknown>>;
  const coverageRows = (coverage.data ?? []) as Array<Record<string, unknown>>;
  const backfillRows = (backfill.data ?? []) as Array<Record<string, unknown>>;
  const maintenanceRow = maintenance.data as Record<string, unknown> | null;

  const ingestionTotal = ingestionRows.reduce((sum, row) => sum + Number(row.observation_count ?? 0), 0);
  const effectiveTotal = effectiveRows.reduce((sum, row) => sum + Number(row.observation_count ?? 0), 0);
  const gaps = coverageRows.filter((row) => String(row.coverage_status) === "NO_COVERAGE").length;
  const degraded = coverageRows.filter((row) => String(row.coverage_status) === "DEGRADED").length;

  return (
    <section className="space-y-5">
      <header className="citem-page-header">
        <div>
          <p className="citem-eyebrow">CİTEM / TechINT / Historical Diagnostics</p>
          <h1 className="citem-title">Activity &amp; coverage history</h1>
          <p className="citem-subtitle">
            Derived time-series diagnostics for collection and Technical Signal observations. Observation volume is not attack volume, and a coverage gap is never rendered as zero activity.
          </p>
        </div>
        <Link className="citem-button-ghost" href="/techint/sources">Back to Technical Sources</Link>
      </header>

      {unavailable ? (
        <div className="card text-amber-300">Historical diagnostics are unavailable until the Phase 2.3F-B migration is applied and maintenance has run.</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="card"><p className="text-xs uppercase tracking-wide text-stone-500">24H received observations</p><p className="mt-2 text-2xl text-stone-100">{ingestionTotal}</p></div>
        <div className="card"><p className="text-xs uppercase tracking-wide text-stone-500">24H source-effective observations</p><p className="mt-2 text-2xl text-stone-100">{effectiveTotal}</p></div>
        <div className="card"><p className="text-xs uppercase tracking-wide text-stone-500">No-coverage source-hours</p><p className="mt-2 text-2xl text-stone-100">{gaps}</p></div>
        <div className="card"><p className="text-xs uppercase tracking-wide text-stone-500">Degraded source-hours</p><p className="mt-2 text-2xl text-stone-100">{degraded}</p></div>
      </div>

      <section className="card space-y-3">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h2 className="citem-section-title">Maintenance state</h2>
            <p className="mt-1 text-xs text-stone-500">The desktop collector requests bounded rollup maintenance; the database rate-gates it to one maintenance cycle every five minutes.</p>
          </div>
          <div className="text-right text-xs text-stone-500">
            <div>Activity refresh: {time(maintenanceRow?.last_activity_refresh_at as string | null)}</div>
            <div>Coverage refresh: {time(maintenanceRow?.last_coverage_refresh_at as string | null)}</div>
            <div>Compaction: {time(maintenanceRow?.last_compaction_at as string | null)}</div>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {backfillRows.map((row) => (
            <div className="rounded border border-stone-800 p-3 text-xs" key={`${String(row.history_kind)}-${String(row.granularity)}-${String(row.time_axis)}`}>
              <p className="font-semibold text-stone-200">{String(row.history_kind)} · {String(row.granularity)}</p>
              <p className="mt-1 text-stone-500">{String(row.time_axis)}</p>
              <p className="mt-2 text-stone-400">{row.complete ? "Backfill complete" : `Cursor: ${time(row.cursor_at as string | null)}`}</p>
            </div>
          ))}
          {!backfillRows.length ? <p className="text-sm text-stone-500">Backfill has not started yet.</p> : null}
        </div>
      </section>

      <section className="card">
        <h2 className="citem-section-title">Hourly collection coverage — last 24H</h2>
        <p className="mt-1 text-xs text-stone-500">COMPLETE means collection behaved as configured for that bucket. `schedule_known=false` marks historically reconstructed periods where exact expected-run cadence cannot be asserted.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-stone-500"><tr><th className="pb-2">Bucket</th><th>Source</th><th>Coverage</th><th>Schedule known</th><th>Expected</th><th>Attempted</th><th>Success</th><th>Failed</th><th>Mapped</th><th>Error</th></tr></thead>
            <tbody>{coverageRows.slice(0, 160).map((row) => (
              <tr className="border-t border-stone-800" key={String(row.id)}>
                <td className="py-3">{time(row.bucket_start as string)}</td><td>{String(row.source_key)}</td><td>{String(row.coverage_status)}</td><td>{row.schedule_known ? "yes" : "reconstructed"}</td><td>{String(row.expected_runs)}</td><td>{String(row.attempted_runs)}</td><td>{String(row.successful_runs)}</td><td>{String(row.failed_runs)}</td><td>{String(row.records_mapped)}</td><td className="max-w-xs truncate text-stone-500">{row.last_error_code ? String(row.last_error_code) : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="citem-section-title">Hourly received activity — last 24H</h2>
        <p className="mt-1 text-xs text-stone-500">Counts reflect observations received by CİTEM. They do not claim that attack activity increased or decreased.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-stone-500"><tr><th className="pb-2">Bucket</th><th>Source system</th><th>Signal type</th><th>Observations</th><th>Distinct signals</th><th>Current</th><th>Supporting</th><th>Stale</th><th>Conflicting</th></tr></thead>
            <tbody>{ingestionRows.slice(0, 160).map((row) => (
              <tr className="border-t border-stone-800" key={String(row.id)}>
                <td className="py-3">{time(row.bucket_start as string)}</td><td>{String(row.source_system)}</td><td>{String(row.signal_type)}</td><td>{String(row.observation_count)}</td><td>{String(row.distinct_signal_count)}</td><td>{String(row.current_count)}</td><td>{String(row.supporting_count)}</td><td>{String(row.stale_count)}</td><td>{String(row.conflicting_count)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
