import { z } from "zod";
import { aiChat, AiError } from "./client";
import { buildPrompt, buildRepairPrompt, buildTranslationPrompt, buildTranslationRepairPrompt, buildEntityExtractionRepairPrompt, sourceTextForEntityExtraction, hasExplicitEntityMarkers, extractExplicitEntityCandidates, protectedTokens, missingProtectedTokens } from "./pure";
export { validateExtractedIndicator, missingProtectedTokens, protectedTokens, sourceTextForEntityExtraction } from "./pure";
import { parseAiJson } from "./json";
import { type AiWorkflow } from "./config";
import { aliasMapByToken, type ReportSourceAlias } from "./provenance";
import { indicatorTypes } from "@/lib/cti-schema";

const text = (n: number) => z.string().trim().max(n);
const nonEmptyText = (n: number) => z.string().trim().min(1).max(n);
const confidence = z.enum(["LOW", "MEDIUM", "HIGH"]);
const sourceRef = z.object({ kind: z.string().max(40), id: z.string().uuid() }).strict();
const reportSourceRef = z.object({ kind: z.enum(["research_note", "evidence", "timeline_event", "task", "threat_actor", "campaign", "indicator", "malware", "cve", "mitre_technique"]), id: z.string().uuid() }).strict();
const sourceToken = z.string().regex(/^SRC_\d{3}$/);
export const summarizeSchema = z.object({ title_suggestion: text(160), executive_summary: text(4000), key_findings: z.array(text(500)).max(12), intelligence_gaps: z.array(text(500)).max(10), caveats: z.array(text(500)).max(10), cited_source_note_ids: z.array(z.string().uuid()).max(20), disclaimer: text(500) }).strict();
export const indicatorExtractionSchema = z.object({ indicators: z.array(z.object({ value: text(500), type: z.enum(indicatorTypes), confidence, evidence_context: text(500), source_ref: sourceRef.nullable().optional() }).strict()).max(30), warnings: z.array(text(400)).max(10), disclaimer: text(500) }).strict();
export const entityExtractionSchema = z.object({ entities: z.array(z.object({ entity_type: z.enum(["actors","malware","campaigns","cves"]), name: text(180), confidence, evidence_excerpt: text(500), caveats: z.array(text(300)).max(5), source_ref: sourceRef.nullable().optional() }).strict()).max(25), warnings: z.array(text(400)).max(10), disclaimer: text(500) }).strict();
export const mitreSchema = z.object({ mappings: z.array(z.object({ technique_id: z.string().regex(/^T\d{4}(?:\.\d{3})?$/), technique_name: text(180), confidence, reasoning: text(600), evidence_excerpt: text(500), source_record_ids: z.array(z.string().uuid()).max(10) }).strict()).max(20), warnings: z.array(text(400)).max(10), disclaimer: text(500) }).strict();
export const reportDraftSchema = z.object({ title: nonEmptyText(180), report_type_suggestion: z.enum(["TECHNICAL","EXECUTIVE","CTI","AI_SECURITY","OSINT"]), sections: z.array(z.object({ heading: nonEmptyText(120), paragraphs: z.array(nonEmptyText(2000)).min(1).max(6), source_refs: z.array(reportSourceRef).min(1).max(20) }).strict()).min(1).max(12), caveats: z.array(text(500)).max(10), disclaimer: nonEmptyText(500) }).strict();
export const reportDraftModelSchema = z.object({ title: nonEmptyText(180), report_type_suggestion: z.enum(["TECHNICAL","EXECUTIVE","CTI","AI_SECURITY","OSINT"]), sections: z.array(z.object({ heading: nonEmptyText(120), paragraphs: z.array(nonEmptyText(2000)).min(1).max(6), source_tokens: z.array(sourceToken).min(1).max(20) }).strict()).min(1).max(12), caveats: z.array(text(500)).max(10), disclaimer: nonEmptyText(500) }).strict();
export const translationSchema = z.object({ translated_text: text(50000), target_language: text(60), source_record_id: z.string().uuid(), preservation_warnings: z.array(text(500)).max(20), disclaimer: text(500) }).strict();
export const translationModelSchema = z.object({ translated_text: text(50000), disclaimer: text(500) }).strict();
export const schemas = { summarize_research: summarizeSchema, extract_indicators: indicatorExtractionSchema, extract_entities: entityExtractionSchema, suggest_mitre_mapping: mitreSchema, generate_report_draft: reportDraftSchema, translate_document: translationSchema } as const;
export type WorkflowResult<W extends AiWorkflow = AiWorkflow> = z.infer<(typeof schemas)[W]>;

