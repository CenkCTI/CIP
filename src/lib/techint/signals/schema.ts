import { z } from "zod";
import { entityKinds, entityRoles, recordingAssertionBases, signalLifecycles, signalSeverities, signalTypes, sourceFamilies } from "./types";

const jsonBound = (max: number) => z.record(z.string(), z.unknown()).refine((v) => Buffer.byteLength(JSON.stringify(v)) <= max, `JSON must be at most ${max} bytes.`);
const instant = z.iso.datetime({ offset: true });
const safeUrl = z.url().max(2048).refine((raw) => { const u = new URL(raw); return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password; }, "Only credential-free HTTP(S) URLs are accepted.");
const identifier = z.string().trim().min(1).max(200).regex(/^[^\u0000-\u001f]+$/);
export const signalEntityAssertionSchema = z.object({
  entityKind: z.enum(entityKinds), displayValue: z.string().trim().min(1).max(500), normalizedValue: z.string().trim().min(1).max(500), semanticRole: z.enum(entityRoles), assertionBasis: z.enum(recordingAssertionBases), confidence: z.number().int().min(0).max(100).nullable().optional(), indicatorType: z.enum(["IP", "CIDR", "DOMAIN", "URL", "HASH", "EMAIL"]).nullable().optional(), sourceEntityType: z.string().trim().max(80).nullable().optional(), sourceEntityId: z.uuid().nullable().optional(),
}).superRefine((v, ctx) => { if ((v.entityKind === "INDICATOR") !== Boolean(v.indicatorType)) ctx.addIssue({ code: "custom", path: ["indicatorType"], message: "Indicator subtype must be present only for Indicators." }); });
export const recordTechnicalSignalSchema = z.object({
  actorId: z.uuid(), signal: z.object({ signalType: z.enum(signalTypes), canonicalKey: z.string().trim().min(1).max(700), title: z.string().trim().min(1).max(500), summary: z.string().max(4000), lifecycle: z.enum(signalLifecycles), severity: z.enum(signalSeverities), confidence: z.number().int().min(0).max(100).nullable(), facts: jsonBound(65536), publishedAt: instant.nullable(), observedAt: instant.nullable(), effectiveAt: instant, supersededBySignalId: z.uuid().nullable().optional() }),
  observation: z.object({ sourceFamily: z.enum(sourceFamilies), sourceSystem: identifier, sourceRecordKey: identifier, sourceRevisionKey: identifier.nullable().optional(), sourceUrl: safeUrl.nullable().optional(), sourceTitle: z.string().trim().max(500).nullable().optional(), sourcePublishedAt: instant.nullable(), sourceModifiedAt: instant.nullable(), sourceObservedAt: instant.nullable(), receivedAt: instant, effectiveAt: instant, sourceSnapshot: jsonBound(65536) }),
  entityAssertions: z.array(signalEntityAssertionSchema).max(100),
}).strict();
export type RecordTechnicalSignalInput = z.infer<typeof recordTechnicalSignalSchema>;
