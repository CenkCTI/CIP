import { z } from "zod";
import { cookies } from "next/headers";

import { AiError } from "@/lib/ai/client";
import { byokChat } from "@/lib/ai/byok/client";
import { BYOK_COOKIE, byokEnabled, decryptCredential } from "@/lib/ai/byok/vault";
import { validateProviderModel } from "@/lib/ai/byok/providers";
import { noStore, readJsonLimited, validateOrigin } from "@/lib/ai/byok/security";
import { getAiConfig } from "@/lib/ai/config";
import { requireOwnedProject } from "@/lib/projects/ownership";
import { Stage3ContextError, createStage3ReadContext, loadStage3DocumentContext, type Stage3SourceStep } from "@/lib/ai/stage3/context";
import { Stage3PdfError } from "@/lib/ai/stage3/pdf-text";
import { modelFacingSpans } from "@/lib/ai/stage3/provenance";
import { stage3RequestSchema } from "@/lib/ai/stage3/schemas";
import { runStage3Processing } from "@/lib/ai/stage3/workflows";
import { runStage3CandidateExtraction } from "@/lib/ai/stage3/candidate-workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type Stage3FailureStage = "request" | "ownership" | "byok" | "source" | "quota" | "nvidia";

/** Public diagnostics contain only fixed enum values; never raw Supabase/NVIDIA error details. */
function responseError(error: unknown, stage: Stage3FailureStage, sourceStep?: Stage3SourceStep) {
  const detail = stage === "source" && sourceStep ? {sourceStep} : {};
  if (error instanceof z.ZodError) return noStore({code:"invalid_request",error:"Invalid processing request.",stage,...detail},{status:400});
  const code = error instanceof Stage3ContextError || error instanceof Stage3PdfError || error instanceof AiError
    ? error.code
    : error instanceof Error ? error.message : "request_failed";
  const errors: Record<string, [number,string]> = {
    stage3_not_found:[404,"Source, asset or annotation is unavailable."],
    unsupported_asset:[422,"A ready original PDF asset is required."],
    pdf_text_unavailable:[422,"No extractable text found. OCR is not enabled."],
    pdf_page_out_of_range:[422,"Selected page is outside this document."],
    pdf_invalid:[422,"The PDF could not be processed."],
    pdf_runtime_unavailable:[503,"Server-side PDF extraction is unavailable. Check PDF.js runtime dependencies in the deployment."],
    pdf_too_large:[413,"PDF exceeds the server limit."],
    pdf_document_too_large:[413,"The entire PDF exceeds the safe analysis limit (200 pages or 45,000 extracted characters). Choose a smaller page range."],
    context_too_large:[413,"Selected source text is too large. Select fewer pages."],
    bad_origin:[403,"Invalid request origin."],
    json_required:[415,"A JSON request is required."],
    body_too_large:[413,"Request is too large."],
    byok_required:[401,"Connect NVIDIA NIM before processing."],
    byok_expired:[401,"NVIDIA BYOK session expired."],
    byok_binding_mismatch:[401,"BYOK session is not valid for this user."],
    invalid_byok_cookie:[401,"Reconnect NVIDIA NIM before processing."],
    key_rejected:[401,"NVIDIA rejected the BYOK credential."],
    provider_forbidden:[403,"NVIDIA provider access was denied."],
    byok_consent_required:[400,"Explicit BYOK consent is required."],
    unsupported_provider:[400,"Stage 3 currently requires NVIDIA NIM."],
    unsupported_model:[400,"The NVIDIA model is not approved."],
    malformed_output:[422,"AI output could not be validated."],
    nvidia_output_exhausted:[422,"NVIDIA reached its output limit."],
    rate_limited:[429,"AI request quota exceeded."],
    provider_rate_limited:[429,"NVIDIA request limit reached."],
    provider_error:[502,"NVIDIA rejected this generation request. Try a different allowlisted model or a smaller PDF selection."],
    timeout:[504,"NVIDIA request timed out."],
    provider_unreachable:[502,"NVIDIA is unavailable."],
  };
  if (code === "Investigation not found") return noStore({code:"not_found",error:"Investigation not found.",stage,...detail},{status:404});
  if (code === "byok_not_configured" || code === "byok_unavailable") return noStore({code:"byok_unavailable",error:"BYOK is not configured.",stage,...detail},{status:503});
  const [status,message] = errors[code] ?? [500,"Processing request failed."];
  const publicCode = errors[code] ? code : "request_failed";
  // Log only fixed diagnostic labels; raw error strings may expose internal data.
  if (publicCode === "request_failed") console.error("stage3_processing_failure", {stage,sourceStep,code:publicCode});
  return noStore({code:publicCode,error:message,stage,...detail},{status});
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let stage: Stage3FailureStage = "request";
  let sourceStep: Stage3SourceStep | undefined;
  try {
    validateOrigin(req);
    const { id } = await params;
    const request = stage3RequestSchema.parse(await readJsonLimited(req, 20_480));
    stage = "ownership";
    const owned = await requireOwnedProject(id);
    stage = "byok";
    if (!byokEnabled()) throw new Error("byok_unavailable");
    const cookie = (await cookies()).get(BYOK_COOKIE)?.value;
    if (!cookie) throw new AiError("byok_required");
    const credential = decryptCredential(cookie, {kind:"user",id:owned.user.id});
    if (credential.providerId !== "nvidia_nim") throw new AiError("unsupported_provider");
    if (!validateProviderModel("nvidia_nim",credential.model)) throw new AiError("unsupported_model");
    // Verify the BYOK credential before performing expensive PDF extraction.
    stage = "source";
    const context = await loadStage3DocumentContext(
      createStage3ReadContext(owned), request, (step) => { sourceStep = step; },
    );

    const inputChars = JSON.stringify({
      title:context.sourceTitle,
      question:request.question,
      dialogue:request.history ?? [],
      excerpts:modelFacingSpans(context.spans),
    }).length;
    const cfg = getAiConfig();
    if (inputChars > cfg.maxInputChars) throw new Stage3ContextError("context_too_large");
    stage = "quota";
    const {data:eventId,error:reservationError} = await owned.supabase.rpc("reserve_ai_usage_event", {
      p_project_id:owned.projectId,
      p_workflow:"stage3_processing",
      p_input_chars:inputChars,
      p_window_minutes:cfg.rateLimitWindowMinutes,
      p_max_requests:cfg.rateLimitRequests,
      p_max_input_chars:cfg.rateLimitInputChars,
    });
    if (reservationError || !eventId) throw new AiError("rate_limited");

    try {
      stage = "nvidia";
      const result = request.mode === "extract"
        ? await runStage3CandidateExtraction(context,
            (messages) => byokChat("nvidia_nim", credential.model, credential.apiKey, messages,"generation"))
        : await runStage3Processing({request,...context},
            (messages) => byokChat("nvidia_nim", credential.model, credential.apiKey, messages,"generation"));
      await owned.supabase.rpc("complete_ai_usage_event",{
        p_event_id:eventId,p_status:"SUCCEEDED",p_output_chars:JSON.stringify(result).length,
      });
      return noStore({
        result, provider:"nvidia_nim", model:credential.model,
        notice:"AI suggestions only. The analyst must review evidence and explicitly save all domain records.",
      });
    } catch (e) {
      await owned.supabase.rpc("complete_ai_usage_event",{
        p_event_id:eventId,p_status:"FAILED",p_output_chars:0,
      });
      throw e;
    }
  } catch (error) {
    return responseError(error,stage,sourceStep);
  }
}
