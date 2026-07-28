"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { runIndicatorEnrichment } from "@/app/projects/[id]/enrichment-actions";
import type { PublicEnrichmentProvider } from "@/lib/enrichment/types";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "");

function formatDate(value: unknown) {
  if (!value) return "Not recorded";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : parsed.toLocaleString();
}

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function ResultCard({ result, source }: { result: Row; source?: Row }) {
  const normalized = object(result.normalized_data);
  const attributes = object(normalized.attributes);
  const verdict = normalized.provider_verdict ? object(normalized.provider_verdict) : null;
  const related = array(normalized.related_indicators).filter(
    (item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)),
  );
  return (
    <article className="rounded border border-stone-800/80 bg-black/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="citem-badge">{text(result.category)}</span>
        <span className="text-xs text-stone-500">Queried {formatDate(result.queried_at)}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-stone-300">{text(normalized.summary)}</p>
      {normalized.synthetic_notice ? <p className="mt-2 rounded border border-amber-900/40 bg-amber-950/10 p-2 text-xs font-semibold text-amber-300">{text(normalized.synthetic_notice)}</p> : null}
      {Object.keys(attributes).length ? (
        <dl className="mt-3 grid gap-2 md:grid-cols-2">
          {Object.entries(attributes).map(([key, value]) => (
            <div key={key}><dt className="text-xs uppercase text-stone-600">{key.replaceAll("_", " ")}</dt><dd className="mt-1 break-all text-sm text-stone-300">{value === null ? "null" : String(value)}</dd></div>
          ))}
        </dl>
      ) : null}
      {related.length ? (
        <div className="mt-3"><p className="citem-label">Provider-observed related Indicators</p><ul className="mt-2 grid gap-1 text-xs text-stone-400">{related.map((item, index) => <li key={`${text(item.type)}:${text(item.value)}:${index}`}><code>{text(item.type)} · {text(item.value)}</code> — {text(item.relationship)}</li>)}</ul><p className="mt-2 text-xs text-stone-600">These observations are not automatically added as Indicators, Graph edges or analyst conclusions.</p></div>
      ) : null}
      {verdict ? <div className="mt-3 rounded border border-stone-800 p-3"><p className="citem-label">Provider verdict</p><p className="mt-1 text-sm text-stone-300">{text(verdict.label)}{verdict.score !== null && verdict.score !== undefined ? ` · score ${text(verdict.score)}` : ""}</p></div> : null}
      <dl className="mt-3 grid gap-2 text-xs md:grid-cols-3">
        <div><dt className="text-stone-600">Provider observed</dt><dd className="mt-1 text-stone-400">{formatDate(result.provider_observed_at)}</dd></div>
        <div><dt className="text-stone-600">Fresh until</dt><dd className="mt-1 text-stone-400">{formatDate(result.expires_at)}</dd></div>
        <div><dt className="text-stone-600">Result confidence</dt><dd className="mt-1 text-stone-400">{text(result.confidence) || "Not assessed"}</dd></div>
      </dl>
      <div className="mt-3 text-xs text-stone-500">Source: {source ? `${text(source.title)} · ${text(source.source_type)}${source.archived_at ? " · archived" : ""}` : "Unavailable Source"}</div>
      {result.safe_raw_data ? <details className="mt-3"><summary className="cursor-pointer text-xs text-stone-500">Sanitized JSON debugging view</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-black/20 p-3 text-xs text-stone-500">{JSON.stringify(result.safe_raw_data, null, 2)}</pre></details> : null}
    </article>
  );
}

