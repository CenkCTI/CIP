import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { metricLabel } from "@/lib/techint/analysis/config";
import {
  getTechnicalAnalysisSeries,
  getTechnicalAnomalyEvaluation,
  getTechnicalBaselineProfile,
  listTechnicalSeriesEvaluations,
} from "@/lib/techint/analysis/queries";
import type { TechnicalAnomalyMetric } from "@/lib/techint/analysis/types";
import type { TechnicalSourceKey } from "@/lib/techint/collection/types";
import { sourceSemanticMetadataForKey } from "@/lib/techint/semantics/source-semantics";

function time(value: unknown) {
  return typeof value === "string" ? new Date(value).toLocaleString() : "—";
}

function number(value: unknown, digits = 2) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits).replace(/\.00$/, "") : "—";
}

function percent(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${(parsed * 100).toFixed(1)}%` : "—";
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const evaluationResult = await getTechnicalAnomalyEvaluation(supabase, id);
  const evaluation = evaluationResult.data as Record<string, unknown> | null;
  if (!evaluation) notFound();

  const seriesId = String(evaluation.series_id);
  const [seriesResult, baselineResult, historyResult] = await Promise.all([
    getTechnicalAnalysisSeries(supabase, seriesId),
    getTechnicalBaselineProfile(supabase, seriesId),
    listTechnicalSeriesEvaluations(supabase, seriesId, 20),
  ]);
  const series = seriesResult.data as Record<string, unknown> | null;
  if (!series) notFound();
  const baseline = baselineResult.data as Record<string, unknown> | null;
  const history = (historyResult.data ?? []) as Array<Record<string, unknown>>;
  const sourceKey = String(series.source_key) as TechnicalSourceKey;
  const semantics = sourceSemanticMetadataForKey(sourceKey);
  const metric = String(series.metric_kind) as TechnicalAnomalyMetric;

  const state = String(evaluation.state);
  const deterministicSummary = state === "SUPPRESSED"
    ? `CİTEM did not infer a deviation because ${String(evaluation.suppression_reason ?? "the analytical preconditions were not satisfied")}.`
    : state === "ANOMALOUS" || state === "PROVISIONAL_DEVIATION"
      ? `${metricLabel(metric)} was ${number(evaluation.target_value)} versus a baseline median of ${number(evaluation.baseline_median)}. The deterministic evaluation is ${state}.`
      : `${metricLabel(metric)} remained within the deterministic baseline gates for this eligible collection opportunity.`;

  return (
    <section className="space-y-5">
      <header className="citem-page-header">
        <div>
          <p className="citem-eyebrow">CİTEM / TechINT / Anomaly Explainability</p>
          <h1 className="citem-title">{String(series.source_key)} · {metricLabel(metric)}</h1>
          <p className="citem-subtitle">{deterministicSummary}</p>
        </div>
        <Link className="citem-button-ghost" href="/techint/sources/anomalies">Back to anomaly diagnostics</Link>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="card"><p className="text-xs uppercase tracking-wide text-stone-500">Evaluation</p><p className="mt-2 text-xl text-stone-100">{state}</p></div>
        <div className="card"><p className="text-xs uppercase tracking-wide text-stone-500">Target</p><p className="mt-2 text-xl text-stone-100">{number(evaluation.target_value)}</p></div>
        <div className="card"><p className="text-xs uppercase tracking-wide text-stone-500">Baseline median</p><p className="mt-2 text-xl text-stone-100">{number(evaluation.baseline_median)}</p></div>
        <div className="card"><p className="text-xs uppercase tracking-wide text-stone-500">Robust deviation</p><p className="mt-2 text-xl text-stone-100">{number(evaluation.robust_deviation_score)}</p></div>
      </div>

      <section className="card">
        <h2 className="citem-section-title">What changed</h2>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
          <div><p className="text-xs text-stone-500">Bucket</p><p>{time(evaluation.bucket_start)}</p></div>
          <div><p className="text-xs text-stone-500">Direction</p><p>{String(evaluation.direction)}</p></div>
          <div><p className="text-xs text-stone-500">Anomaly kind</p><p>{evaluation.anomaly_kind ? String(evaluation.anomaly_kind) : "—"}</p></div>
          <div><p className="text-xs text-stone-500">Suppression</p><p>{evaluation.suppression_reason ? String(evaluation.suppression_reason) : "—"}</p></div>
          <div><p className="text-xs text-stone-500">Absolute delta</p><p>{number(evaluation.absolute_delta)}</p></div>
          <div><p className="text-xs text-stone-500">Relative delta</p><p>{percent(evaluation.relative_delta)}</p></div>
          <div><p className="text-xs text-stone-500">Method</p><p>{String(evaluation.method)}</p></div>
          <div><p className="text-xs text-stone-500">Baseline status</p><p>{String(evaluation.baseline_status)}</p></div>
        </div>
      </section>

      <section className="card">
        <h2 className="citem-section-title">Baseline</h2>
        <p className="mt-1 text-xs text-stone-500">The target bucket is never included in its own baseline. D v1 uses at most 64 eligible collection opportunities from the prior 30 days.</p>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-3 xl:grid-cols-5">
          <div><p className="text-xs text-stone-500">Samples</p><p>{String(evaluation.baseline_sample_count)}</p></div>
          <div><p className="text-xs text-stone-500">Median</p><p>{number(evaluation.baseline_median)}</p></div>
          <div><p className="text-xs text-stone-500">MAD</p><p>{number(evaluation.baseline_mad)}</p></div>
          <div><p className="text-xs text-stone-500">Q1</p><p>{number(evaluation.baseline_q1)}</p></div>
          <div><p className="text-xs text-stone-500">Q3</p><p>{number(evaluation.baseline_q3)}</p></div>
          <div><p className="text-xs text-stone-500">Current profile as-of</p><p>{time(baseline?.as_of)}</p></div>
          <div><p className="text-xs text-stone-500">Strict samples</p><p>{baseline ? String(baseline.strict_sample_count) : "—"}</p></div>
          <div><p className="text-xs text-stone-500">Provisional samples</p><p>{baseline ? String(baseline.provisional_sample_count) : "—"}</p></div>
          <div><p className="text-xs text-stone-500">P10 / P90</p><p>{number(baseline?.p10)} / {number(baseline?.p90)}</p></div>
          <div><p className="text-xs text-stone-500">Zero samples</p><p>{baseline ? String(baseline.zero_count) : "—"}</p></div>
        </div>
      </section>

      <section className="card">
        <h2 className="citem-section-title">Collection validity</h2>
        <p className="mt-1 text-xs text-stone-500">A volume drop is never inferred from missing or failed collection. Manual/test runs contaminate an hourly bucket and force suppression.</p>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-3 xl:grid-cols-5">
          <div><p className="text-xs text-stone-500">Coverage</p><p>{evaluation.coverage_status ? String(evaluation.coverage_status) : "—"}</p></div>
          <div><p className="text-xs text-stone-500">Schedule known</p><p>{evaluation.schedule_known === true ? "yes" : evaluation.schedule_known === false ? "reconstructed" : "—"}</p></div>
          <div><p className="text-xs text-stone-500">Expected / attempted</p><p>{String(evaluation.expected_runs)} / {String(evaluation.attempted_runs)}</p></div>
          <div><p className="text-xs text-stone-500">Successful / failed</p><p>{String(evaluation.successful_runs)} / {String(evaluation.failed_runs)}</p></div>
          <div><p className="text-xs text-stone-500">Running</p><p>{String(evaluation.running_runs)}</p></div>
          <div><p className="text-xs text-stone-500">Scheduled runs</p><p>{String(evaluation.scheduled_run_count)}</p></div>
          <div><p className="text-xs text-stone-500">Manual runs</p><p>{String(evaluation.manual_run_count)}</p></div>
          <div><p className="text-xs text-stone-500">Test runs</p><p>{String(evaluation.test_run_count)}</p></div>
        </div>
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="citem-section-title">Semantics</h2>
          <p className="mt-1 text-xs text-stone-500">The statistical deviation inherits the source&apos;s deterministic epistemic boundary; it does not upgrade reporting into direct observation.</p>
        </div>
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <div><p className="text-xs text-stone-500">Source class</p><p>{String(series.source_class)}</p></div>
          <div><p className="text-xs text-stone-500">Observation basis</p><p>{String(series.observation_basis)}</p></div>
          <div><p className="text-xs text-stone-500">Semantic kind</p><p>{String(series.semantic_kind)}</p></div>
        </div>
        <div className="rounded border border-stone-800 p-3 text-sm"><p className="text-xs uppercase tracking-wide text-stone-500">Represents</p><p className="mt-1 text-stone-300">{semantics.represents}</p></div>
        <div className="rounded border border-stone-800 p-3 text-sm"><p className="text-xs uppercase tracking-wide text-stone-500">Does not represent</p><p className="mt-1 text-stone-300">{semantics.doesNotRepresent}</p></div>
      </section>

      <section className="card">
        <h2 className="citem-section-title">Recent evaluations for this series</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-stone-500"><tr><th className="pb-2">Bucket</th><th>State</th><th>Target</th><th>Median</th><th>Score</th><th>Coverage</th><th>Suppression</th></tr></thead>
            <tbody>{history.map((row) => (
              <tr className="border-t border-stone-800" key={String(row.id)}>
                <td className="py-3">{time(row.bucket_start)}</td><td>{String(row.state)}</td><td>{number(row.target_value)}</td><td>{number(row.baseline_median)}</td><td>{number(row.robust_deviation_score)}</td><td>{row.coverage_status ? String(row.coverage_status) : "—"}</td><td>{row.suppression_reason ? String(row.suppression_reason) : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="card text-xs text-stone-500">
        <p>Series key: {String(series.series_key)}</p>
        <p>Engine: {String(evaluation.engine_version)} · Config: {String(evaluation.config_version)} · Semantics: {String(evaluation.semantics_version)}</p>
        <p>Input fingerprint: {String(evaluation.input_fingerprint)}</p>
        <p>Calculated: {time(evaluation.calculated_at)}</p>
      </section>
    </section>
  );
}
