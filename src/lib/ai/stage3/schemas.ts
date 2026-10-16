import { z } from "zod";

const uuid = z.string().uuid();
const page = z.number().int().min(1).max(10000);
const contextSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("annotation"), annotationId: uuid }).strict(),
  z.object({ kind: z.literal("page"), page: page }).strict(),
  z.object({ kind: z.literal("pages"), pageStart: page, pageEnd: page }).strict()
    .refine((v) => v.pageEnd >= v.pageStart && v.pageEnd - v.pageStart < 10, "Select at most ten consecutive pages."),
]);

export const stage3RequestSchema = z.object({
  sourceId: uuid,
  assetId: uuid,
  context: contextSchema,
  mode: z.enum(["ask", "analyse"]),
  question: z.string().trim().min(1).max(1500).optional(),
  responseLanguage: z.enum(["auto", "tr", "en"]).optional(),
  // Previous turns are user-controlled conversation hints, never evidence or authority.
  history: z.array(z.object({
    user: z.string().trim().min(1).max(500),
    assistant: z.string().trim().max(1000),
  }).strict()).max(3).optional(),
  byokConsent: z.literal(true),
}).strict().superRefine((v, ctx) => {
  if (v.mode === "ask" && !v.question) ctx.addIssue({
    code: "custom", path: ["question"], message: "A question is required in ask mode.",
  });
});
export type Stage3Request = z.infer<typeof stage3RequestSchema>;

export const stage3ModelSchema = z.object({
  summary: z.string().trim().max(2400),
  evidence: z.array(z.object({
    statement: z.string().trim().min(1).max(1200),
    source_token: z.string().regex(/^(?:DOC_P\d{3,5}_C\d{2,3}|ANN_\d{3})$/),
    quote: z.string().trim().min(1).max(1200),
  }).strict()).max(12),
  unansweredQuestions: z.array(z.string().trim().max(400)).max(8),
  warnings: z.array(z.string().trim().max(400)).max(8),
}).strict();
export type Stage3ModelResponse = z.infer<typeof stage3ModelSchema>;
