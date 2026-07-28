import Link from "next/link";
import { notFound } from "next/navigation";

import { SourceRegistry } from "@/components/sources/source-registry";
import { requireOwnedProject } from "@/lib/projects/ownership";

type RefRow = { source_id: string | null };

export default async function SourcesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireOwnedProject(id);
  const [projectResult, sourcesResult, evidenceResult, observationRefs, enrichmentRefs] =
    await Promise.all([
      context.supabase.from("projects").select("id,name").eq("id", id).single(),
      context.supabase
        .from("sources")
        .select("*")
        .eq("project_id", id)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true }),
      context.supabase
        .from("evidence")
        .select("id,title")
        .eq("project_id", id)
        .order("title", { ascending: true }),
      context.supabase
        .from("indicator_observations")
        .select("source_id")
        .eq("project_id", id)
        .not("source_id", "is", null),
      context.supabase
        .from("enrichment_results")
        .select("source_id")
        .eq("project_id", id),
    ]);

  if (projectResult.error || !projectResult.data) notFound();
  if (
    sourcesResult.error ||
    evidenceResult.error ||
    observationRefs.error ||
    enrichmentRefs.error
  ) {
    return (
      <section className="mx-auto max-w-6xl">
        <div className="card text-red-300">
          Source Registry could not be loaded. Confirm migration 017 is applied and
          reload the Supabase API schema cache.
        </div>
      </section>
    );
  }

  const counts: Record<string, { observations: number; enrichments: number }> = {};
  const ensure = (sourceId: string) =>
    (counts[sourceId] ??= { observations: 0, enrichments: 0 });
  for (const row of (observationRefs.data ?? []) as RefRow[]) {
    if (row.source_id) ensure(row.source_id).observations += 1;
  }
  for (const row of (enrichmentRefs.data ?? []) as RefRow[]) {
    if (row.source_id) ensure(row.source_id).enrichments += 1;
  }

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="citem-label">Investigation / Sources</p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-100">
            {projectResult.data.name}
          </h1>
        </div>
        <Link className="citem-button-ghost" href={`/projects/${id}?tab=evidence`}>
          Back to Evidence
        </Link>
      </div>
      <SourceRegistry
        projectId={id}
        sources={(sourcesResult.data ?? []) as Record<string, unknown>[]}
        evidence={(evidenceResult.data ?? []).map((item) => ({
          id: item.id,
          title: item.title,
        }))}
        referenceCounts={counts}
      />
    </section>
  );
}
