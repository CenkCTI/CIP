import { z } from "zod";

export const technicalProfileMatchLifecycles = ["NEW", "REVIEWED", "ACCEPTED", "DISMISSED", "NOT_RELEVANT", "SNOOZED"] as const;
export const technicalProfileMatchLifecycleSchema = z.enum(technicalProfileMatchLifecycles);

export const technicalIntelligenceBatchResultSchema = z.object({
  requested: z.number().int().nonnegative(),
  evaluated: z.number().int().nonnegative(),
  profile_matches_changed: z.number().int().nonnegative(),
  engine_version: z.string().min(1).max(80),
}).strict();

export const technicalProfileEvaluationResultSchema = z.object({
  signals_checked: z.number().int().nonnegative(),
  matches_active: z.number().int().nonnegative(),
  matches_changed: z.number().int().nonnegative(),
}).strict();

export const technicalProfileMatchLifecycleResultSchema = z.object({
  match_id: z.uuid(),
  profile_id: z.uuid(),
  signal_id: z.uuid(),
  lifecycle: technicalProfileMatchLifecycleSchema,
  changed: z.boolean(),
}).strict();

export type TechnicalProfileMatchLifecycle = z.infer<typeof technicalProfileMatchLifecycleSchema>;
export type TechnicalIntelligenceBatchResult = z.infer<typeof technicalIntelligenceBatchResultSchema>;
