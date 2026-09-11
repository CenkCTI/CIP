"use client";

import { useEffect, useState } from "react";

import type { Project } from "@/lib/projects/schema";

type Summary = {
  ownerLabel: string;
  counts: Record<string, number>;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : date.toLocaleDateString();
}

function TextList({
  values,
  empty,
  tone = "neutral",
}: {
  values: string[] | null | undefined;
  empty: string;
  tone?: "neutral" | "gap" | "question";
}) {
  if (!values?.length) return <p className="text-sm text-stone-500">{empty}</p>;

  return (
    <ul className="space-y-2">
      {values.map((value, index) => (
        <li
          className="flex gap-2 text-sm leading-6 text-stone-300"
          key={`${value}-${index}`}
        >
          <span
            className={
              tone === "gap"
                ? "mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                : tone === "question"
                  ? "mt-0.5 shrink-0 font-mono text-xs text-amber-400"
                  : "mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-stone-600"
            }
          >
            {tone === "question" ? "?" : null}
          </span>
          <span>{value}</span>
        </li>
      ))}
    </ul>
  );
}

function ScopeGroup({ label, values }: { label: string; values?: string[] | null }) {
  if (!values?.length) return null;
  return (
    <div>
      <p className="citem-label">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <span
            className="rounded border border-amber-900/30 bg-amber-950/10 px-2.5 py-1 text-xs text-stone-300"
            key={value}
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

export function InvestigationSummary({ project }: { project: Project }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(project.id)}/investigation-summary`,
          {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error("summary_unavailable");
        const data = (await response.json()) as Summary;
        if (active) setSummary(data);
      } catch (error) {
        if (active && (error as Error).name !== "AbortError") setFailed(true);
      }
    }

    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [project.id]);

  const hasScope = Boolean(
    project.scope_geography?.length ||
      project.scope_sectors?.length ||
      project.scope_activity_types?.length ||
      project.scope_actors?.length ||
      project.scope_technologies?.length ||
      project.scope_time_start ||
      project.scope_time_end ||
      project.out_of_scope,
  );

  return (
    <section className="mb-6 space-y-4">
      <div className="overflow-hidden rounded border border-amber-900/30 bg-[linear-gradient(135deg,rgba(185,130,47,0.08),rgba(0,0,0,0.08)_42%,rgba(17,21,24,0.92))]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-amber-900/20 px-5 py-4">
          <div>
            <p className="citem-label">Stage 1 / Direction</p>
            <h2 className="mt-2 text-xl font-semibold text-stone-100">Intelligence requirement</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="citem-badge" data-tone="attention">
              {project.investigation_status ?? "DRAFT"}
            </span>
            <span className="rounded border border-stone-800/80 px-2.5 py-1 text-xs text-stone-400">
              {project.priority ?? "MEDIUM"} priority
            </span>
          </div>
        </div>

        <div className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.55fr)]">
          <div>
            <p className="citem-label">Primary intelligence question</p>
            <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-stone-200">
              {project.research_question || "No primary intelligence question defined."}
            </p>
          </div>
          <div className="border-l-0 border-amber-900/20 lg:border-l lg:pl-5">
            <p className="citem-label">Purpose / objective</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-400">
              {project.purpose || "Purpose has not been defined yet."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="citem-label">Decision context</p>
              <h3 className="mt-1 text-base font-semibold text-stone-100">Who will use the answer?</h3>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600">Context</span>
          </div>

          <dl className="mt-4 space-y-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-stone-500">Intended consumer</dt>
              <dd className="mt-1 text-sm leading-6 text-stone-300">
                {project.intended_consumer || "Not specified"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-stone-500">Decision / intelligence use</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-300">
                {project.decision_context || "Not specified"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-stone-500">Expected product</dt>
              <dd className="mt-1 text-sm leading-6 text-stone-300">
                {project.expected_product_type || "Not specified"}
              </dd>
            </div>
          </dl>
        </article>

        <article className="card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="citem-label">Scope</p>
              <h3 className="mt-1 text-base font-semibold text-stone-100">Research boundaries</h3>
            </div>
            {(project.scope_time_start || project.scope_time_end) && (
              <span className="text-xs text-stone-500">
                {project.scope_time_start || "…"} → {project.scope_time_end || "…"}
              </span>
            )}
          </div>

          {hasScope ? (
            <div className="mt-4 space-y-4">
              <ScopeGroup label="Geography" values={project.scope_geography} />
              <ScopeGroup label="Sector" values={project.scope_sectors} />
              <ScopeGroup label="Activity" values={project.scope_activity_types} />
              <ScopeGroup label="Actors / clusters" values={project.scope_actors} />
              <ScopeGroup label="Technology" values={project.scope_technologies} />
              {project.out_of_scope ? (
                <div className="border-t border-stone-800/70 pt-3">
                  <p className="citem-label">Out of scope</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-400">
                    {project.out_of_scope}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-stone-500">
              Scope is intentionally open. Add boundaries when they become useful to collection and analysis.
            </p>
          )}
        </article>
      </div>

      <article className="card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="citem-label">Intelligence questions</p>
            <h3 className="mt-1 text-base font-semibold text-stone-100">Supporting questions</h3>
          </div>
          <span className="text-xs text-stone-500">
            {project.supporting_questions?.length ?? 0} active working questions
          </span>
        </div>
        <div className="mt-4">
          <TextList
            values={project.supporting_questions}
            empty="No supporting questions yet. Add them only when the primary question needs to be decomposed."
            tone="question"
          />
        </div>
      </article>

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="card">
          <p className="citem-label">Current understanding</p>
          <h3 className="mt-1 text-base font-semibold text-stone-100">What we know</h3>
          <div className="mt-4">
            <TextList
              values={project.current_knowledge}
              empty="No working knowledge recorded yet."
            />
          </div>
        </article>

        <article className="card">
          <p className="citem-label">Collection direction</p>
          <h3 className="mt-1 text-base font-semibold text-stone-100">Information gaps</h3>
          <div className="mt-4">
            <TextList
              values={project.information_gaps}
              empty="No information gaps recorded yet."
              tone="gap"
            />
          </div>
        </article>
      </div>

      {(project.current_assessment || project.assessment_confidence) && (
        <article className="rounded border border-stone-800/80 bg-black/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="citem-label">Analytic state</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-300">
                {project.current_assessment || "No current assessment recorded."}
              </p>
            </div>
            <span className="rounded border border-amber-900/30 px-2.5 py-1 text-xs text-amber-300">
              {project.assessment_confidence ? `${project.assessment_confidence} confidence` : "Confidence not assessed"}
            </span>
          </div>
        </article>
      )}

      <article className="rounded border border-stone-800/70 bg-black/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="citem-label">Workspace</p>
            <p className="mt-1 text-sm text-stone-500">
              Existing records remain analyst-controlled and separate from the direction layer.
            </p>
          </div>
          <div className="text-right text-xs text-stone-500">
            <p>{summary?.ownerLabel ?? "Current analyst"}</p>
            <p className="mt-1">Updated {formatDate(project.updated_at)}</p>
          </div>
        </div>

        {summary ? (
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(summary.counts).map(([label, count]) => (
              <div className="rounded border border-stone-800/70 bg-black/10 p-2.5" key={label}>
                <dt className="text-[11px] uppercase tracking-wide text-stone-600">{label}</dt>
                <dd className="mt-1 text-lg font-semibold text-stone-200">{count}</dd>
              </div>
            ))}
          </dl>
        ) : failed ? (
          <p className="mt-3 text-sm text-stone-500">
            Counts are temporarily unavailable. Investigation data remains accessible.
          </p>
        ) : (
          <p className="mt-3 text-sm text-stone-500">Loading owned record counts…</p>
        )}
      </article>
    </section>
  );
}
