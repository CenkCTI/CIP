import "server-only";

import type { requireOwnedProject } from "@/lib/projects/ownership";

export async function loadCollectionMetrics({ supabase, projectId }: Awaited<ReturnType<typeof requireOwnedProject>>) {
  const count = (table: string) => supabase.from(table).select("*", { count: "exact", head: true }).eq("project_id", projectId);
  const requests = {
    questions: count("investigation_questions").in("status", ["OPEN", "PARTIALLY_ANSWERED"]),
    gaps: count("investigation_information_gaps").in("status", ["OPEN", "PARTIALLY_RESOLVED"]),
    requirements: count("collection_requirements"),
    open: count("collection_requirements").eq("status", "OPEN"),
    collecting: count("collection_requirements").eq("status", "COLLECTING"),
    satisfied: count("collection_requirements").eq("status", "SATISFIED"),
    sources: count("sources").is("archived_at", null),
    archived: count("sources").not("archived_at", "is", null),
    sourcePending: count("collection_source_quality_v1").is("archived_at", null).is("rating", null),
    sourceStale: count("collection_source_quality_v1").is("archived_at", null).eq("reliability_stale", true),
    annotations: count("source_annotations"),
    annotationPending: count("annotation_credibility_current_v1").eq("subject_status", "ACTIVE").is("review_id", null),
    annotationCurrent: count("annotation_credibility_current_v1").eq("subject_status", "ACTIVE").not("review_id", "is", null).eq("stale", false),
    annotationStale: count("annotation_credibility_current_v1").eq("subject_status", "ACTIVE").eq("stale", true),
    assertionPending: count("collection_assertion_quality_v1").is("review_id", null),
    assertionStale: count("collection_assertion_quality_v1").eq("stale", true),
    claims: count("source_claims"),
    indicators: count("indicators"),
    evidence: count("evidence"),
    lineage: count("assertion_lineage_current_v1"),
  };
  const keys = Object.keys(requests) as (keyof typeof requests)[];
  const results = await Promise.allSettled(keys.map((key) => requests[key]));
  return Object.fromEntries(keys.map((key, index) => {
    const result = results[index];
    return [key, result.status === "fulfilled" && !result.value.error ? result.value.count : null];
  })) as Record<keyof typeof requests, number | null>;
}

export type CollectionMetrics = Awaited<ReturnType<typeof loadCollectionMetrics>>;
