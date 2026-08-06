import { z } from "zod";
import { entityKinds, entityRoles, recordingAssertionBases, signalLifecycles, signalSeverities, signalTypes, sourceFamilies } from "./types";
import { indicatorCanonicalKey, validateCanonicalKey, validateSourceDefinedCanonicalKey } from "./canonical-key";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function isJsonValue(value: unknown, ancestors = new WeakSet<object>()): value is JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Reflect.ownKeys(value).some((key) => typeof key === "symbol")) return false;
      return value.every((item) => isJsonValue(item, ancestors)) && Object.keys(value).length === value.length;
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor) || !isJsonValue(descriptor.value, ancestors)) return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    ancestors.delete(value);
  }
}

export const jsonValueSchema = z.custom<JsonValue>(isJsonValue, "Only plain JSON-compatible values are accepted.");
const boundedJsonObject = (max: number) => jsonValueSchema.refine((value): value is { [key: string]: JsonValue } => value !== null && typeof value === "object" && !Array.isArray(value), "A JSON object is required.").refine((value) => {
  try { return Buffer.byteLength(JSON.stringify(value)) <= max; } catch { return false; }
}, `JSON must be at most ${max} bytes.`);
const instant = z.iso.datetime({ offset: true });
const safeUrl = z.url().max(2048).refine((raw) => { const url = new URL(raw); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; }, "Only credential-free HTTP(S) URLs are accepted.");
const identifier = z.string().trim().min(1).max(200).regex(/^[^\u0000-\u001f]+$/);

export const signalEntityAssertionSchema = z.object({
  entityKind: z.enum(entityKinds), displayValue: z.string().trim().min(1).max(500), normalizedValue: z.string().trim().min(1).max(500), semanticRole: z.enum(entityRoles), assertionBasis: z.enum(recordingAssertionBases), confidence: z.number().int().min(0).max(100).nullable().optional(), indicatorType: z.enum(["IP", "CIDR", "DOMAIN", "URL", "HASH", "EMAIL"]).nullable().optional(), sourceEntityType: z.string().trim().max(80).nullable().optional(), sourceEntityId: z.uuid().nullable().optional(),
}).strict().superRefine((value, context) => {
  if ((value.entityKind === "INDICATOR") !== Boolean(value.indicatorType)) context.addIssue({ code: "custom", path: ["indicatorType"], message: "Indicator subtype mismatch." });
  if ((value.sourceEntityType == null) !== (value.sourceEntityId == null)) context.addIssue({ code: "custom", path: ["sourceEntityId"], message: "Source entity snapshots must be paired." });
  if (value.entityKind === "INDICATOR" && value.indicatorType) {
    try { if (indicatorCanonicalKey(value.indicatorType, value.normalizedValue) !== `indicator:${value.indicatorType}:${value.normalizedValue}`) throw new Error(); }
    catch { context.addIssue({ code: "custom", path: ["normalizedValue"], message: "Indicator must be canonical." }); }
  }
});

export const recordTechnicalSignalSchema = z.object({
  actorId: z.uuid(),
  signal: z.object({ signalType: z.enum(signalTypes), canonicalKey: z.string().trim().min(1).max(700), title: z.string().trim().min(1).max(500), summary: z.string().max(4000), lifecycle: z.enum(signalLifecycles), severity: z.enum(signalSeverities), confidence: z.number().int().min(0).max(100).nullable(), facts: boundedJsonObject(65536), publishedAt: instant.nullable(), observedAt: instant.nullable(), effectiveAt: instant, supersededBySignalId: z.uuid().nullable().optional() }).strict(),
  observation: z.object({ sourceFamily: z.enum(sourceFamilies), sourceSystem: identifier, sourceRecordKey: identifier, sourceRevisionKey: identifier.nullable().optional(), sourceUrl: safeUrl.nullable().optional(), sourceTitle: z.string().trim().max(500).nullable().optional(), sourcePublishedAt: instant.nullable(), sourceModifiedAt: instant.nullable(), sourceObservedAt: instant.nullable(), receivedAt: instant, effectiveAt: instant, sourceSnapshot: boundedJsonObject(65536) }).strict(),
  entityAssertions: z.array(signalEntityAssertionSchema).max(100),
}).strict().superRefine((value, context) => {
  if (value.signal.effectiveAt !== value.observation.effectiveAt) context.addIssue({ code: "custom", path: ["observation", "effectiveAt"], message: "Effective times must match exactly." });
  try {
    validateCanonicalKey(value.signal.signalType, value.signal.canonicalKey);
    if (/^(report|advisory):/.test(value.signal.canonicalKey)) validateSourceDefinedCanonicalKey(value.signal.canonicalKey, value.observation.sourceSystem, value.observation.sourceRecordKey);
  } catch (error) { context.addIssue({ code: "custom", path: ["signal", "canonicalKey"], message: error instanceof Error ? error.message : "Invalid key." }); }
});
export type RecordTechnicalSignalInput = z.infer<typeof recordTechnicalSignalSchema>;
export const recordTechnicalSignalResultSchema = z.object({ signal_id: z.uuid(), observation_id: z.uuid(), revision_id: z.uuid().nullable(), signal_created: z.boolean(), observation_created: z.boolean(), revision_created: z.boolean(), duplicate_observation: z.boolean(), disposition: z.enum(["CURRENT", "SUPPORTING", "STALE", "CONFLICTING"]), current_revision_number: z.number().int().positive(), entity_assertions_created: z.number().int().nonnegative() }).strict();
export type RecordTechnicalSignalResult = z.infer<typeof recordTechnicalSignalResultSchema>;
