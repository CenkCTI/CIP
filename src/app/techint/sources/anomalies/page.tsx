import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { metricLabel } from "@/lib/techint/analysis/config";
import {
  getTechnicalAnomalyMaintenanceState,
  listTechnicalAnalysisSeries,
  listTechnicalAnomalyBackfillState,
  listTechnicalAnomalyEvaluations,
  listTechnicalBaselineProfiles,
} from "@/lib/techint/analysis/queries";
import type { TechnicalAnomalyMetric } from "@/lib/techint/analysis/types";

function time(value: unknown) {
  return typeof value === "string" ? new Date(value).toLocaleString() : "—";
}

function number(value: unknown, digits = 2) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits).replace(/\.00$/, "") : "—";
}

export default async function Page() {
  const { supabase } = await requireUser();
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [series, baselines, evaluations, maintenance, backfill] = await Promise.all([
    listTechnicalAnalysisSeries(supabase),
    listTechnicalBaselineProfiles(supabase),
    listTechnicalAnomalyEvaluations(supabase, { from, limit: 400 }),
    getTechnicalAnomalyMaintenanceState(supabase),
    listTechnicalAnomalyBackfillState(supabase),
  ]);

  const unavailable = series.error || baselines.error || evaluations.error || maintenance.error || backfill.error;
  const seriesRows = (series.data ?? []) as Array<Record<string, unknown>>;
  const baselineRows = (baselines.data ?? []) as Array<Record<string, unknown>>;
  const evaluationRows = (evaluations.data ?? []) as Array<Record<string, unknown>>;
  const maintenanceRow = maintenance.data as Record<string, unknown> | null;
  const backfillRows = (backfill.data ?? []) as Array<Record<string, unknown>>;

  const baselineBySeries = new Map(baselineRows.map((row) => [String(row.series_id), row]));
  const latestEvaluationBySeries = new Map<string, Record<string, unknown>>();
  for (const row of evaluationRows) {
    const key = String(row.series_id);
    if (!latestEvaluationBySeries.has(key)) latestEvaluationBySeries.set(key, row);
  }

  const ready = baselineRows.filter((row) => row.status === "READY").length;
  const provisional = baselineRows.filter((row) => row.status === "PROVISIONAL").length;
  const insufficient = baselineRows.filter((row) => row.status === "INSUFFICIENT_HISTORY").length;
  const anomalies = evaluationRows.filter((row) => row.state === "ANOMALOUS").length;
  const coverageSuppressed = evaluationRows.filter((row) => ["NO_COVERAGE", "DEGRADED_COVERAGE", "PARTIAL_COVERAGE", "INSUFFICIENT_COVERAGE"].includes(String(row.suppression_reason))).length;
  const manualSuppressed = evaluationRows.filter((row) => ["MANUAL_RUN_PRESENT", "TEST_RUN_PRESENT"].includes(String(row.suppression_reason))).length;
  const completeBackfills = backfillRows.filter((row) => row.complete === true).length;

  return (
    <section className="space-y-5">
      <header className="citem-page-header">
        <div>
          <p className="citem-eyebrow">CİTEM / TechINT / Baseline Diagnostics</p>
          <h1 className="citem-title">Baseline &amp; anomaly diagnostics</h1>
          <p className="citem-subtitle">
            Deterministic, coverage-aware deviations from each technical series&apos; own eligible history. An anomaly is not a threat level, probability, attack count, or business-risk score.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="citem-button-ghost" href="/techint/sources/history">History diagnostics</Link>
          <Link className="citem-button-ghost" href="/techint/sources">Technical Sources</Link>
        </div>
      </header>

      {unavailable ? (
        <div className="card text-amber-300">Baseline diagnostics are unavailable until migration 049 is applied and bounded anomaly maintenance has run.</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="card"><p className="text-xs uppercase tracking-wide text-stone-500">Ready baselines</p><p className="mt-2 text-2xl text-stone-100">{ready}</p></div>
        <div className="card"><p className="text-xs uppercase tracking-wide text-stone-500">Provisional</p><p className="mt-2 text-2xl text-stone-100">{provisional}</p></div>
        <div className="card"><p className="text-xs uppercase tracking-wide text-stone-500">Insufficient history</p><p className="mt-2 text-2xl text-stone-100">{insufficient}</p></div>
        <div className="card"><p className="text-xs uppercase tracking-wide text-stone-500">Anomalies · 24H</p><p className="mt-2 text-2xl text-stone-100">{anomalies}</p></div>
        <div className="card"><p className="text-xs uppercase tracking-wide text-stone-500">Coverage-suppressed</p><p className="mt-2 text-2xl text-stone-100">{coverageSuppressed}</p></div>
        <div className="card"><p className="text-xs uppercase tracking-wide text-stone-500">Manual/test suppressed</p><p className="mt-2 text-2xl text-stone-100">{manualSuppressed}</p></div>
      </div>

      <section className="card space-y-3">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h2 className="citem-section-title">Maintenance state</h2>
            <p className="mt-1 text-xs text-stone-500">The desktop collector requests bounded analysis maintenance after history refresh. Analysis failure is isolated from collection and history state.</p>
          </div>
          <div className="text-right text-xs text-stone-500">
            <div>Series refresh: {time(maintenanceRow?.last_series_refresh_at)}</div>
            <div>Evaluation: {time(maintenanceRow?.last_evaluation_at)}</div>
            <div>Backfill: {time(maintenanceRow?.last_backfill_at)}</div>
            <div>Compaction: {time(maintenanceRow?.last_compaction_at)}</div>
          </div>
        </div>
        <p className="text-xs text-stone-400">Backfill complete: {completeBackfills}/{backfillRows.length} analytical series.</p>
      </section>

      <section className="card">
        <h2 className="citem-section-title">Analytical series</h2>
        <p className="mt-1 text-xs text-stone-500">
          D v1 evaluates only hourly ingestion-time series. Missing activity becomes zero only after a valid scheduled collection opportunity with COMPLETE coverage; otherwise evaluation is suppressed.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-stone-500"><tr><th className="pb-2">Source</th><th>Semantic kind</th><th>Signal type</th><th>Metric</th><th>Baseline</th><th>Samples</th><th>Median</th><th>MAD</th><th>Latest</th><th>Deviation</th><th>Evaluation</th></tr></thead>
            <tbody>
              {seriesRows.map((row) => {
                const baseline = baselineBySeries.get(String(row.id));
                const evaluation = latestEvaluationBySeries.get(String(row.id));
                const metric = String(row.metric_kind) as TechnicalAnomalyMetric;
                return (
                  <tr className="border-t border-stone-800" key={String(row.id)}>
                    <td className="py-3">{String(row.source_key)}</td>
                    <td>{String(row.semantic_kind)}</td>
                    <td>{String(row.signal_type)}</td>
                    <td>{metricLabel(metric)}</td>
                    <td>{baseline ? String(baseline.status) : "—"}</td>
                    <td>{baseline ? String(baseline.sample_count) : "0"}</td>
                    <td>{number(baseline?.median_value)}</td>
                    <td>{number(baseline?.mad_value)}</td>
                    <td>{number(evaluation?.target_value)}</td>
                    <td>{number(evaluation?.robust_deviation_score)}</td>
                    <td>
                      {evaluation ? <Link className="text-amber-300 hover:text-amber-200" href={`/techint/sources/anomalies/${String(evaluation.id)}`}>{String(evaluation.state)}</Link> : "—"}
                    </td>
                  </tr>
                );
              })}
              {!seriesRows.length ? <tr><td className="py-4 text-stone-500" colSpan={11}>No analytical series have been materialized yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="citem-section-title">Recent evaluations</h2>
        <p className="mt-1 text-xs text-stone-500">Suppressed evaluations are first-class results: they explain why CİTEM refused to infer a deviation.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-stone-500"><tr><th className="pb-2">Bucket</th><th>Series</th><th>State</th><th>Kind</th><th>Target</th><th>Median</th><th>Score</th><th>Coverage</th><th>Suppression</th></tr></thead>
            <tbody>{evaluationRows.slice(0, 100).map((row) => (
              <tr className="border-t border-stone-800" key={String(row.id)}>
                <td className="py-3"><Link className="text-amber-300 hover:text-amber-200" href={`/techint/sources/anomalies/${String(row.id)}`}>{time(row.bucket_start)}</Link></td>
                <td>{String(row.series_id).slice(0, 8)}…</td>
                <td>{String(row.state)}</td>
                <td>{row.anomaly_kind ? String(row.anomaly_kind) : "—"}</td>
                <td>{number(row.target_value)}</td>
                <td>{number(row.baseline_median)}</td>
                <td>{number(row.robust_deviation_score)}</td>
                <td>{row.coverage_status ? String(row.coverage_status) : "—"}</td>
                <td>{row.suppression_reason ? String(row.suppression_reason) : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
