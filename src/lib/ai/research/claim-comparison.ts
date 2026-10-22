import {z} from "zod";
import {researchContextSchema} from "./types";
import {normalizedQuote, type Stage3Span} from "@/lib/ai/stage3/provenance";
import type {ReadWebPage} from "./types";
import type {SkippedComparisonSource} from "./comparison-fetch";

export const claimComparisonRequestSchema=z.object({
  sourceId:z.string().uuid(),
  assetId:z.string().uuid(),
  context:researchContextSchema,
  question:z.string().trim().min(5).max(300),
  urls:z.array(z.string().trim().url().max(2048)).min(1).max(3)
    .refine(urls=>new Set(urls).size===urls.length,"Select distinct URLs."),
  byokConsent:z.literal(true),
}).strict();

export const claimComparisonModelSchema=z.object({
  claim:z.object({
    paraphrase:z.string().trim().min(5).max(800),
    source_token:z.string().regex(/^(?:DOC_P\d{3,5}_C\d{2,3}|ANN_\d{3})$/),
    quote:z.string().trim().min(12).max(900),
  }).strict(),
  comparisons:z.array(z.object({
    source_token:z.string().regex(/^WEB_00[1-3]$/),
    relationship:z.enum(["supports","contradicts","qualifies","insufficient_evidence"]),
    quote:z.string().trim().min(12).max(900).nullable(),
    explanation:z.string().trim().min(5).max(850),
    limitation:z.string().trim().max(500),
  }).strict()).max(3),
  openQuestions:z.array(z.string().trim().min(1).max(400)).max(6),
}).strict();

export type ClaimComparisonModel=z.infer<typeof claimComparisonModelSchema>;
export type ClaimComparisonResult={
  pdfClaim:{paraphrase:string;quote:string;sourceToken:string;
    originKind:"attributed_or_question"|"unclassified";
    sourceId:string;assetId:string;page:number|null;annotationId?:string};
  rows:Array<{sourceToken:string;url:string;title:string;domain:string;
    retrievedAt:string;relationship:"supports"|"contradicts"|"qualifies"|"insufficient_evidence";
    quote:string|null;explanation:string;limitation:string;verifiedQuote:boolean;
    evidenceStatus:"verified"|"no_quote"|"rejected_quote"}>;
  openQuestions:string[];discarded:number;warnings:string[];status:"analyst_review_required";
  skippedSources:SkippedComparisonSource[];
};
export type ClaimComparisonOutcome=ClaimComparisonResult|{
  status:"sources_unavailable";skippedSources:SkippedComparisonSource[];
};

/** Conservative signal that the excerpt reports SOMEONE ELSE'S proposition or a
 * question; not evidence that the underlying proposition is true. Unclassified
 * means unknown, never independently asserted or independently corroborated. */
export function classifyPdfExcerpt(quote:string):"attributed_or_question"|"unclassified"{
  if(/\b(?:your|the|their|his|her)\s+(?:reports?|stud(?:y|ies)|articles?|research|papers?)\s+(?:cites?|says?|states?|claims?|alleges?|suggests?|mentions?)\b/i.test(quote))
    return "attributed_or_question";
  if(/\?\s*$/.test(quote)||/^\s*(?:who|what|why|how|where|when|does|did|do|is|are|can|could|would|should)\b/i.test(quote))
    return "attributed_or_question";
  return "unclassified";
}
/** Verifies exact excerpts against only server-supplied, bounded PDF and WEB text.
 * Relationship and paraphrase remain MODEL OPINION, never automatic corroboration. */
export function verifyClaimComparison(model:ClaimComparisonModel,
  pdfSpans:Pick<Stage3Span,"token"|"text"|"sourceId"|"assetId"|"page"|"annotationId">[],
  pages:ReadWebPage[]):ClaimComparisonResult|null{
  const span=pdfSpans.find(s=>s.token===model.claim.source_token);
  if(!span||!normalizedQuote(span.text).includes(normalizedQuote(model.claim.quote)))return null;
  const originKind=classifyPdfExcerpt(model.claim.quote);
  let discarded=0;
  const rows=pages.map((page,i)=>{
    const token="WEB_"+String(i+1).padStart(3,"0");
    const candidate=model.comparisons.find(c=>c.source_token===token);
    const quote=candidate?.quote??null;
    const verifiedQuote=Boolean(quote&&normalizedQuote(page.text).includes(normalizedQuote(quote)));
    const evidenceStatus:"verified"|"no_quote"|"rejected_quote"=
      verifiedQuote?"verified":quote?"rejected_quote":"no_quote";
    if(evidenceStatus==="rejected_quote")discarded++;
    const relationship:ClaimComparisonResult["rows"][number]["relationship"]=
      verifiedQuote&&candidate?.relationship!=="insufficient_evidence"
      ?candidate!.relationship:"insufficient_evidence";
    return {sourceToken:token,url:page.url,title:page.title,domain:page.domain,
      retrievedAt:page.retrievedAt,relationship,
      quote:verifiedQuote?quote:null,
      explanation:verifiedQuote
        ?candidate?.explanation??"Analyst review required."
        :"No exact web quotation was verified for this comparison.",
      limitation:verifiedQuote?candidate?.limitation??"":"No source-supported comparison can be established.",
      verifiedQuote,evidenceStatus};
  });
  return {
    pdfClaim:{paraphrase:originKind==="attributed_or_question"
        ?"A speaker references or questions a reported proposition. The transcript alone does not verify it."
        :model.claim.paraphrase,
      quote:model.claim.quote,originKind,
      sourceToken:span.token,sourceId:span.sourceId,assetId:span.assetId,
      page:span.page,...(span.annotationId?{annotationId:span.annotationId}:{})},
    rows,openQuestions:model.openQuestions,discarded,skippedSources:[],
    warnings:[
      "The claim paraphrase and relationships are AI suggestions, not validated conclusions.",
      ...(originKind==="attributed_or_question"?
        ["The PDF excerpt is an attributed statement or question, not an independently established claim."]:[]),
      "Missing or rejected WEB quotes mean no verified comparison; they do NOT prove that a web page has no relevant evidence.",
      "Matching a quotation verifies textual provenance, not the truth, relevance, or independence of a source.",
    ],
    status:"analyst_review_required",
  };
}
