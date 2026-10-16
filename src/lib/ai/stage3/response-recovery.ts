import { extractOneJsonObject } from "@/lib/ai/json";
import { stage3ModelSchema, type Stage3ModelResponse } from "./schemas";

/**
 * Recover harmless JSON-format deviations without weakening evidence provenance.
 * Only the schema's explicitly allowed fields are projected; model-supplied
 * page, asset, source, role and other fields never enter the trusted result.
 */
export function parseStage3ModelResponse(raw: string): {
  response: Stage3ModelResponse;
  invalidEvidence: number;
  normalized: boolean;
} {
  if (raw.length > 100_000) throw new Error("stage3_output_too_large");
  const parsed = extractOneJsonObject(raw);
  const strict = stage3ModelSchema.safeParse(parsed);
  if (strict.success) {
    return { response: strict.data, invalidEvidence: 0, normalized: false };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("stage3_output_not_object");
  const source = parsed as Record<string, unknown>;
  if (typeof source.summary !== "string" || !Array.isArray(source.evidence)) {
    throw new Error("stage3_output_missing_required_fields");
  }
  // Never accept limitless model content; sanitize only the known response keys.
  const summary = source.summary.trim().slice(0, 2400);
  const rawEvidence = source.evidence.slice(0, 24);
  const items: Stage3ModelResponse["evidence"] = [];
  let invalidEvidence = source.evidence.length - rawEvidence.length;
  for (const value of rawEvidence) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      invalidEvidence++;
      continue;
    }
    const candidate = value as Record<string, unknown>;
    // Ignore a model-invented page or UUID instead of trusting it. The server
    // resolves provenance *only* from a source_token and a verified quote.
    const item = stage3ModelSchema.shape.evidence.element.safeParse({
      statement: candidate.statement,
      source_token: candidate.source_token,
      quote: candidate.quote,
    });
    if (!item.success || items.length >= 12) {
      invalidEvidence++;
      continue;
    }
    items.push(item.data);
  }
  const safeStrings = (value: unknown) => Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
      .map((v) => v.trim()).filter(Boolean).map((v) => v.slice(0, 400)).slice(0, 8)
    : [];
  const recovered = stage3ModelSchema.safeParse({
    summary,
    evidence: items,
    unansweredQuestions: safeStrings(source.unansweredQuestions),
    warnings: safeStrings(source.warnings),
  });
  if (!recovered.success) throw new Error("stage3_output_unrecoverable");
  return { response: recovered.data, invalidEvidence, normalized: true };
}
