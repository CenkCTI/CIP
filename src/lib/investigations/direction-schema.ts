import { z } from "zod";

export const investigationQuestionStatuses = [
  "OPEN",
  "PARTIALLY_ANSWERED",
  "ANSWERED",
  "DROPPED",
] as const;

export const investigationGapStatuses = [
  "OPEN",
  "PARTIALLY_RESOLVED",
  "RESOLVED",
  "DEFERRED",
] as const;

export const workingKnowledgeStates = [
  "ACTIVE",
  "SUPERSEDED",
  "WITHDRAWN",
] as const;

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value || null);

const scopeList = z
  .array(z.string().trim().min(1).max(160))
  .max(20)
  .transform((items) => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = item.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional()
  .transform((value) => value || null);

const dueDate = z
  .string()
  .datetime({ offset: true })
  .nullable()
  .optional()
  .transform((value) => value || null);

export const investigationRequirementSchema = z.object({
  name: z.string().trim().min(2).max(120),
  research_question: z.string().trim().min(10).max(2000),
  purpose: z.string().trim().min(5).max(2000),
});

export const investigationDecisionContextSchema = z.object({
  intended_consumer: nullableText(500),
  decision_context: nullableText(4000),
  expected_product_type: nullableText(160),
});

export const investigationScopeSchema = z
  .object({
    scope_geography: scopeList.default([]),
    scope_sectors: scopeList.default([]),
    scope_activity_types: scopeList.default([]),
    scope_actors: scopeList.default([]),
    scope_technologies: scopeList.default([]),
    scope_time_start: dateOnly,
    scope_time_end: dateOnly,
    out_of_scope: nullableText(2000),
  })
  .superRefine((value, context) => {
    if (
      value.scope_time_start &&
      value.scope_time_end &&
      value.scope_time_start > value.scope_time_end
    ) {
      context.addIssue({
        code: "custom",
        path: ["scope_time_end"],
        message: "Scope end date must be on or after the start date.",
      });
    }
  });

export const investigationLifecycleSchema = z.object({
  investigation_status: z.enum([
    "DRAFT",
    "ACTIVE",
    "ANALYSIS",
    "REVIEW",
    "COMPLETED",
    "ARCHIVED",
  ]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  due_at: dueDate,
});

export const supportingQuestionCreateSchema = z.object({
  question: z.string().trim().min(5).max(1000),
});

export const supportingQuestionUpdateSchema = z.object({
  id: z.string().uuid(),
  question: z.string().trim().min(5).max(1000),
  status: z.enum(investigationQuestionStatuses),
});

export const informationGapCreateSchema = z.object({
  description: z.string().trim().min(5).max(1000),
});

export const informationGapUpdateSchema = z.object({
  id: z.string().uuid(),
  description: z.string().trim().min(5).max(1000),
  status: z.enum(investigationGapStatuses),
});

export const workingKnowledgeCreateSchema = z.object({
  statement: z.string().trim().min(1).max(2000),
});

export const workingKnowledgeUpdateSchema = z.object({
  id: z.string().uuid(),
  statement: z.string().trim().min(1).max(2000),
  state: z.enum(workingKnowledgeStates),
});

export const orderedRecordSchema = z.object({
  id: z.string().uuid(),
  direction: z.enum(["UP", "DOWN"]),
});

export const recordIdSchema = z.object({ id: z.string().uuid() });

export const workingKnowledgeSupportSchema = z
  .object({
    knowledge_id: z.string().uuid(),
    source_id: z.string().uuid().nullable().optional(),
    evidence_id: z.string().uuid().nullable().optional(),
    analyst_note: nullableText(2000),
  })
  .superRefine((value, context) => {
    const count = Number(Boolean(value.source_id)) + Number(Boolean(value.evidence_id));
    if (count !== 1) {
      context.addIssue({
        code: "custom",
        path: ["source_id"],
        message: "Choose exactly one Source or Evidence record.",
      });
    }
  });

export type InvestigationQuestionStatus =
  (typeof investigationQuestionStatuses)[number];
export type InvestigationGapStatus = (typeof investigationGapStatuses)[number];
export type WorkingKnowledgeState = (typeof workingKnowledgeStates)[number];

export type SupportingQuestion = {
  id: string;
  project_id: string;
  question: string;
  status: InvestigationQuestionStatus;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type InformationGap = {
  id: string;
  project_id: string;
  description: string;
  status: InvestigationGapStatus;
  sort_order: number;
  created_by: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkingKnowledge = {
  id: string;
  project_id: string;
  statement: string;
  state: WorkingKnowledgeState;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type WorkingKnowledgeSupport = {
  id: string;
  project_id: string;
  knowledge_id: string;
  source_id: string | null;
  evidence_id: string | null;
  analyst_note: string | null;
  created_by: string;
  created_at: string;
};
