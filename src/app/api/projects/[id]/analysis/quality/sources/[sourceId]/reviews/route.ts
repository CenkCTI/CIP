import { NextResponse } from "next/server";
import { validateOrigin, requireJson } from "@/lib/ai/byok/security";
import { sourceReliabilityReviewRequestSchema, qualitySourceIdSchema } from "@/lib/analysis/quality/schema";
import { requireOwnedProject } from "@/lib/projects/ownership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status, headers });

type Params = { params: Promise<{ id: string; sourceId: string }> };

export async function POST(req: Request, { params }: Params) {
  try { validateOrigin(req); requireJson(req); }
  catch { return fail(403, "Request origin or content type not allowed."); }
  const { id, sourceId } = await params;
  if (!qualitySourceIdSchema.safeParse(sourceId).success) return fail(400, "Invalid Source ID.");
  const ctx = await requireOwnedProject(id).catch(() => null);
  if (!ctx) return fail(404, "Not found.");
  const raw = await req.text().catch(() => "");
  if (new TextEncoder().encode(raw).length > 12_000) return fail(413, "Review request too large.");
  let parsedJson: unknown;
  try { parsedJson = JSON.parse(raw); }
  catch { return fail(400, "Invalid review request."); }
  const parsed = sourceReliabilityReviewRequestSchema.safeParse(parsedJson);
  if (!parsed.success) return fail(400, "Invalid review request.");

  const { data, error } = await ctx.supabase.rpc("save_source_reliability_review_v1", {
    p_project_id: ctx.projectId,
    p_source_id: sourceId,
    p_rating: parsed.data.rating,
    p_rationale: parsed.data.rationale,
    p_method_version: parsed.data.methodVersion,
    p_expected_current_review_id: parsed.data.expectedCurrentReviewId,
    p_request_id: parsed.data.requestId,
  }).single();
  if (error) {
    if (error.code === "40001" || error.code === "23505") {
      return fail(409, "EDIT_CONFLICT: review changed or request ID was reused.");
    }
    if (error.code === "42501") return fail(404, "Not found.");
    if (error.message.includes("SOURCE_ARCHIVED")) return fail(409, "Source is archived.");
    if (error.code === "22023" || error.code === "23514") return fail(400, "Invalid review request.");
    return fail(503, "Source quality review could not be saved.");
  }
  if (!data) return fail(503, "Source quality review could not be saved.");
  return NextResponse.json({
    reviewId: data.review_id,
    currentRating: parsed.data.rating,
    assessedAt: data.reviewed_at,
    replayed: data.replayed,
  }, { status: data.replayed ? 200 : 201, headers });
}
