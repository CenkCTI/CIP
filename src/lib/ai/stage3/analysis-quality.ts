import { AiError } from "@/lib/ai/client";
import type { Stage3Request } from "./schemas";
import { plainlyEnglishInsteadOfTurkish, resolveStage3ResponseLanguage } from "./language";
import type { Stage3Support } from "./provenance";

/**
 * A request to analyse a source is complete only when a narrative AND exact,
 * server-verified source excerpts survived output validation. Rejected model
 * quotations are ALWAYS stripped by provenance verification before this gate.
 * Their removal alone must not trigger repeated full-batch NVIDIA requests if
 * there is still useful source-backed material and a narrative. Such responses
 * retain a visible partial-verification warning for analyst review.
 * This does not assess the *truth* of a claim or magically prove every sentence
 * in a summary.
 * Failing closed lets the caller retry a narrower PDF page range instead of
 * mislabeling pages as successfully analysed.
 *
 * Ask may legitimately have no supported answer; Extraction may have no
 * candidates. Those workflows are intentionally not affected.
 */
export function assertStage3AnalysisComplete(
  request: Pick<Stage3Request,"mode"|"responseLanguage"|"question">,
  result: {summary:string; evidence:Stage3Support[]; discarded:number; warnings:string[]},
):void {
  if(request.mode!=="analyse")return;
  if(!result.summary.trim() || !result.evidence.length ||
     result.warnings.some((warning)=>/only previously verified source quotations|no source-supported statements could be verified/i.test(warning))){
    throw new AiError("analysis_incomplete");
  }
  if(resolveStage3ResponseLanguage(request.question,request.responseLanguage)==="tr" &&
     plainlyEnglishInsteadOfTurkish(result.summary,result.evidence.map(item=>item.statement))){
    throw new AiError("analysis_language_mismatch");
  }
}
