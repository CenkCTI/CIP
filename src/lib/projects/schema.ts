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

const nullableDate = z
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
    "Use a valid closed date.",
  );

export const projectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Investigation title must be at least 2 characters.")
    .max(120),
  research_question: nullableText(2000),
  description: z.string().trim().max(2000).optional().default(""),
  research_type: z.enum(researchTypes),
  priority: z.enum(priorities),
  investigation_status: z.enum(investigationStatuses).default("DRAFT"),
  current_assessment: nullableText(10000),
  assessment_confidence: nullableConfidence.default(null),
  tags: tagsSchema,
  closed_at: nullableDate.default(null),
});

export const createInvestigationSchema = projectSchema.superRefine(
  (value, context) => {
    if (!value.research_question) {
      context.addIssue({
        code: "custom",
        path: ["research_question"],
        message: "Research question is required for a new Investigation.",
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
    description: formData.get("description") ?? "",
    research_type: formData.get("research_type"),
    priority: formData.get("priority"),
    investigation_status: formData.get("investigation_status") ?? "DRAFT",
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