export function IndicatorEnrichment({
  projectId,
  indicatorId,
  indicatorType,
  providers,
  runs,
  results,
  sources,
}: {
  projectId: string;
  indicatorId: string;
  indicatorType: string;
  providers: PublicEnrichmentProvider[];
  runs: Row[];
  results: Row[];
  sources: Row[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  const sourceById = new Map(sources.map((source) => [text(source.id), source]));
  const resultsByRun = new Map<string, Row[]>();
  for (const result of results) {
    const runId = text(result.run_id);
    resultsByRun.set(runId, [...(resultsByRun.get(runId) ?? []), result]);
  }

  function run(providerId: string) {
    setMessage({});
    startTransition(() => {
      void runIndicatorEnrichment(projectId, indicatorId, providerId).then((outcome) => {
        if (outcome.ok) setMessage({ success: `${outcome.resultCount} normalized enrichment result${outcome.resultCount === 1 ? "" : "s"} stored.` });
        else setMessage({ error: outcome.error });
        router.refresh();
      });
    });
  }

  return (
    <section className="card" id="enrichment">
      <p className="citem-label">Technical context</p>
      <h2 className="mt-2 text-lg font-semibold text-stone-100">Enrichment</h2>
      <p className="mt-2 text-sm leading-6 text-stone-500">Provider queries run on the server against the canonical Indicator. They never scan, resolve or visit user-controlled targets outside a fixed provider adapter.</p>
      <p className="mt-3 rounded border border-amber-900/40 bg-amber-950/10 p-3 text-sm text-amber-300">A provider verdict is external technical context, not CİTEM&apos;s final analyst assessment.</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {providers.length ? providers.map((provider) => {
          const supported = provider.supportedIndicatorTypes.includes(indicatorType as never);
          return (
            <article className="rounded border border-stone-800 p-3" key={provider.id}>
              <div className="flex flex-wrap gap-2"><span className="citem-badge">{provider.displayName}</span>{provider.isSynthetic ? <span className="citem-badge" data-tone="attention">TEST / SYNTHETIC</span> : <span className="citem-badge">LIVE</span>}</div>
              <p className="mt-2 text-xs text-stone-500">{provider.dataSharingWarning}</p>
              <p className="mt-2 text-xs text-stone-500">Configured: {provider.configured ? "yes" : "no"} · {supported ? `Supports ${indicatorType}` : `Does not support ${indicatorType}`}</p>
              <button className="citem-button mt-3" type="button" disabled={pending || !provider.enabled || !provider.configured || !supported} onClick={() => run(provider.id)}>{pending ? "Running…" : "Run enrichment"}</button>
            </article>
          );
        }) : <p className="rounded border border-stone-800 p-3 text-sm text-stone-500">No enrichment provider is enabled. For Preview acceptance set ENRICHMENT_ENABLED=true and ENRICHMENT_FIXTURE_ENABLED=true, then redeploy.</p>}
      </div>

      {message.error ? <p className="mt-4 text-sm text-red-300" role="alert">{message.error}</p> : null}
      {message.success ? <p className="mt-4 text-sm text-emerald-300">{message.success}</p> : null}

      <div className="mt-6">
        <h3 className="font-semibold text-stone-100">Run history</h3>
        {runs.length ? <ol className="mt-3 grid gap-4">{runs.map((run) => {
          const runResults = resultsByRun.get(text(run.id)) ?? [];
          return (
            <li className="rounded border border-stone-800/80 p-4" key={text(run.id)}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2"><span className="citem-badge">{text(run.provider_label_snapshot)}</span><span className="citem-badge">{text(run.status)}</span>{run.is_synthetic ? <span className="citem-badge" data-tone="attention">SYNTHETIC</span> : null}</div><p className="mt-2 break-all font-mono text-xs text-stone-500">{text(run.indicator_type_snapshot)} · {text(run.indicator_value_snapshot)}</p></div><div className="text-right text-xs text-stone-500"><p>Requested {formatDate(run.requested_at)}</p><p>Completed {formatDate(run.completed_at)}</p></div></div>
              {run.safe_error_message ? <p className="mt-3 rounded border border-red-900/40 bg-red-950/10 p-3 text-sm text-red-300">{text(run.safe_error_code)} · {text(run.safe_error_message)}</p> : null}
              {runResults.length ? <div className="mt-4 grid gap-3">{runResults.map((result) => <ResultCard key={text(result.id)} result={result} source={sourceById.get(text(result.source_id))} />)}</div> : <p className="mt-3 text-sm text-stone-600">No results were stored for this run.</p>}
            </li>
          );
        })}</ol> : <p className="mt-3 text-sm text-stone-500">No enrichment runs recorded.</p>}
      </div>
    </section>
  );
}
