import { notFound } from "next/navigation";
import { z } from "zod";

import { SourceClaimDetail } from "@/components/processing/source-claims-workspace";
import { requireOwnedProject } from "@/lib/projects/ownership";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "");
const uuid = z.string().uuid();

export default async function SourceClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string; claimId: string }>;
}) {
  const { id, claimId } = await params;
  if (!uuid.safeParse(claimId).success) notFound();
  const context = await requireOwnedProject(id).catch(() => notFound());

  const [claimResult, assertionsResult] = await Promise.all([
    context.supabase
      .from("source_claims")
      .select("id,claim_summary,claim_kind,created_at,updated_at")
      .eq("project_id", context.projectId)
      .eq("id", claimId)
      .maybeSingle(),
    context.supabase
      .from("source_claim_assertions")
      .select(
        "id,source_claim_id,source_annotation_id,stance,source_qualifier,mapping_origin,assertion_action,created_at,updated_at",
      )
      .eq("project_id", context.projectId)
      .eq("source_claim_id", claimId)
      .order("created_at", { ascending: true }),
  ]);

  if (claimResult.error || !claimResult.data) notFound();
  if (assertionsResult.error) {
    return (
      <section className="mx-auto max-w-6xl">
        <div className="card text-red-300">
          Source Claim provenance could not be loaded.
        </div>
      </section>
    );
  }

  const assertionRows = (assertionsResult.data ?? []) as Row[];
  const annotationIds = [
    ...new Set(assertionRows.map((row) => text(row.source_annotation_id))),
  ].filter(Boolean);

  const annotationsResult = annotationIds.length
    ? await context.supabase
        .from("source_annotations")
        .select("id,source_id,asset_id,page_number,selected_text,comment")
        .eq("project_id", context.projectId)
        .in("id", annotationIds)
    : { data: [] as Row[], error: null };

  if (annotationsResult.error) {
    return (
      <section className="mx-auto max-w-6xl">
        <div className="card text-red-300">
          Source Annotation provenance could not be loaded.
        </div>
      </section>
    );
  }

  const annotations = (annotationsResult.data ?? []) as Row[];
  const sourceIds = [
    ...new Set(annotations.map((row) => text(row.source_id))),
  ].filter(Boolean);
  const assetIds = [
    ...new Set(annotations.map((row) => text(row.asset_id))),
  ].filter(Boolean);

  const [sourcesResult, assetsResult] = await Promise.all([
    sourceIds.length
      ? context.supabase
          .from("sources")
          .select("id,title,publisher,published_at")
          .eq("project_id", context.projectId)
          .in("id", sourceIds)
      : Promise.resolve({ data: [] as Row[], error: null }),
    assetIds.length
      ? context.supabase
          .from("source_assets")
          .select("id,original_filename,sha256")
          .eq("project_id", context.projectId)
          .in("id", assetIds)
      : Promise.resolve({ data: [] as Row[], error: null }),
  ]);

  if (sourcesResult.error || assetsResult.error) {
    return (
      <section className="mx-auto max-w-6xl">
        <div className="card text-red-300">
          Source Claim provenance could not be reconstructed.
        </div>
      </section>
    );
  }

  const annotationById = new Map(
    annotations.map((row) => [text(row.id), row]),
  );
  const sourceById = new Map(
    ((sourcesResult.data ?? []) as Row[]).map((row) => [text(row.id), row]),
  );
  const assetById = new Map(
    ((assetsResult.data ?? []) as Row[]).map((row) => [text(row.id), row]),
  );

  const hydrated = assertionRows.flatMap((assertion) => {
    const annotation = annotationById.get(text(assertion.source_annotation_id));
    if (!annotation) return [];
    return [
      {
        ...assertion,
        annotation,
        source: sourceById.get(text(annotation.source_id)) ?? null,
        asset: assetById.get(text(annotation.asset_id)) ?? null,
      },
    ];
  });

  return (
    <SourceClaimDetail
      projectId={context.projectId}
      claim={claimResult.data as Row}
      assertions={hydrated}
    />
  );
}
