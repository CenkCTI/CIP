import { NextResponse } from "next/server";
import { validateOrigin, requireJson } from "@/lib/ai/byok/security";
import {
  assertionCredibilityReviewRequestSchema, assertionCredibilityRpcResultSchema,
  credibilityAssertionIdSchema,
} from "@/lib/analysis/credibility/schema";
import { requireOwnedProject } from "@/lib/projects/ownership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status, headers });
type Params = { params: Promise<{ id: string; assertionId: string }> };

export async function POST(req: Request, { params }: Params) {
  try { validateOrigin(req); requireJson(req); }
  catch { return fail(403, "Request origin or content type not allowed."); }
  const { id, assertionId } = await params;
  if (!credibilityAssertionIdSchema.safeParse(assertionId).success) return fail(400, "Invalid assertion ID.");
  const ctx = await requireOwnedProject(id).catch(() => null);
  if (!ctx) return fail(404, "Not found.");
  const raw = await req.text().catch(() => "");
  if (new TextEncoder().encode(raw).length > 12_000) return fail(413, "Review request too large.");
  let parsedJson: unknown;
  try { parsedJson = JSON.parse(raw); }
  catch { return fail(400, "Invalid review request."); }
  const parsed = assertionCredibilityReviewRequestSchema.safeParse(parsedJson);
  if (!parsed.success) return fail(400, "Invalid review request.");

  const { data, error } = await ctx.supabase.rpc("save_assertion_credibility_review_v1", {
    p_project_id: ctx.projectId,
    p_assertion_id: assertionId,
    p_credibility: parsed.data.credibility,
    p_rationale: parsed.data.rationale,
    p_independence_status: parsed.data.independenceStatus,
    p_independence_rationale: parsed.data.independenceRationale,
    p_verification_assertion_id: parsed.data.verificationAssertionId,
    p_method_version: parsed.data.methodVersion,
    p_expected_current_review_id: parsed.data.expectedCurrentReviewId,
    p_request_id: parsed.data.requestId,
    p_expected_context: parsed.data.expectedProvenance,
  }).single();
  if (error) {
    if (error.code === "40001" || error.code === "23505") return fail(409, "EDIT_CONFLICT: review changed or request ID was reused.");
    if (error.code === "42501") return fail(404, "Not found.");
    if (error.message?.includes("SOURCE_ARCHIVED")) return fail(409, "Source is archived.");
    if (error.code === "22023" || error.code === "23514") return fail(400, "Invalid review or corroboration evidence.");
    return fail(503, "Information credibility review could not be saved.");
  }
  const receipt = assertionCredibilityRpcResultSchema.safeParse(data);
  if (!receipt.success) return fail(503, "Invalid review receipt.");
  return NextResponse.json({
    reviewId: receipt.data.review_id,
    credibility: parsed.data.credibility,
    assessedAt: receipt.data.reviewed_at,
    replayed: receipt.data.replayed,
  }, { status: receipt.data.replayed ? 200 : 201, headers });
}
