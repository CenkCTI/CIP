import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnedProject } from "@/lib/projects/ownership";
import { validateOrigin, requireJson } from "@/lib/ai/byok/security";
import { saveHypothesisEvidenceSchema, evidenceReceiptSchema,
  type EvidenceCandidate } from "@/lib/analysis/hypotheses/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers });
const uuid = z.string().uuid();
type Params = { params: Promise<{ id: string; hypothesisId: string }> };
const versionFields = "id,hypothesis_id,revision,title,proposition,disconfirmation_test,status,rationale,authored_at,supersedes_id";
const evidenceFields = "id,hypothesis_id,assertion_id,revision,role,rationale,reviewed_at,supersedes_id,source_id_snapshot,claim_id_snapshot,source_label_snapshot,claim_summary_snapshot,stance_snapshot,assertion_updated_at,claim_updated_at,annotation_updated_at,source_updated_at";

export async function GET(req: Request, { params }: Params) {
  const { id, hypothesisId } = await params;
  if (!uuid.safeParse(hypothesisId).success || new URL(req.url).searchParams.size) return fail(400, "Invalid request.");
  const ctx = await requireOwnedProject(id).catch(() => null);
  if (!ctx) return fail(404, "Not found.");
  const [current, history, evidence, revisions, assertions] = await Promise.all([
    ctx.supabase.from("analytic_hypothesis_current_v1").select(versionFields)
      .eq("project_id", ctx.projectId).eq("hypothesis_id", hypothesisId).maybeSingle(),
    ctx.supabase.from("analytic_hypothesis_versions").select(versionFields)
      .eq("project_id", ctx.projectId).eq("hypothesis_id", hypothesisId)
      .order("revision", { ascending: false }).limit(20),
    ctx.supabase.from("analytic_hypothesis_evidence_current_v1").select(evidenceFields)
      .eq("project_id", ctx.projectId).eq("hypothesis_id", hypothesisId)
      .order("reviewed_at", { ascending: false }).limit(101),
    ctx.supabase.from("analytic_hypothesis_evidence_reviews").select(evidenceFields)
      .eq("project_id", ctx.projectId).eq("hypothesis_id", hypothesisId)
      .order("reviewed_at", { ascending: false }).limit(100),
    ctx.supabase.from("source_claim_assertions").select("id,source_claim_id,source_annotation_id,stance,updated_at")
      .eq("project_id", ctx.projectId).order("created_at", { ascending: false }).limit(101),
  ]);
  if ([current, history, evidence, revisions, assertions].some((result) => result.error)) return fail(503, "Hypothesis data unavailable.");
  if (!current.data) return fail(404, "Hypothesis not found.");
  const positions = (assertions.data ?? []).slice(0, 100);
  const claimIds = [...new Set(positions.map((item) => item.source_claim_id))];
  const annIds = [...new Set(positions.map((item) => item.source_annotation_id))];
  const [claims, annotations] = await Promise.all([
    claimIds.length ? ctx.supabase.from("source_claims").select("id,claim_summary,updated_at")
      .eq("project_id", ctx.projectId).in("id", claimIds) : Promise.resolve({ data: [], error: null }),
    annIds.length ? ctx.supabase.from("source_annotations").select("id,source_id,updated_at")
      .eq("project_id", ctx.projectId).in("id", annIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (claims.error || annotations.error) return fail(503, "Assertion provenance unavailable.");
  const claimMap = new Map((claims.data ?? []).map((item) => [item.id, item]));
  const annMap = new Map((annotations.data ?? []).map((item) => [item.id, item]));
  const sourceIds = [...new Set((annotations.data ?? []).map((item) => item.source_id))];
  const sources = sourceIds.length ? await ctx.supabase.from("sources")
    .select("id,title,updated_at,archived_at").eq("project_id", ctx.projectId).in("id", sourceIds)
    : { data: [], error: null };
  if (sources.error) return fail(503, "Source provenance unavailable.");
  const sourceMap = new Map((sources.data ?? []).map((item) => [item.id, item]));
  const candidates: EvidenceCandidate[] = positions.flatMap((position) => {
    const claim = claimMap.get(position.source_claim_id);
    const annotation = annMap.get(position.source_annotation_id);
    const source = annotation && sourceMap.get(annotation.source_id);
    if (!claim || !annotation || !source || source.archived_at) return [];
    return [{ assertionId: position.id, claimId: claim.id, claimSummary: claim.claim_summary,
      sourceTitle: source.title, stance: position.stance,
      provenance: { assertionUpdatedAt: position.updated_at, claimUpdatedAt: claim.updated_at,
        annotationUpdatedAt: annotation.updated_at, sourceUpdatedAt: source.updated_at } }];
  });
  return NextResponse.json({
    hypothesis: current.data,
    history: history.data ?? [], evidence: (evidence.data ?? []).slice(0, 100),
    evidenceHistory: revisions.data ?? [], candidates,
    candidatesTruncated: (assertions.data?.length ?? 0) > 100,
    evidenceTruncated: (evidence.data?.length ?? 0) > 100,
  }, { headers });
}

export async function POST(req: Request, { params }: Params) {
  try { validateOrigin(req); requireJson(req); }
  catch { return fail(403, "Request origin or content type is not permitted."); }
  const { id, hypothesisId } = await params;
  if (!uuid.safeParse(hypothesisId).success) return fail(400, "Invalid hypothesis ID.");
  const ctx = await requireOwnedProject(id).catch(() => null);
  if (!ctx) return fail(404, "Not found.");
  const text = await req.text().catch(() => "");
  if (new TextEncoder().encode(text).length > 12_000) return fail(413, "Request too large.");
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { return fail(400, "Invalid JSON."); }
  const parsed = saveHypothesisEvidenceSchema.safeParse(payload);
  if (!parsed.success) return fail(400, "Invalid evidence review.");
  const v = parsed.data;
  const result = await ctx.supabase.rpc("save_analytic_hypothesis_evidence_v1", {
    p_project_id: ctx.projectId, p_hypothesis_id: hypothesisId, p_assertion_id: v.assertionId,
    p_role: v.role, p_rationale: v.rationale, p_expected_current_review_id: v.expectedCurrentReviewId,
    p_expected_context: v.expectedContext, p_request_id: v.requestId,
  }).single();
  if (result.error) {
    if (["40001", "23505"].includes(result.error.code)) return fail(409, "Evidence changed. Reload before retrying.");
    if (result.error.code === "42501") return fail(404, "Not found.");
    if (["22023", "23514"].includes(result.error.code)) return fail(400, "Invalid evidence review.");
    return fail(503, "Could not save evidence review.");
  }
  const receipt = evidenceReceiptSchema.safeParse(result.data);
  if (!receipt.success) return fail(503, "Invalid evidence receipt.");
  return NextResponse.json({ reviewId: receipt.data.review_id, replayed: receipt.data.replayed },
    { status: receipt.data.replayed ? 200 : 201, headers });
}
