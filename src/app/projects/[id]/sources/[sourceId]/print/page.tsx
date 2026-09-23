import { notFound } from "next/navigation";
import { z } from "zod";

import { SourcePrintPacket } from "@/components/investigations/source-reader/source-print-packet";
import { requireOwnedProject } from "@/lib/projects/ownership";

const uuidSchema = z.string().uuid();

export default async function SourcePrintPage({
  params,
}: {
  params: Promise<{ id: string; sourceId: string }>;
}) {
  const { id, sourceId } = await params;
  if (!uuidSchema.safeParse(sourceId).success) notFound();
  const context = await requireOwnedProject(id).catch(() => notFound());

  const [
    projectResult,
    sourceResult,
    assetResult,
    sourceGapLinksResult,
    sourceRequirementLinksResult,
    notesResult,
    annotationsResult,
  ] = await Promise.all([
    context.supabase
      .from("projects")
      .select("id,name,research_question")
      .eq("id", context.projectId)
      .single(),
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
  ]);

  if (
    projectResult.error ||
    !projectResult.data ||
    sourceResult.error ||
    !sourceResult.data
  ) {
    notFound();
  }

  const gapIds = (sourceGapLinksResult.data ?? []).map((row) => row.gap_id);
  const requirementIds = (sourceRequirementLinksResult.data ?? []).map(
    (row) => row.requirement_id,
  );
  const annotationIds = (annotationsResult.data ?? []).map((row) => row.id);

  const [gapsResult, requirementsResult, annotationGapLinksResult, annotationRequirementLinksResult] =
    await Promise.all([
      gapIds.length
        ? context.supabase
            .from("investigation_information_gaps")
            .select("id,description,status")
            .eq("project_id", context.projectId)
            .in("id", gapIds)
        : Promise.resolve({ data: [], error: null }),
      requirementIds.length
        ? context.supabase
            .from("collection_requirements")
            .select("id,requirement,status,priority")
            .eq("project_id", context.projectId)
            .in("id", requirementIds)
        : Promise.resolve({ data: [], error: null }),
      annotationIds.length
        ? context.supabase
            .from("source_annotation_gap_links")
            .select("annotation_id,gap_id")
            .eq("project_id", context.projectId)
            .in("annotation_id", annotationIds)
        : Promise.resolve({ data: [], error: null }),
      annotationIds.length
        ? context.supabase
            .from("source_annotation_requirement_links")
            .select("annotation_id,requirement_id")
            .eq("project_id", context.projectId)
            .in("annotation_id", annotationIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  const asset = assetResult.data ?? null;
  let signedUrl: string | null = null;
  if (asset?.storage_path) {
    const { data } = await context.supabase.storage
      .from("source-assets")
      .createSignedUrl(String(asset.storage_path), 15 * 60);
    signedUrl = data?.signedUrl ?? null;
  }

  return (
    <SourcePrintPacket
      projectId={context.projectId}
      project={projectResult.data}
      source={sourceResult.data}
      asset={asset}
      signedUrl={signedUrl}
      gaps={gapsResult.data ?? []}
      requirements={requirementsResult.data ?? []}
      notes={notesResult.data ?? []}
      annotations={annotationsResult.data ?? []}
      annotationGapLinks={annotationGapLinksResult.data ?? []}
      annotationRequirementLinks={annotationRequirementLinksResult.data ?? []}
    />
  );
}
