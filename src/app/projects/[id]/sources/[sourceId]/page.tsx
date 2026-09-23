import { notFound } from "next/navigation";
import { z } from "zod";

import { SourceReaderWorkspace } from "@/components/investigations/source-reader/source-reader-workspace";
import { requireOwnedProject } from "@/lib/projects/ownership";

const uuidSchema = z.string().uuid();

export default async function SourceDetailPage({
  params,
}: {
  params: Promise<{ id: string; sourceId: string }>;
}) {
  const { id, sourceId } = await params;
  if (!uuidSchema.safeParse(sourceId).success) notFound();
  const context = await requireOwnedProject(id).catch(() => notFound());

  const [
    sourceResult,
    assetResult,
    gapsResult,
    requirementsResult,
    sourceGapLinksResult,
    sourceRequirementLinksResult,
    notesResult,
    annotationsResult,
    annotationGapLinksResult,
    annotationRequirementLinksResult,
  ] = await Promise.all([
    context.supabase
      .from("sources")
      .select("*")
      .eq("project_id", context.projectId)
      .eq("id", sourceId)
      .single(),
    context.supabase
      .from("source_assets")
      .select("*")
      .eq("project_id", context.projectId)
      .eq("source_id", sourceId)
      .eq("asset_role", "ORIGINAL")
      .eq("state", "READY")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    context.supabase
      .from("investigation_information_gaps")
      .select("id,description,status")
      .eq("project_id", context.projectId)
      .order("sort_order", { ascending: true }),
    context.supabase
      .from("collection_requirements")
      .select("id,requirement,status,priority")
      .eq("project_id", context.projectId)
      .order("sort_order", { ascending: true }),
    context.supabase
      .from("source_gap_links")
      .select("gap_id")
      .eq("project_id", context.projectId)
      .eq("source_id", sourceId),
    context.supabase
      .from("source_requirement_links")
      .select("requirement_id")
      .eq("project_id", context.projectId)
      .eq("source_id", sourceId),
    context.supabase
      .from("source_notes")
      .select("*")
      .eq("project_id", context.projectId)
      .eq("source_id", sourceId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    context.supabase
      .from("source_annotations")
      .select("*")
      .eq("project_id", context.projectId)
      .eq("source_id", sourceId)
      .order("page_number", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    context.supabase
      .from("source_annotation_gap_links")
      .select("annotation_id,gap_id")
      .eq("project_id", context.projectId),
    context.supabase
      .from("source_annotation_requirement_links")
      .select("annotation_id,requirement_id")
      .eq("project_id", context.projectId),
  ]);

  if (sourceResult.error || !sourceResult.data) notFound();

  const [evidenceResult, observationCount, enrichmentCount] = await Promise.all([
    sourceResult.data.evidence_id
      ? context.supabase
          .from("evidence")
          .select("id,title,type")
          .eq("project_id", context.projectId)
          .eq("id", sourceResult.data.evidence_id)
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
  const legacyReferenceError =
    evidenceResult.error || observationCount.error || enrichmentCount.error;

  const failed = [
    assetResult,
    gapsResult,
    requirementsResult,
    sourceGapLinksResult,
    sourceRequirementLinksResult,
    notesResult,
    annotationsResult,
    annotationGapLinksResult,
    annotationRequirementLinksResult,
  ].some((result) => result.error) || Boolean(legacyReferenceError);

  if (failed) {
    return (
      <section className="mx-auto max-w-6xl">
        <div className="card text-red-300">
          Source Reader yüklenemedi. Stage 2 migration 054'ün uygulanmış olduğunu
          doğrulayın.
        </div>
      </section>
    );
  }

  const asset = assetResult.data ?? null;
  let signedUrl: string | null = null;
  if (asset?.storage_path) {
    const { data } = await context.supabase.storage
      .from("source-assets")
      .createSignedUrl(String(asset.storage_path), 15 * 60);
    signedUrl = data?.signedUrl ?? null;
  }

  const annotationIds = new Set(
    (annotationsResult.data ?? []).map((annotation) => annotation.id),
  );

  return (
    <SourceReaderWorkspace
      projectId={context.projectId}
      source={sourceResult.data}
      asset={asset}
      signedUrl={signedUrl}
      gaps={gapsResult.data ?? []}
      requirements={requirementsResult.data ?? []}
      sourceGapIds={(sourceGapLinksResult.data ?? []).map((link) => link.gap_id)}
      sourceRequirementIds={(sourceRequirementLinksResult.data ?? []).map(
        (link) => link.requirement_id,
      )}
      notes={notesResult.data ?? []}
      annotations={annotationsResult.data ?? []}
      annotationGapLinks={(annotationGapLinksResult.data ?? []).filter((link) =>
        annotationIds.has(link.annotation_id),
      )}
      annotationRequirementLinks={(annotationRequirementLinksResult.data ?? []).filter(
        (link) => annotationIds.has(link.annotation_id),
      )}
    />
  );
}
