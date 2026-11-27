import { z } from "zod";
import { requireOwnedProject } from "@/lib/projects/ownership";
import { annotationQualityColumns, annotationReviewColumns } from "@/lib/analysis/annotation-credibility/queries";
import type { AnnotationReviewDetail } from "@/lib/analysis/annotation-credibility/schema";
import { credibilityHistoryPageSchema, CREDIBILITY_HISTORY_PAGE_SIZE } from "@/lib/analysis/credibility/schema";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(req: Request, { params }: { params: Promise<{ id: string; annotationId: string }> }) {
  const { id, annotationId } = await params;
  const page = credibilityHistoryPageSchema.safeParse(new URL(req.url).searchParams.get("page") ?? "1");
  if (!z.uuid().safeParse(annotationId).success || !page.success) {
    return Response.json({ error: "Invalid annotation or history page." }, { status: 400, headers });
  }
  const context = await requireOwnedProject(id).catch(() => null);
  if (!context) return Response.json({ error: "Not found." }, { status: 404, headers });
  const { supabase, projectId } = context;
  const offset = (page.data - 1) * CREDIBILITY_HISTORY_PAGE_SIZE;
  const subject = await supabase.from("annotation_credibility_current_v1")
    .select(`${annotationQualityColumns},provenance,source_title,revision`).eq("project_id", projectId)
    .eq("annotation_id", annotationId).maybeSingle();
  const reviews = () => supabase.from("annotation_credibility_reviews").select(annotationReviewColumns)
    .eq("project_id", projectId).eq("annotation_id", annotationId).order("revision", { ascending: false });
  // For a live subject, pin history to the revision represented by its current view.
  const pinned = () => subject.data?.review_id ? reviews().lte("revision", subject.data.revision) : reviews();
  if (subject.error) return Response.json({ error: "Annotation credibility unavailable." }, { status: 503, headers });
  const rawSubject = subject.data;
  const empty = { data: [], error: null };
  const [historyResult, currentResult] = rawSubject && !rawSubject.review_id
    ? [empty, empty]
    : await Promise.all([pinned().range(offset, offset + CREDIBILITY_HISTORY_PAGE_SIZE), pinned().limit(1)]);
  if (historyResult.error || currentResult.error) {
    return Response.json({ error: "Annotation credibility unavailable." }, { status: 503, headers });
  }
  const current = currentResult.data?.[0] ?? null;
  if (!rawSubject && !current) return Response.json({ error: "Not found." }, { status: 404, headers });
  const history = historyResult.data ?? [];
  const payload = { subject: rawSubject, current, history: history.slice(0, CREDIBILITY_HISTORY_PAGE_SIZE),
    page: page.data, hasMore: history.length > CREDIBILITY_HISTORY_PAGE_SIZE } as AnnotationReviewDetail;
  return Response.json(payload, { headers });
}
