import "server-only";

import type { requireOwnedProject } from "@/lib/projects/ownership";
import type { AnnotationQuality } from "./schema";

export const annotationQualityColumns = "annotation_id,source_id,subject_status,review_id,credibility,stale,reviewed_at,source_reliability,source_reliability_stale";
export const annotationReviewColumns = "id,credibility,rationale,revision,reviewed_at,method_version,reviewed_by,supersedes_id";

export async function loadAnnotationQuality(
  { supabase, projectId }: Awaited<ReturnType<typeof requireOwnedProject>>,
  annotationIds: string[],
): Promise<Record<string, AnnotationQuality> | null> {
  const ids = [...new Set(annotationIds)];
  const batches = Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) =>
    ids.slice(index * 100, index * 100 + 100));
  const results = await Promise.allSettled(batches.map(async (batch) =>
    supabase.from("annotation_credibility_current_v1").select(annotationQualityColumns)
      .eq("project_id", projectId).in("annotation_id", batch)));
  const rows: AnnotationQuality[] = [];
  for (const result of results) {
    if (result.status === "rejected" || result.value.error) return null;
    rows.push(...((result.value.data ?? []) as unknown as AnnotationQuality[]));
  }
  return Object.fromEntries(rows.map((row) => [row.annotation_id, row]));
}
