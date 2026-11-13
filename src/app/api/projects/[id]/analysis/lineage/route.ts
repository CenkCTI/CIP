import { NextResponse } from "next/server";
import { requireOwnedProject } from "@/lib/projects/ownership";
import { validateOrigin, requireJson } from "@/lib/ai/byok/security";
import {
  lineageIdSchema, saveAssertionLineageSchema, lineageReceiptSchema,
  type AssertionLineageCandidate, type AssertionLineageResponse,
  type AssertionLineageReview,
} from "@/lib/analysis/lineage/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status, headers });
type Params = { params: Promise<{ id: string }> };
const reviewColumns = "id,from_assertion_id,to_assertion_id,from_source_id,to_source_id,relation,rationale,revision,reviewed_at,reviewed_by,supersedes_id,identity_snapshot";

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const query = new URL(req.url).searchParams;
  if ([...query.keys()].some((key) => key !== "assertionId" && key !== "otherAssertionId")) return fail(400, "Unknown query parameter.");
  const assertionId = query.get("assertionId");
  const otherId = query.get("otherAssertionId");
  if (!lineageIdSchema.safeParse(assertionId).success ||
      (otherId !== null && (!lineageIdSchema.safeParse(otherId).success || otherId === assertionId)))
    return fail(400, "Invalid assertion ID.");
  const ctx = await requireOwnedProject(id).catch(() => null);
  if (!ctx) return fail(404, "Not found.");
  const [subject, linksResult] = await Promise.all([
    ctx.supabase.from("source_claim_assertions")
      .select("id,source_claim_id").eq("project_id", ctx.projectId).eq("id", assertionId!).maybeSingle(),
    ctx.supabase.from("assertion_lineage_current_v1").select(reviewColumns)
      .eq("project_id", ctx.projectId)
      .or(`from_assertion_id.eq.${assertionId},to_assertion_id.eq.${assertionId}`)
      .order("reviewed_at", { ascending: false }).limit(101),
  ]);
  if (subject.error || linksResult.error) return fail(503, "Reporting lineage is unavailable.");
  const all = (linksResult.data ?? []) as AssertionLineageReview[];
  const links = all.slice(0, 100);
  let candidates: AssertionLineageCandidate[] = [];
  let claimUpdatedAt: string | null = null;
  let truncated = all.length > 100;
  if (subject.data) {
    const [claim, positions] = await Promise.all([
      ctx.supabase.from("source_claims").select("id,updated_at")
        .eq("project_id", ctx.projectId).eq("id", subject.data.source_claim_id).maybeSingle(),
      ctx.supabase.from("source_claim_assertions")
        .select("id,source_annotation_id,stance,updated_at")
        .eq("project_id", ctx.projectId).eq("source_claim_id", subject.data.source_claim_id)
        .order("id").limit(101),
    ]);
    if (claim.error || positions.error) return fail(503, "Lineage provenance unavailable.");
    claimUpdatedAt = claim.data?.updated_at ?? null;
    const entries = (positions.data ?? []).slice(0, 100);
    truncated = truncated || (positions.data?.length ?? 0) > 100;
    const annIds = [...new Set(entries.map((a) => a.source_annotation_id))];
    if (annIds.length) {
      const ann = await ctx.supabase.from("source_annotations")
        .select("id,source_id,updated_at").eq("project_id", ctx.projectId).in("id", annIds);
      if (ann.error) return fail(503, "Lineage annotations unavailable.");
      const annMap = new Map((ann.data ?? []).map((a) => [a.id, a]));
      const sourceIds = [...new Set((ann.data ?? []).map((a) => a.source_id))];
      if (sourceIds.length) {
        const sources = await ctx.supabase.from("sources")
          .select("id,title,updated_at,archived_at")
          .eq("project_id", ctx.projectId).in("id", sourceIds);
        if (sources.error) return fail(503, "Lineage sources unavailable.");
        const sourceMap = new Map((sources.data ?? []).map((s) => [s.id, s]));
        candidates = entries.flatMap((a) => {
          const annotation = annMap.get(a.source_annotation_id);
          const source = annotation && sourceMap.get(annotation.source_id);
          if (!annotation || !source) return [];
          return [{
            id: a.id, stance: a.stance, sourceId: source.id, sourceTitle: source.title,
            assertionUpdatedAt: a.updated_at,
            annotationUpdatedAt: annotation.updated_at,
            sourceUpdatedAt: source.updated_at,
            archived: Boolean(source.archived_at),
          }];
        });
      }
    }
  }
  let history: AssertionLineageReview[] = [];
  if (otherId) {
    const low = [assertionId!, otherId].sort()[0];
    const high = [assertionId!, otherId].sort()[1];
    const result = await ctx.supabase.from("assertion_lineage_links")
      .select(reviewColumns).eq("project_id", ctx.projectId)
      .eq("pair_low", low).eq("pair_high", high)
      .order("revision", { ascending: false }).limit(20);
    if (result.error) return fail(503, "Lineage history unavailable.");
    history = (result.data ?? []) as AssertionLineageReview[];
  }
  const response: AssertionLineageResponse & { history: AssertionLineageReview[] } = {
    assertionId: assertionId!, claimUpdatedAt, candidates, links,
    unavailable: !subject.data, truncated, history,
  };
  return NextResponse.json(response, { headers });
}

export async function POST(req: Request, { params }: Params) {
  try { validateOrigin(req); requireJson(req); }
  catch { return fail(403, "Request origin or content type not allowed."); }
  const { id } = await params;
  const ctx = await requireOwnedProject(id).catch(() => null);
  if (!ctx) return fail(404, "Not found.");
  const raw = await req.text().catch(() => "");
  if (new TextEncoder().encode(raw).length > 12_000) return fail(413, "Request too large.");
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { return fail(400, "Invalid JSON."); }
  const parsed = saveAssertionLineageSchema.safeParse(value);
  if (!parsed.success) return fail(400, "Invalid lineage assessment.");
  const { data, error } = await ctx.supabase.rpc("save_assertion_lineage_review_v1", {
    p_project_id: ctx.projectId,
    p_from_assertion_id: parsed.data.fromAssertionId,
    p_to_assertion_id: parsed.data.toAssertionId,
    p_relation: parsed.data.relation,
    p_rationale: parsed.data.rationale,
    p_expected_current_review_id: parsed.data.expectedCurrentReviewId,
    p_request_id: parsed.data.requestId,
    p_expected_context: parsed.data.expectedContext,
  }).single();
  if (error) {
    if (error.code === "40001" || error.code === "23505") return fail(409, "Review or evidence context changed.");
    if (error.code === "42501") return fail(404, "Not found.");
    if (error.code === "22023" || error.code === "23514") return fail(400, "Invalid relation or evidence.");
    return fail(503, "Could not save reporting lineage.");
  }
  const receipt = lineageReceiptSchema.safeParse(data);
  if (!receipt.success) return fail(503, "Invalid lineage receipt.");
  return NextResponse.json({ reviewId: receipt.data.review_id, replayed: receipt.data.replayed,
    reviewedAt: receipt.data.reviewed_at }, { status: receipt.data.replayed ? 200 : 201, headers });
}
