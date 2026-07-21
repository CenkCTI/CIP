import "server-only";
import { z } from "zod";
import { aiChat, AiError } from "./client";
import { buildPrompt } from "./pure";
export { validateExtractedIndicator, missingProtectedTokens } from "./pure";
import { parseAiJson } from "./json";
import { type AiWorkflow } from "./config";
import { indicatorTypes } from "@/lib/cti-schema";

const text = (n: number) => z.string().trim().max(n);
const confidence = z.enum(["LOW", "MEDIUM", "HIGH"]);
const sourceRef = z.object({ kind: z.string().max(40), id: z.string().uuid() }).strict();
export const summarizeSchema = z.object({ title_suggestion: text(160), executive_summary: text(4000), key_findings: z.array(text(500)).max(12), intelligence_gaps: z.array(text(500)).max(10), caveats: z.array(text(500)).max(10), cited_source_note_ids: z.array(z.string().uuid()).max(20), disclaimer: text(500) }).strict();
export const indicatorExtractionSchema = z.object({ indicators: z.array(z.object({ value: text(500), type: z.enum(indicatorTypes), confidence, evidence_context: text(500), source_ref: sourceRef.nullable().optional() }).strict()).max(30), warnings: z.array(text(400)).max(10), disclaimer: text(500) }).strict();
export const entityExtractionSchema = z.object({ entities: z.array(z.object({ entity_type: z.enum(["actors","malware","campaigns","cves"]), name: text(180), confidence, evidence_excerpt: text(500), caveats: z.array(text(300)).max(5), source_ref: sourceRef.nullable().optional() }).strict()).max(25), warnings: z.array(text(400)).max(10), disclaimer: text(500) }).strict();
export const mitreSchema = z.object({ mappings: z.array(z.object({ technique_id: z.string().regex(/^T\d{4}(?:\.\d{3})?$/), technique_name: text(180), confidence, reasoning: text(600), evidence_excerpt: text(500), source_record_ids: z.array(z.string().uuid()).max(10) }).strict()).max(20), warnings: z.array(text(400)).max(10), disclaimer: text(500) }).strict();
export const reportDraftSchema = z.object({ title: text(180), report_type_suggestion: z.enum(["TECHNICAL","EXECUTIVE","CTI","AI_SECURITY","OSINT"]), sections: z.array(z.object({ heading: text(120), paragraphs: z.array(text(2000)).max(6), source_refs: z.array(sourceRef).max(20) }).strict()).max(12), caveats: z.array(text(500)).max(10), disclaimer: text(500) }).strict();
export const translationSchema = z.object({ translated_text: text(50000), target_language: text(60), source_record_id: z.string().uuid(), preservation_warnings: z.array(text(500)).max(20), disclaimer: text(500) }).strict();
export const schemas = { summarize_research: summarizeSchema, extract_indicators: indicatorExtractionSchema, extract_entities: entityExtractionSchema, suggest_mitre_mapping: mitreSchema, generate_report_draft: reportDraftSchema, translate_document: translationSchema } as const;
export type WorkflowResult<W extends AiWorkflow = AiWorkflow> = z.infer<(typeof schemas)[W]>;

export async function runStructuredWorkflow<W extends AiWorkflow>(workflow: W, sourceData: unknown) {
  const schema = schemas[workflow] as z.ZodTypeAny;
  const first = await aiChat(buildPrompt(workflow, sourceData));
  try { return parseAiJson(first, schema) as WorkflowResult<W>; } catch {
    const repaired = await aiChat([{ role: "system", content: "Repair malformed JSON. Return exactly one valid JSON object for the same schema. Do not add facts." }, { role: "user", content: first.slice(0, 12000) }]);
    try { return parseAiJson(repaired, schema) as WorkflowResult<W>; } catch { throw new AiError("malformed_output"); }
  }
}

export function toTiptapDoc(draft: z.infer<typeof reportDraftSchema>) {
  return { type: "doc", attrs: { version: 1 }, content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: `${draft.title} (AI-generated draft)` }] }, { type: "paragraph", content: [{ type: "text", text: draft.disclaimer }] }, ...draft.sections.flatMap((s) => [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: s.heading }] }, ...s.paragraphs.map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })), { type: "paragraph", content: [{ type: "text", text: `Sources: ${s.source_refs.map((r) => `${r.kind}:${r.id}`).join(", ") || "none cited"}` }] }])] };
}
