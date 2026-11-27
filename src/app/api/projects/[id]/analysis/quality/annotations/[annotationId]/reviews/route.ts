import { z } from "zod";
import { requireJson, validateOrigin } from "@/lib/ai/byok/security";
import { annotationReviewSchema } from "@/lib/analysis/annotation-credibility/schema";
import { assertionCredibilityRpcResultSchema } from "@/lib/analysis/credibility/schema";
import { requireOwnedProject } from "@/lib/projects/ownership";

async function readReview(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("invalid_body");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let body = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return JSON.parse(body + decoder.decode());
      bytes += chunk.value.byteLength;
      if (bytes > 18_000) {
        void reader.cancel().catch(() => {});
        throw new Error("body_too_large");
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; annotationId: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  const fail = (status: number, error: string) => Response.json({ error }, { status, headers });
  try { validateOrigin(req); requireJson(req); }
  catch { return fail(403, "Request origin or content type not allowed."); }
  const { id, annotationId } = await params;
  if (!z.uuid().safeParse(annotationId).success) return fail(400, "Invalid annotation ID.");
  const context = await requireOwnedProject(id).catch(() => null);
  if (!context) return fail(404, "Not found.");
  let body: unknown;
  try { body = await readReview(req); }
  catch (error) {
    if (error instanceof Error && error.message === "body_too_large") return fail(413, "Review request too large.");
    return fail(400, "Invalid review request.");
  }
  const parsed = annotationReviewSchema.safeParse(body);
  if (!parsed.success) return fail(400, "Invalid review. Select a grade from 2 through 6 and enter a rationale.");
  const input = parsed.data;
  const { data, error } = await context.supabase.rpc("save_annotation_credibility_review_v1", {
    p_project_id: context.projectId, p_annotation_id: annotationId, p_credibility: input.credibility,
    p_rationale: input.rationale, p_method_version: input.methodVersion, p_expected_review_id: input.expectedReviewId,
    p_provenance: input.provenance, p_request_id: input.requestId,
  }).single();
  if (error?.code === "42501") return fail(404, "Not found.");
  if (error?.code === "40001" || error?.code === "23505") return fail(409, "The assessment or passage changed. Reload the review and try again.");
  if (error?.code === "22023") return fail(400, "Invalid annotation review.");
  const receipt = assertionCredibilityRpcResultSchema.safeParse(data);
  if (error || !receipt.success) return fail(503, "Annotation credibility unavailable.");
  return Response.json(receipt.data, { status: receipt.data.replayed ? 200 : 201, headers });
}
