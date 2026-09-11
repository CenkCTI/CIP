import { z } from "zod";

export const researchTypes = [
  "CTI",
  "AI_SECURITY",
  "OSINT",
  "DFIR",
  "MALWARE",
  "VULN_RESEARCH",
  "GEOPOLITICAL",
] as const;
export const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const investigationStatuses = [
  "DRAFT",
  "ACTIVE",
  "ANALYSIS",
  "REVIEW",
  "COMPLETED",
  "ARCHIVED",
] as const;
export const assessmentConfidenceLevels = ["LOW", "MEDIUM", "HIGH"] as const;

const tagsSchema = z
  .preprocess(
    (value) =>
      typeof value === "string"
        ? value
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : value,
    z.array(z.string().trim().min(1).max(40)).max(12),
  )
  .default([]);

const lineListSchema = (maxItems: number, maxLength: number) =>
  z
    .preprocess(
      (value) =>
        typeof value === "string"
          ? value
              .split(/\r?\n/)
              .map((item) => item.trim())
              .filter(Boolean)
          : value,
      z.array(z.string().trim().min(1).max(maxLength)).max(maxItems),
    )
    .transform((items) => {
      const seen = new Set<string>();
      return items.filter((item) => {
        const key = item.toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })
    .default([]);

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || null);

const nullableConfidence = z.preprocess(
  (value) => (value === "" || value == null ? null : value),
  z.union([z.enum(assessmentConfidenceLevels), z.null()]),
);

const nullableDateTime = z
  .preprocess(
    (value) => {
      if (value === "" || value == null) return null;
      if (typeof value !== "string") return value;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toISOString();
    },
    z.union([z.string(), z.null()]),
  )
  .refine(
    (value) =>
      value === null ||
      (typeof value === "string" && !Number.isNaN(new Date(value).getTime())),
    "Use a valid date.",
  );

const nullableDateOnly = z.preprocess(
  (value) => (value === "" || value == null ? null : value),
  z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid scope date."),
    z.null(),
  ]),
);

export const projectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Investigation title must be at least 2 characters.")
      .max(120),
    research_question: nullableText(2000),
    purpose: nullableText(2000),
    description: z.string().trim().max(2000).optional().default(""),
    research_type: z.enum(researchTypes),
    priority: z.enum(priorities),
    investigation_status: z.enum(investigationStatuses).default("DRAFT"),
    intended_consumer: nullableText(500),
    decision_context: nullableText(4000),
    expected_product_type: nullableText(160),
    due_at: nullableDateTime.default(null),
    scope_geography: lineListSchema(20, 160),
    scope_sectors: lineListSchema(20, 160),
    scope_activity_types: lineListSchema(20, 160),
    scope_actors: lineListSchema(20, 160),
    scope_technologies: lineListSchema(20, 160),
    scope_time_start: nullableDateOnly.default(null),
    scope_time_end: nullableDateOnly.default(null),
    out_of_scope: nullableText(2000),
    current_assessment: nullableText(10000),
    assessment_confidence: nullableConfidence.default(null),
    tags: tagsSchema,
    closed_at: nullableDateTime.default(null),
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

export const createInvestigationSchema = projectSchema.superRefine(
  (value, context) => {
    if (!value.research_question || value.research_question.length < 10) {
      context.addIssue({
        code: "custom",
        path: ["research_question"],
        message: "Primary intelligence question must be at least 10 characters.",
      });
    }
    if (!value.purpose || value.purpose.length < 5) {
      context.addIssue({
        code: "custom",
        path: ["purpose"],
        message: "Purpose must be at least 5 characters.",
      });
    }
  },
);

export type ProjectInput = z.infer<typeof projectSchema>;
export type Project = ProjectInput & {
  id: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

export function parseProjectForm(formData: FormData) {
  const input = {
    name: formData.get("name"),
    research_question: formData.get("research_question") ?? "",
    purpose: formData.get("purpose") ?? "",
    description: formData.get("description") ?? "",
    research_type: formData.get("research_type") ?? "CTI",
    priority: formData.get("priority") ?? "MEDIUM",
    investigation_status: formData.get("investigation_status") ?? "DRAFT",
    intended_consumer: formData.get("intended_consumer") ?? "",
    decision_context: formData.get("decision_context") ?? "",
    expected_product_type: formData.get("expected_product_type") ?? "",
    due_at: formData.get("due_at") ?? "",
    scope_geography: formData.get("scope_geography") ?? "",
    scope_sectors: formData.get("scope_sectors") ?? "",
    scope_activity_types: formData.get("scope_activity_types") ?? "",
    scope_actors: formData.get("scope_actors") ?? "",
    scope_technologies: formData.get("scope_technologies") ?? "",
    scope_time_start: formData.get("scope_time_start") ?? "",
    scope_time_end: formData.get("scope_time_end") ?? "",
    out_of_scope: formData.get("out_of_scope") ?? "",
    current_assessment: formData.get("current_assessment") ?? "",
    assessment_confidence: formData.get("assessment_confidence") ?? "",
    tags: formData.get("tags") ?? "",
    closed_at: formData.get("closed_at") ?? "",
  };
  const mode = String(formData.get("_form_mode") ?? "edit");
  return mode === "create"
    ? createInvestigationSchema.safeParse(input)
    : projectSchema.safeParse(input);
}

export function formatProjectDateInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function formatLineList(value: string[] | null | undefined) {
  return value?.join("\n") ?? "";
}
