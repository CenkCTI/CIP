import { z } from "zod";

export const clusterStatuses = [
  "DRAFT",
  "ASSESSED",
  "INACTIVE",
  "ARCHIVED",
] as const;
export const activeClusterStatuses = ["DRAFT", "ASSESSED", "INACTIVE"] as const;
export const confidenceLevels = ["LOW", "MEDIUM", "HIGH"] as const;
export const memberStatuses = [
  "POSSIBLE",
  "CONFIRMED",
  "REJECTED",
  "REMOVED",
] as const;
export const indicatorRoles = [
  "PHISHING",
  "CREDENTIAL_HARVESTING",
  "REDIRECTOR",
  "PAYLOAD_DELIVERY",
  "COMMAND_AND_CONTROL",
  "STAGING",
  "EXFILTRATION",
  "MALWARE_HOSTING",
  "SCANNING",
  "INFRASTRUCTURE_SUPPORT",
  "UNKNOWN",
] as const;

const optionalDate = z
  .string()
  .trim()
  .refine((value) => !value || !Number.isNaN(Date.parse(value)), "Invalid date.")
  .transform((value) => (value ? new Date(value).toISOString() : null));

export const clusterSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().max(10_000).default(""),
    status: z.enum(activeClusterStatuses),
    confidence: z.enum(confidenceLevels),
    technical_purpose: z.string().max(10_000).default(""),
    current_assessment: z.string().max(20_000).default(""),
    operational_relevance: z.string().max(20_000).default(""),
    first_observed_at: optionalDate,
    last_observed_at: optionalDate,
  })
  .refine(
    (value) =>
      !value.first_observed_at ||
      !value.last_observed_at ||
      value.first_observed_at <= value.last_observed_at,
    { message: "First observed must not be later than last observed." },
  )
  .refine(
    (value) =>
      value.status !== "ASSESSED" || value.current_assessment.trim().length > 0,
    { message: "Assessed clusters require a current assessment." },
  );

export const memberSchema = z
  .object({
    indicator_id: z.string().uuid(),
    status: z.enum(memberStatuses),
    role: z.enum(indicatorRoles),
    confidence: z.enum(confidenceLevels),
    rationale: z.string().trim().min(1).max(10_000),
    first_observed_at: optionalDate,
    last_observed_at: optionalDate,
  })
  .refine(
    (value) =>
      !value.first_observed_at ||
      !value.last_observed_at ||
      value.first_observed_at <= value.last_observed_at,
    { message: "First observed must not be later than last observed." },
  );

export const supportSchema = z.object({
  cluster_member_id: z
    .string()
    .uuid()
    .or(z.literal(""))
    .transform((value) => value || null),
  kind: z.enum(["source", "evidence", "enrichment"]),
  target_id: z.string().uuid(),
  note: z.string().max(5_000),
});

export type InfrastructureActionResult = {
  error?: string;
  success?: string;
};

export function objectFromForm(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export function label(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
