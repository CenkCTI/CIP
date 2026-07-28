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
  return Number.isNaN(date.getTime()) ? "Not set" : date.toLocaleString();
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

  return (
    <section className="mb-6 rounded border border-amber-900/25 bg-black/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="citem-label">Investigation overview</p>
          <h2 className="mt-2 text-xl font-semibold text-stone-100">
            {project.name}
          </h2>
        </div>
        <span className="citem-badge" data-tone="attention">
          {project.investigation_status ?? "DRAFT"}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="citem-label">Research question</dt>
          <dd className="mt-1 whitespace-pre-wrap text-stone-300">
            {project.research_question || "No research question defined"}
          </dd>
        </div>
        <div>
          <dt className="citem-label">Current assessment</dt>
          <dd className="mt-1 whitespace-pre-wrap text-stone-300">
            {project.current_assessment || "No current assessment recorded"}
          </dd>
        </div>
        <div>
          <dt className="citem-label">Assessment confidence</dt>
          <dd className="mt-1 text-stone-300">
            {project.assessment_confidence || "Confidence not assessed"}
          </dd>
        </div>
        <div>
          <dt className="citem-label">Owner</dt>
          <dd className="mt-1 text-stone-300">
            {summary?.ownerLabel ?? "Current analyst"}
          </dd>
        </div>
        <div>
          <dt className="citem-label">Created</dt>
          <dd className="mt-1 text-stone-300">{formatDate(project.created_at)}</dd>
        </div>
        <div>
          <dt className="citem-label">Last updated</dt>
          <dd className="mt-1 text-stone-300">{formatDate(project.updated_at)}</dd>
        </div>
        <div>
          <dt className="citem-label">Closed</dt>
          <dd className="mt-1 text-stone-300">{formatDate(project.closed_at)}</dd>
        </div>
        <div>
          <dt className="citem-label">Tags</dt>
          <dd className="mt-1 text-stone-300">
            {project.tags.length ? project.tags.join(", ") : "No tags"}
          </dd>
        </div>
      </dl>

      <div className="mt-5 border-t border-amber-900/20 pt-4">
        <p className="citem-label">Existing workspace records</p>
        {summary ? (
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(summary.counts).map(([label, count]) => (
              <div className="rounded border border-stone-800/70 p-2" key={label}>
                <dt className="text-xs text-stone-500">{label}</dt>
                <dd className="mt-1 text-lg font-semibold text-stone-200">{count}</dd>
              </div>
            ))}
          </dl>
        ) : failed ? (
          <p className="mt-2 text-sm text-stone-500">
            Counts are temporarily unavailable. Investigation data remains accessible.
          </p>
        ) : (
          <p className="mt-2 text-sm text-stone-500">Loading owned record counts…</p>
        )}
      </div>
    </section>
  );
}
