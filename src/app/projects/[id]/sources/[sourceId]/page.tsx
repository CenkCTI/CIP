import Link from "next/link";
import { notFound } from "next/navigation";

import { requireOwnedProject } from "@/lib/projects/ownership";

type SourceRow = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "");

function formatDate(value: unknown) {
  if (!value) return "Not recorded";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : parsed.toLocaleString();
}

export default async function SourceDetailPage({
  params,
}: {
  params: Promise<{ id: string; sourceId: string }>;
}) {
  const { id, sourceId } = await params;
  const context = await requireOwnedProject(id);
  const { data: source, error } = await context.supabase
    .from("sources")
    .select("*")
    .eq("project_id", context.projectId)
    .eq("id", sourceId)
    .single();
  if (error || !source) notFound();

  const [evidenceResult, observationCount, enrichmentCount] = await Promise.all([
    source.evidence_id
      ? context.supabase
          .from("evidence")
          .select("id,title,type")
          .eq("project_id", context.projectId)
          .eq("id", source.evidence_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
    context.supabase
      .from("indicator_observations")
      .select("id", { count: "exact", head: true })
      .eq("project_id", context.projectId)
      .eq("source_id", sourceId),
    context.supabase
      .from("enrichment_results")
      .select("id", { count: "exact", head: true })
      .eq("project_id", context.projectId)
      .eq("source_id", sourceId),
  ]);

  const row = source as SourceRow;
  return (
    <section className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="text-sm text-amber-300" href={`/projects/${id}/sources`}>
          ← Back to Source Registry
        </Link>
        <span className="text-xs text-stone-600">
          {observationCount.count ?? 0} observation · {enrichmentCount.count ?? 0}{" "}
          enrichment result
        </span>
      </div>

      <article className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="citem-label">Structured Source</p>
            <h1 className="mt-2 text-3xl font-semibold text-stone-100">
              {text(row.title)}
            </h1>
            <p className="mt-2 text-sm text-stone-400">
              {text(row.publisher) || "No publisher"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="citem-badge">{text(row.source_type)}</span>
            <span className="citem-badge">{text(row.reliability)}</span>
            <span className="citem-badge">{text(row.verification_state)}</span>
            {row.archived_at ? (
              <span className="citem-badge" data-tone="attention">
                ARCHIVED
              </span>
            ) : null}
          </div>
        </div>

        {row.url ? (
          <a
            className="mt-4 block break-all text-sm text-amber-300 hover:underline"
            href={text(row.url)}
            rel="noreferrer"
            target="_blank"
          >
            {text(row.url)}
          </a>
        ) : null}

        <dl className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <dt className="citem-label">Published</dt>
            <dd className="mt-1 text-sm text-stone-300">
              {formatDate(row.published_at)}
            </dd>
          </div>
          <div>
            <dt className="citem-label">Accessed</dt>
            <dd className="mt-1 text-sm text-stone-300">
              {formatDate(row.accessed_at)}
            </dd>
          </div>
          <div>
            <dt className="citem-label">Origin</dt>
            <dd className="mt-1 text-sm text-stone-300">{text(row.origin_kind)}</dd>
          </div>
          <div>
            <dt className="citem-label">Archived</dt>
            <dd className="mt-1 text-sm text-stone-300">
              {formatDate(row.archived_at)}
            </dd>
          </div>
          <div className="md:col-span-2">
            <dt className="citem-label">Description</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm text-stone-300">
              {text(row.description) || "No description"}
            </dd>
          </div>
          <div className="md:col-span-2">
            <dt className="citem-label">Analyst notes</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm text-stone-300">
              {text(row.analyst_notes) || "No analyst notes"}
            </dd>
          </div>
        </dl>

        {evidenceResult.data ? (
          <div className="mt-6 rounded border border-stone-800/80 bg-black/10 p-3">
            <p className="citem-label">Linked Evidence</p>
            <Link
              className="mt-2 block text-sm text-amber-300 hover:underline"
              href={`/projects/${id}?tab=evidence#evidence-${evidenceResult.data.id}`}
            >
              {evidenceResult.data.title} · {evidenceResult.data.type}
            </Link>
          </div>
        ) : null}
      </article>
    </section>
  );
}
