import { z } from "zod";
import { jsonValueSchema, recordTechnicalSignalSchema, type JsonValue, type RecordTechnicalSignalInput } from "@/lib/techint/signals/schema";
import { collectionIssueKinds, collectionTriggers, technicalSourceKeys, technicalSourceStatuses, type TechnicalSourceKey } from "./types";

const boundedObject = (bytes: number) =>
  jsonValueSchema
    .refine(
      (value): value is Record<string, JsonValue> => value !== null && typeof value === "object" && !Array.isArray(value),
      "A JSON object is required.",
    )
    .refine((value) => Buffer.byteLength(JSON.stringify(value)) <= bytes, `JSON must be at most ${bytes} bytes.`);

export const sourceKeySchema = z.enum(technicalSourceKeys);
export const sourceStatusSchema = z.enum(technicalSourceStatuses);
export const collectionTriggerSchema = z.enum(collectionTriggers);
export const connectionIdSchema = z.uuid();

export const syntheticCursorSchema = z
  .object({ version: z.literal(1), sequence: z.number().int().min(0).default(0) })
  .strict();
export const cisaKevCursorSchema = z
  .object({
    version: z.literal(1),
    catalogRelease: z.string().max(200).optional(),
    etag: z.string().max(500).optional(),
    lastModified: z.string().max(200).optional(),
  })
  .strict();
export const nvdCursorSchema = z
  .object({ version: z.literal(1), lastModifiedWatermark: z.iso.datetime({ offset: true }).optional() })
  .strict();
export const firstEpssCursorSchema = z
  .object({
    version: z.literal(1),
    lastModified: z.string().trim().min(1).max(200).optional(),
    minimumEpss: z.number().min(0).max(1).optional(),
  })
  .strict();
export const threatFoxTechIntCursorSchema = z
  .object({
    version: z.literal(1),
    maxProviderId: z.string().regex(/^(?:0|[1-9]\d{0,39})$/).optional(),
    lookbackDays: z.number().int().min(1).max(7).optional(),
  })
  .strict();
export const malwareBazaarCursorSchema = z
  .object({ version: z.literal(1), lastFirstSeen: z.iso.datetime({ offset: true }).optional() })
  .strict();

export const sourceSettingsInputSchema = z
  .object({
    sourceKey: sourceKeySchema,
    intervalMinutes: z.coerce.number().int().min(0).max(1440),
    initialLookbackHours: z.coerce.number().int().min(1).max(168).optional(),
    minimumEpss: z.coerce.number().min(0).max(1).optional(),
    lookbackDays: z.coerce.number().int().min(1).max(7).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.sourceKey === "TEST_SYNTHETIC" && value.intervalMinutes !== 0) {
      ctx.addIssue({ code: "custom", path: ["intervalMinutes"], message: "Synthetic collection is manual only." });
    }
    if (value.sourceKey !== "TEST_SYNTHETIC" && (value.intervalMinutes < 60 || value.intervalMinutes > 1440)) {
      ctx.addIssue({ code: "custom", path: ["intervalMinutes"], message: "Technical source interval must be 60–1440 minutes." });
    }
    if (value.sourceKey === "NVD_CVE") {
      if (value.minimumEpss !== undefined || value.lookbackDays !== undefined) ctx.addIssue({ code: "custom", message: "NVD settings contain unsupported fields." });
    } else if (value.sourceKey === "FIRST_EPSS") {
      if (value.initialLookbackHours !== undefined || value.lookbackDays !== undefined) ctx.addIssue({ code: "custom", message: "FIRST EPSS settings contain unsupported fields." });
    } else if (value.sourceKey === "THREATFOX") {
      if (value.initialLookbackHours !== undefined || value.minimumEpss !== undefined) ctx.addIssue({ code: "custom", message: "ThreatFox settings contain unsupported fields." });
    } else if (value.initialLookbackHours !== undefined || value.minimumEpss !== undefined || value.lookbackDays !== undefined) {
      ctx.addIssue({ code: "custom", message: "This source does not accept additional settings." });
    }
  });

