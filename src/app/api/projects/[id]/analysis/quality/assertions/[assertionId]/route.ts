import { NextResponse } from "next/server";
import { requireOwnedProject } from "@/lib/projects/ownership";
import {
  credibilityAssertionIdSchema, credibilityHistoryPageSchema,
  CREDIBILITY_HISTORY_PAGE_SIZE, type AssertionCredibilityResponse,
  type AssertionCredibilityReview,
} from "@/lib/analysis/credibility/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status, headers });
type Params = { params: Promise<{ id: string; assertionId: string }> };
const selectReviews = "id,revision,credibility,rationale,independence_status,independence_rationale,verification_assertion_id,verification_source_id,method_version,assessed_by,assessed_at,supersedes_id,assertion_updated_at,claim_updated_at,annotation_updated_at,source_updated_at,assertion_context_fingerprint,assertion_identity_snapshot";

function changed(a: string, b: string) {
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  return !Number.isFinite(left) || !Number.isFinite(right) || left !== right;
}

export async function GET(req: Request, { params }: Params) {
  const { id, assertionId } = await params;
  if (!credibilityAssertionIdSchema.safeParse(assertionId).success) return fail(400, "Invalid assertion ID.");
  const ctx = await requireOwnedProject(id).catch(() => null);
  if (!ctx) return fail(404, "Not found.");
  const parsedPage = credibilityHistoryPageSchema.safeParse(new URL(req.url).searchParams.get("page") ?? "1");
  if (!parsedPage.success) return fail(400, "Invalid history page.");
  const page = parsedPage.data;
  const offset = (page - 1) * CREDIBILITY_HISTORY_PAGE_SIZE;
  const [assertionResult, currentResult, historyResult] = await Promise.all([
    ctx.supabase.from("source_claim_assertions")
      .select("id,source_claim_id,source_annotation_id,stance,updated_at")
      .eq("project_id", ctx.projectId).eq("id", assertionId).maybeSingle(),
    ctx.supabase.from("assertion_credibility_reviews").select(selectReviews)
      .eq("project_id", ctx.projectId).eq("source_claim_assertion_id", assertionId)
      .order("revision", { ascending: false }).limit(1).maybeSingle(),
    ctx.supabase.from("assertion_credibility_reviews").select(selectReviews)
      .eq("project_id", ctx.projectId).eq("source_claim_assertion_id", assertionId)
      .order("revision", { ascending: false })
      .range(offset, offset + CREDIBILITY_HISTORY_PAGE_SIZE),
  ]);
  if (assertionResult.error || currentResult.error || historyResult.error) {
    return fail(503, "Information credibility is temporarily unavailable.");
  }
  const current = (currentResult.data ?? null) as AssertionCredibilityReview | null;
  const history = (historyResult.data ?? []) as AssertionCredibilityReview[];
  const assertion = assertionResult.data;
  if (!assertion && !current) return fail(404, "Not found.");

  let sourceId: string | null = null;
  let sourceTitle = current?.assertion_identity_snapshot?.sourceTitle ?? "Unavailable Source";
  let status: AssertionCredibilityResponse["assertionStatus"] = "UNAVAILABLE";
  let sourceReliability: string | null = null;
  let sourceReliabilityStale = false;
  let currentIsStale = false;
  if (assertion) {
    const [claimResult, annotationResult] = await Promise.all([
      ctx.supabase.from("source_claims").select("id,updated_at")
        .eq("project_id", ctx.projectId).eq("id", assertion.source_claim_id).maybeSingle(),
      ctx.supabase.from("source_annotations").select("id,source_id,updated_at")
        .eq("project_id", ctx.projectId).eq("id", assertion.source_annotation_id).maybeSingle(),
    ]);
    if (claimResult.error || annotationResult.error) return fail(503, "Provenance unavailable.");
    const annotation = annotationResult.data;
    const claim = claimResult.data;
    if (annotation && claim) {
      sourceId = annotation.source_id;
      const [sourceResult, reliabilityResult] = await Promise.all([
        ctx.supabase.from("sources").select("id,title,updated_at,archived_at")
          .eq("project_id", ctx.projectId).eq("id", sourceId).maybeSingle(),
        ctx.supabase.from("source_reliability_reviews").select("rating,source_updated_at")
          .eq("project_id", ctx.projectId).eq("source_id", sourceId)
          .order("revision", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (sourceResult.error || reliabilityResult.error) return fail(503, "Source provenance unavailable.");
      if (sourceResult.data) {
        const source = sourceResult.data;
        sourceTitle = source.title;
        status = source.archived_at ? "ARCHIVED" : "ACTIVE";
        sourceReliability = reliabilityResult.data?.rating ?? null;
        sourceReliabilityStale = Boolean(reliabilityResult.data &&
          changed(reliabilityResult.data.source_updated_at, source.updated_at));
        currentIsStale = Boolean(current && (
          changed(current.assertion_updated_at, assertion.updated_at) ||
          changed(current.claim_updated_at, claim.updated_at) ||
          changed(current.annotation_updated_at, annotation.updated_at) ||
          changed(current.source_updated_at, source.updated_at)));
      }
    }
  }
  const payload: AssertionCredibilityResponse = {
    assertionId, assertionStatus: status,
    assertionStance: assertion?.stance ?? current?.assertion_identity_snapshot?.stance ?? null,
    sourceTitle, sourceId, sourceReliability, sourceReliabilityStale,
    current, currentIsStale, history: history.slice(0, CREDIBILITY_HISTORY_PAGE_SIZE),
    page, hasMore: history.length > CREDIBILITY_HISTORY_PAGE_SIZE,
  };
  return NextResponse.json(payload, { headers });
}
