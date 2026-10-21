import { z } from "zod";

export const researchContextSchema=z.union([
  z.object({kind:z.literal("annotation"),annotationId:z.string().uuid()}).strict(),
  z.object({kind:z.literal("page"),page:z.number().int().min(1).max(10000)}).strict(),
  z.object({kind:z.literal("pages"),pageStart:z.number().int().min(1).max(10000),
    pageEnd:z.number().int().min(1).max(10000)}).strict().refine(x=>x.pageEnd>=x.pageStart&&x.pageEnd-x.pageStart<10),
]);
export const researchPlanRequestSchema=z.object({
  sourceId:z.string().uuid(),assetId:z.string().uuid(),context:researchContextSchema,
  question:z.string().trim().max(300).optional(),byokConsent:z.literal(true),
}).strict();
export const researchSearchRequestSchema=z.object({
  queries:z.array(z.string().trim().min(5).max(180)).min(1).max(3),
}).strict();
export const researchSynthesizeRequestSchema=z.object({
  urls:z.array(z.string().trim().url().max(2048)).min(1).max(3),
  question:z.string().trim().min(5).max(300),byokConsent:z.literal(true),
}).strict();
export const proposedQueriesSchema=z.object({
  queries:z.array(z.string().trim().min(5).max(180)).min(1).max(3),
}).strict();
export const researchModelResponseSchema=z.object({
  summary:z.string().trim().min(1).max(2800),
  evidence:z.array(z.object({
    statement:z.string().trim().min(1).max(700),
    source_token:z.string().regex(/^WEB_00[1-3]$/),
    quote:z.string().trim().min(12).max(900),
  }).strict()).max(6),
  differences:z.array(z.string().trim().max(400)).max(5).default([]),
  unansweredQuestions:z.array(z.string().trim().max(400)).max(5).default([]),
  warnings:z.array(z.string().trim().max(400)).max(5).default([]),
}).strict();
export type ResearchSearchResult={url:string;title:string;domain:string;snippet:string;
  publisher:string;publishedAt:string|null;query:string};
export type ReadWebPage={url:string;title:string;domain:string;retrievedAt:string;
  text:string;contentType:"text/html"|"text/plain"|"application/pdf"};
export type ResearchEvidence={statement:string;quote:string;sourceToken:string;
  url:string;title:string;domain:string;retrievedAt:string};