export type SourceSettingsInput = z.infer<typeof sourceSettingsInputSchema>;

export function technicalSourceSettingsObject(value: SourceSettingsInput): Record<string, number> {
  if (value.sourceKey === "NVD_CVE") return { initialLookbackHours: value.initialLookbackHours ?? 24 };
  if (value.sourceKey === "FIRST_EPSS") return { minimumEpss: value.minimumEpss ?? 0.1 };
  if (value.sourceKey === "THREATFOX") return { lookbackDays: value.lookbackDays ?? 1 };
  return {};
}

export function defaultTechnicalSourceSettings(sourceKey: TechnicalSourceKey): Record<string, number> {
  if (sourceKey === "NVD_CVE") return { initialLookbackHours: 24 };
  if (sourceKey === "FIRST_EPSS") return { minimumEpss: 0.1 };
  if (sourceKey === "THREATFOX") return { lookbackDays: 1 };
  return {};
}

export const collectionIssueSchema = z
  .object({
    kind: z.enum(collectionIssueKinds),
    code: z.string().trim().min(1).max(100),
    message: z.string().trim().min(1).max(500),
    sourceRecordKey: z.string().trim().max(300).nullable().optional(),
  })
  .strict();

export const collectionCountersSchema = z
  .object({
    recordsSeen: z.number().int().nonnegative(),
    recordsMapped: z.number().int().nonnegative(),
    signalsCreated: z.number().int().nonnegative(),
    observationsCreated: z.number().int().nonnegative(),
    revisionsCreated: z.number().int().nonnegative(),
    duplicateObservations: z.number().int().nonnegative(),
    supportingObservations: z.number().int().nonnegative(),
    staleObservations: z.number().int().nonnegative(),
    conflictingObservations: z.number().int().nonnegative(),
    skippedRecords: z.number().int().nonnegative(),
    failedRecords: z.number().int().nonnegative(),
  })
  .strict();

export const collectionClaimSchema = z
  .object({
    run_id: z.uuid(),
    owner_id: z.uuid(),
    connection_id: z.uuid(),
    source_key: sourceKeySchema,
    settings: boundedObject(16384),
    cursor: boundedObject(32768),
    lease_token: z.string().regex(/^[a-f0-9]{64}$/),
    lease_expires_at: z.iso.datetime({ offset: true }),
  })
  .strict();

const mappedTechnicalSignalSchema = z.custom<Omit<RecordTechnicalSignalInput, "actorId">>((value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value) || "actorId" in value) return false;
  return recordTechnicalSignalSchema.safeParse({
    ...(value as Record<string, unknown>),
    actorId: "10000000-0000-4000-8000-000000000001",
  }).success;
}, "A valid actor-free Technical Signal mapping is required.");

export const adapterResultSchema = z
  .object({
    recordsSeen: z.number().int().nonnegative().max(5000),
    recordsMapped: z.number().int().nonnegative().max(2500),
    signals: z.array(mappedTechnicalSignalSchema).max(2500),
    issues: z.array(collectionIssueSchema).max(100),
    nextCursor: boundedObject(32768),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.recordsMapped !== value.signals.length || value.recordsMapped > value.recordsSeen) {
      ctx.addIssue({ code: "custom", message: "Adapter counters are inconsistent." });
    }
  });

export const sourceConnectionRowSchema = z
  .object({
    id: z.uuid(),
    source_key: sourceKeySchema,
    status: sourceStatusSchema,
    settings: boundedObject(16384),
    cursor_version: z.number().int().positive(),
    interval_minutes: z.number().int().nonnegative(),
    next_run_at: z.string().nullable(),
    last_started_at: z.string().nullable(),
    last_succeeded_at: z.string().nullable(),
    last_failed_at: z.string().nullable(),
    consecutive_failures: z.number().int().nonnegative(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough();
