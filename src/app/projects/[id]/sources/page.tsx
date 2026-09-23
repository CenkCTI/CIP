import Link from "next/link";
import { notFound } from "next/navigation";

import { SourceLibrary } from "@/components/investigations/sources/source-library";
import { requireOwnedProject } from "@/lib/projects/ownership";

type CountRow = { source_id: string };

function counts(rows: CountRow[]) {
  const out: Record<string, number> = {};
  for (const row of rows) out[row.source_id] = (out[row.source_id] ?? 0) + 1;
  return out;
}

export default async function SourcesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireOwnedProject(id).catch(() => notFound());
  const [
    projectResult,
    sourcesResult,
    gapsResult,
    requirementsResult,
    sourceGapLinksResult,
    sourceRequirementLinksResult,
    assetsResult,
    notesResult,
    annotationsResult,
  ] = await Promise.all([
    context.supabase.from("projects").select("id,name,research_question").eq("id", id).single(),
    context.supabase
      .from("sources")
      .select("id,title,source_type,publisher,url,published_at,accessed_at,collection_rationale,description,archived_at,updated_at")
      .eq("project_id", id)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true }),
    context.supabase
      .from("investigation_information_gaps")
      .select("id,description,status")
      .eq("project_id", id)
      .order("sort_order", { ascending: true }),
    context.supabase
      .from("collection_requirements")
      .select("id,requirement,status,priority")
      .eq("project_id", id)
      .order("sort_order", { ascending: true }),
    context.supabase
      .from("source_gap_links")
      .select("source_id,gap_id")
      .eq("project_id", id),
    context.supabase
      .from("source_requirement_links")
      .select("source_id,requirement_id")
      .eq("project_id", id),
    context.supabase
      .from("source_assets")
      .select("source_id")
      .eq("project_id", id)
      .eq("state", "READY"),
    context.supabase.from("source_notes").select("source_id").eq("project_id", id),
    context.supabase.from("source_annotations").select("source_id").eq("project_id", id),
  ]);

  if (projectResult.error || !projectResult.data) notFound();
  const failed = [
    sourcesResult,
    gapsResult,
    requirementsResult,
    sourceGapLinksResult,
    sourceRequirementLinksResult,
    assetsResult,
    notesResult,
    annotationsResult,
  ].some((result) => result.error);
  if (failed) {
    return (
      <section className="mx-auto max-w-6xl">
        <div className="card text-red-300">
          Source workspace yüklenemedi. Stage 2 migration 054'ün uygulanmış
          olduğunu doğrulayın.
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="citem-label">Investigation / Sources</p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-100">
            {projectResult.data.name}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-stone-500">
            Kaynağın neden toplandığını, hangi gap/requirement'a hizmet ettiğini ve
            analyst çalışma izlerini kaybetmeden saklayın.
          </p>
        </div>
        <Link className="citem-button-ghost" href={`/projects/${id}/collection`}>
          ← Collection
        </Link>
      </header>
      <SourceLibrary
        projectId={id}
        sources={sourcesResult.data ?? []}
        gaps={gapsResult.data ?? []}
        requirements={requirementsResult.data ?? []}
        sourceGapLinks={sourceGapLinksResult.data ?? []}
        sourceRequirementLinks={sourceRequirementLinksResult.data ?? []}
        assetCounts={counts((assetsResult.data ?? []) as CountRow[])}
        noteCounts={counts((notesResult.data ?? []) as CountRow[])}
        annotationCounts={counts((annotationsResult.data ?? []) as CountRow[])}
      />
    </section>
  );
}
