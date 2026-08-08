import { z } from "zod";
import { entityKinds } from "@/lib/techint/signals/types";
import { technicalEntityIndicatorTypes, technicalEntityStatuses } from "./types";

export const entityIdSchema = z.string().uuid();
export const entityKindSchema = z.enum(entityKinds);
export const entityIndicatorTypeSchema = z.enum(technicalEntityIndicatorTypes);
export const entityStatusSchema = z.enum(technicalEntityStatuses);

export const reconcileEntitiesInputSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const createEntityInputSchema = z.object({
  kind: entityKindSchema,
  canonicalName: z.string().trim().min(1).max(500),
  indicatorType: entityIndicatorTypeSchema.nullable().optional(),
});

export const createEntityFromAssertionInputSchema = z.object({
  assertionId: entityIdSchema,
  canonicalName: z.string().trim().max(500).optional(),
  rememberAlias: z.boolean().default(false),
});

export const linkAssertionInputSchema = z.object({
  assertionId: entityIdSchema,
  entityId: entityIdSchema,
  rememberAlias: z.boolean().default(false),
});

export const addAliasInputSchema = z.object({
  entityId: entityIdSchema,
  displayValue: z.string().trim().min(1).max(500),
  sourceAssertionId: entityIdSchema.nullable().optional(),
});

export const createEntityResultSchema = z.object({
  entity_id: entityIdSchema,
  created: z.boolean(),
  status: entityStatusSchema,
  deterministic_key: z.string().max(700).nullable(),
}).strict();

export const createEntityFromAssertionResultSchema = z.object({
  entity_id: entityIdSchema,
  resolution_id: entityIdSchema,
  created: z.boolean(),
}).strict();

export const reconcileEntitiesResultSchema = z.object({
  processed: z.number().int().nonnegative(),
  resolved: z.number().int().nonnegative(),
  needs_review: z.number().int().nonnegative(),
  entities_created: z.number().int().nonnegative(),
}).strict();
