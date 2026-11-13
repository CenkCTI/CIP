import { NextResponse } from "next/server";
import { requireOwnedProject } from "@/lib/projects/ownership";
import {
  QUALITY_HISTORY_PAGE_SIZE,
  qualityHistoryPageSchema,
  qualitySourceIdSchema,
  type SourceQualityResponse,
  type SourceReliabilityReview,
} from "@/lib/analysis/quality/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status, headers });

type Params = { params: Promise<{ id: string; sourceId: string }> };

export async function GET(req: Request, { params }: Params) {
  const { id, sourceId } = await params;
  if (!qualitySourceIdSchema.safeParse(sourceId).success) return fail(400, "Invalid Source ID.");
  const ctx = await requireOwnedProject(id).catch(() => null);
  if (!ctx) return fail(404, "Not found.");

  const pageInput = new URL(req.url).searchParams.get("page") ?? "1";
  const parsedPage = qualityHistoryPageSchema.safeParse(pageInput);
  if (!parsedPage.success) return fail(400, "Invalid history page.");
  const page = parsedPage.data;
  const offset = (page - 1) * QUALITY_HISTORY_PAGE_SIZE;

  const [sourceResult, currentResult, historyResult] = await Promise.all([
    ctx.supabase.from("sources").select("id,title,updated_at,archived_at")
      .eq("project_id", ctx.projectId).eq("id", sourceId).maybeSingle(),
    ctx.supabase.from("source_reliability_reviews")
      .select("id,revision,rating,rationale,method_version,assessed_by,assessed_at,supersedes_id,source_updated_at,source_context_fingerprint,source_identity_snapshot")
      .eq("project_id", ctx.projectId).eq("source_id", sourceId)
      .order("revision", { ascending: false }).limit(1).maybeSingle(),
    ctx.supabase.from("source_reliability_reviews")
      .select("id,revision,rating,rationale,method_version,assessed_by,assessed_at,supersedes_id,source_updated_at,source_context_fingerprint,source_identity_snapshot")
      .eq("project_id", ctx.projectId).eq("source_id", sourceId)
      .order("revision", { ascending: false })
      .range(offset, offset + QUALITY_HISTORY_PAGE_SIZE),
  ]);
  if (sourceResult.error || currentResult.error || historyResult.error) {
    return fail(503, "Source quality is temporarily unavailable.");
  }

  const current = (currentResult.data ?? null) as SourceReliabilityReview | null;
  const source = sourceResult.data;
  if (!source && !current) return fail(404, "Not found.");
  const history = (historyResult.data ?? []) as SourceReliabilityReview[];
  const sourceUpdatedAt = source?.updated_at ?? null;
  const currentIsStale = Boolean(current && sourceUpdatedAt &&
    new Date(current.source_updated_at).getTime() !== new Date(sourceUpdatedAt).getTime());
  const output: SourceQualityResponse = {
    sourceId,
    sourceStatus: source ? (source.archived_at ? "ARCHIVED" : "ACTIVE") : "UNAVAILABLE",
    sourceTitle: source?.title ?? current?.source_identity_snapshot?.title ?? "Unavailable Source",
    sourceUpdatedAt,
    current,
    currentIsStale,
    history: history.slice(0, QUALITY_HISTORY_PAGE_SIZE),
    page,
    hasMore: history.length > QUALITY_HISTORY_PAGE_SIZE,
  };
  return NextResponse.json(output, { headers });
}
