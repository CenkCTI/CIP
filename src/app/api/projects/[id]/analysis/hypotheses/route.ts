import { NextResponse } from "next/server";
import { requireOwnedProject } from "@/lib/projects/ownership";
import { validateOrigin, requireJson } from "@/lib/ai/byok/security";
import { saveHypothesisSchema, hypothesisReceiptSchema } from "@/lib/analysis/hypotheses/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers });
type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  if (new URL(req.url).searchParams.size !== 0) return fail(400, "Unexpected query parameters.");
  const ctx = await requireOwnedProject(id).catch(() => null);
  if (!ctx) return fail(404, "Not found.");
  const data = await ctx.supabase.from("analytic_hypothesis_current_v1")
    .select("id,hypothesis_id,revision,title,proposition,disconfirmation_test,status,rationale,authored_at,supersedes_id")
    .eq("project_id", ctx.projectId).order("authored_at", { ascending: false }).limit(101);
  if (data.error) return fail(503, "Hypothesis workspace is unavailable.");
  return NextResponse.json({ items: (data.data ?? []).slice(0, 100), truncated: (data.data?.length ?? 0) > 100 }, { headers });
}

export async function POST(req: Request, { params }: Params) {
  try { validateOrigin(req); requireJson(req); }
  catch { return fail(403, "Request origin or content type is not permitted."); }
  const { id } = await params;
  const ctx = await requireOwnedProject(id).catch(() => null);
  if (!ctx) return fail(404, "Not found.");
  const text = await req.text().catch(() => "");
  if (new TextEncoder().encode(text).length > 14_000) return fail(413, "Request too large.");
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { return fail(400, "Invalid JSON."); }
  const parsed = saveHypothesisSchema.safeParse(payload);
  if (!parsed.success) return fail(400, "Invalid hypothesis revision.");
  const v = parsed.data;
  const result = await ctx.supabase.rpc("save_analytic_hypothesis_v1", {
    p_project_id: ctx.projectId, p_hypothesis_id: v.hypothesisId,
    p_title: v.title, p_proposition: v.proposition,
    p_disconfirmation_test: v.disconfirmationTest, p_status: v.status,
    p_rationale: v.rationale, p_expected_current_version_id: v.expectedCurrentVersionId,
    p_request_id: v.requestId,
  }).single();
  if (result.error) {
    if (["40001", "23505"].includes(result.error.code)) return fail(409, "Hypothesis revision conflict.");
    if (result.error.code === "42501") return fail(404, "Not found.");
    if (["22023", "23514"].includes(result.error.code)) return fail(400, "Invalid hypothesis.");
    return fail(503, "Cannot save hypothesis.");
  }
  const receipt = hypothesisReceiptSchema.safeParse(result.data);
  if (!receipt.success) return fail(503, "Invalid save receipt.");
  return NextResponse.json({ hypothesisId: receipt.data.hypothesis_id, versionId: receipt.data.version_id,
    replayed: receipt.data.replayed }, { status: receipt.data.replayed ? 200 : 201, headers });
}