function validationIssueSummary(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`);
  }
  return ["<root>: response was not exactly one valid JSON object matching the contract"];
}

function parseEntityExtractionResponse(raw: string) {
  try {
    return { ok: true as const, data: parseAiJson(raw, entityExtractionSchema) };
  } catch (error) {
    return { ok: false as const, issues: validationIssueSummary(error) };
  }
}

function deterministicEntityExtraction(sourceText: string, disclaimer = "AI-generated suggestions require analyst review.") {
  const deterministic = extractExplicitEntityCandidates(sourceText);
  return entityExtractionSchema.parse({ entities: deterministic, warnings: deterministic.length ? ["Deterministic extraction used explicit source markers after malformed or empty model output."] : [], disclaimer });
}

export async function runEntityExtractionWorkflow(sourceData: unknown, chat: typeof aiChat = aiChat) {
  const sourceText = sourceTextForEntityExtraction(sourceData);
  const hasMarkers = hasExplicitEntityMarkers(sourceText);
  const first = await chat(buildPrompt("extract_entities", sourceData));
  const firstResult = parseEntityExtractionResponse(first);
  if (firstResult.ok && (firstResult.data.entities.length || !hasMarkers)) return firstResult.data;
  const issues = firstResult.ok ? ["First response returned entities: [] despite explicit entity markers in authorized source text."] : firstResult.issues;
  const repaired = await chat(buildEntityExtractionRepairPrompt(sourceText, first, issues));
  const repairedResult = parseEntityExtractionResponse(repaired);
  if (repairedResult.ok) {
    if (repairedResult.data.entities.length || !hasMarkers) return repairedResult.data;
    return deterministicEntityExtraction(sourceText, repairedResult.data.disclaimer);
  }
  if (hasMarkers) return deterministicEntityExtraction(sourceText);
  throw new AiError("malformed_output");
}

export async function runStructuredWorkflow<W extends AiWorkflow>(workflow: W, sourceData: unknown, chat: typeof aiChat = aiChat) {
  const schema = schemas[workflow] as z.ZodTypeAny;
  const first = await chat(buildPrompt(workflow, sourceData));
  try { return parseAiJson(first, schema) as WorkflowResult<W>; } catch (firstError) {
    const repaired = await chat(buildRepairPrompt(workflow, first, validationIssueSummary(firstError)));
    try { return parseAiJson(repaired, schema) as WorkflowResult<W>; } catch { throw new AiError("malformed_output"); }
  }
}

function modelIssueSummary(error: unknown) {
  return validationIssueSummary(error);
}
function redactUuids(text: string) {
  return text.replace(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\b/g, "[REDACTED_UUID]");
}

export function canonicalizeReportDraftTokens(modelDraft: z.infer<typeof reportDraftModelSchema>, aliases: ReportSourceAlias[]) {
  const byToken = aliasMapByToken(aliases);
  const invalid: string[] = [];
  const sections = modelDraft.sections.map((section, sectionIndex) => ({
    heading: section.heading,
    paragraphs: section.paragraphs,
    source_refs: section.source_tokens.flatMap((token, tokenIndex) => {
      const alias = byToken.get(token);
      if (!alias) {
        invalid.push(`sections.${sectionIndex}.source_tokens.${tokenIndex}: unknown source token ${token}`);
        return [];
      }
      return [{ kind: alias.kind, id: alias.id }];
    }),
  }));
  if (invalid.length) throw new AiError("report_provenance_unreliable", invalid.join("; "));
  return reportDraftSchema.parse({ title: modelDraft.title, report_type_suggestion: modelDraft.report_type_suggestion, sections, caveats: modelDraft.caveats, disclaimer: modelDraft.disclaimer });
}

export async function runReportDraftWorkflow(sourceData: unknown, aliases: ReportSourceAlias[], chat: typeof aiChat = aiChat) {
  const allowedTokens = aliases.map((alias) => alias.source_token).join(", ");
  const first = await chat(buildPrompt("generate_report_draft", sourceData));
  try {
    return canonicalizeReportDraftTokens(parseAiJson(first, reportDraftModelSchema), aliases);
  } catch (firstError) {
    const issues = [`Allowed source_tokens: ${allowedTokens}`, ...modelIssueSummary(firstError)];
    const repaired = await chat(buildRepairPrompt("generate_report_draft", redactUuids(first), issues));
    try {
      return canonicalizeReportDraftTokens(parseAiJson(repaired, reportDraftModelSchema), aliases);
    } catch {
      throw new AiError("report_provenance_unreliable");
    }
  }
}

function normalizedText(textValue: string) {
  return textValue.replace(/\s+/g, " ").trim();
}

export function buildCanonicalTranslationResult(modelResult: z.infer<typeof translationModelSchema>, targetLanguage: string, sourceRecordId: string, sourceText: string) {
  return translationSchema.parse({
    translated_text: modelResult.translated_text,
    target_language: targetLanguage,
    source_record_id: sourceRecordId,
    preservation_warnings: missingProtectedTokens(sourceText, modelResult.translated_text).map((token) => `Protected token missing or changed: ${token}`),
    disclaimer: modelResult.disclaimer,
  });
}

function translationInvalid(result: z.infer<typeof translationSchema>, sourceText: string) {
  return (result.target_language !== "English" && normalizedText(result.translated_text) === normalizedText(sourceText)) || result.preservation_warnings.length > 0;
}

export async function runTranslationWorkflow(targetLanguage: string, sourceRecordId: string, sourceText: string, chat: typeof aiChat = aiChat) {
  const tokens = protectedTokens(sourceText);
  const sourceData = { source_text: sourceText, protected_tokens: tokens };
  const first = await chat(buildTranslationPrompt(targetLanguage, sourceData, tokens));
  try {
    const result = buildCanonicalTranslationResult(parseAiJson(first, translationModelSchema), targetLanguage, sourceRecordId, sourceText);
    if (!translationInvalid(result, sourceText)) return result;
    const repaired = await chat(buildTranslationRepairPrompt(targetLanguage, first, ["Translation was unchanged or protected tokens were missing/changed."], tokens));
    const repairedResult = buildCanonicalTranslationResult(parseAiJson(repaired, translationModelSchema), targetLanguage, sourceRecordId, sourceText);
    if (!translationInvalid(repairedResult, sourceText)) return repairedResult;
    throw new AiError("translation_invalid");
  } catch (firstError) {
    if (firstError instanceof AiError && firstError.code === "translation_invalid") throw firstError;
    const repaired = await chat(buildTranslationRepairPrompt(targetLanguage, first, modelIssueSummary(firstError), tokens));
    try {
      const repairedResult = buildCanonicalTranslationResult(parseAiJson(repaired, translationModelSchema), targetLanguage, sourceRecordId, sourceText);
      if (translationInvalid(repairedResult, sourceText)) throw new AiError("translation_invalid");
      return repairedResult;
    } catch {
      throw new AiError("translation_invalid");
    }
  }
}

export async function repairStructuredWorkflow<W extends AiWorkflow>(workflow: W, malformedOutput: string, issues: string[], chat: typeof aiChat = aiChat) {
  const schema = schemas[workflow] as z.ZodTypeAny;
  const repaired = await chat(buildRepairPrompt(workflow, malformedOutput, issues));
  try { return parseAiJson(repaired, schema) as WorkflowResult<W>; } catch { throw new AiError("malformed_output"); }
}

export function toTiptapDoc(draft: z.infer<typeof reportDraftSchema>) {
  const caveatNodes = draft.caveats.length
    ? [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Caveats" }] }, { type: "bulletList", content: draft.caveats.map((c) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: c }] }] })) }]
    : [];
  return { type: "doc", attrs: { version: 1 }, content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: `${draft.title} (AI-generated draft)` }] }, { type: "paragraph", content: [{ type: "text", text: draft.disclaimer }] }, ...draft.sections.flatMap((s) => [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: s.heading }] }, ...s.paragraphs.map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })), { type: "paragraph", content: [{ type: "text", text: `Sources: ${s.source_refs.map((r) => `${r.kind}:${r.id}`).join(", ") || "none cited"}` }] }]), ...caveatNodes] };
}
