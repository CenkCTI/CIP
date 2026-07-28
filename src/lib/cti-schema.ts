import { z } from "zod";

import {
  indicatorTypes,
  normalizeIndicatorValue,
  validateIndicator,
} from "@/lib/cti/indicators";

export { indicatorTypes, normalizeIndicatorValue, validateIndicator };

export const confidenceLevels = ["LOW", "MEDIUM", "HIGH"] as const;
export const indicatorStatuses = [
  "UNVERIFIED",
  "SUSPICIOUS",
  "MALICIOUS",
  "BENIGN",
  "FALSE_POSITIVE",
  "INACTIVE",
  "EXPIRED",
] as const;
export const cveSeverities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const exploitStatuses = [
  "NONE",
  "POC",
  "WEAPONIZED",
  "ACTIVE_EXPLOITATION",
] as const;
export const ctiTabs = [
  "actors",
  "campaigns",
  "indicators",
  "malware",
  "cves",
  "mitre",
] as const;
export const entityTables = {
  actors: "threat_actors",
  campaigns: "campaigns",
  indicators: "indicators",
  malware: "malware",
  cves: "cves",
  mitre: "mitre_techniques",
} as const;

const csv = z
  .preprocess(
    (value) =>
      typeof value === "string"
        ? value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : value,
    z.array(z.string().trim().min(1).max(300)).max(50),
  )
  .default([]);
const dateNull = z
  .preprocess(normalizeDateInput, z.union([z.string(), z.null()]).optional())
  .refine(validDateOrNull, "Use a valid date/time value.")
  .transform((value) => value || null);
const text = (max = 20000) => z.string().trim().max(max).default("");
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || null);

export const relKeys = [
  "threat_actor_ids",
  "campaign_ids",
  "indicator_ids",
  "malware_ids",
  "cve_ids",
  "mitre_technique_ids",
] as const;
export const relSchema = z.object(
  Object.fromEntries(relKeys.map((key) => [key, csv])) as Record<
    (typeof relKeys)[number],
    typeof csv
  >,
);

export type RelationshipSelections = Record<(typeof relKeys)[number], string[]>;
export function parseRelationshipSelections(
  formData: FormData,
):
  | { success: true; data: RelationshipSelections }
  | { success: false; error: string } {
  const out = Object.fromEntries(
    relKeys.map((key) => [key, [] as string[]]),
  ) as RelationshipSelections;
  for (const key of relKeys) {
    const seen = new Set<string>();
    for (const raw of formData.getAll(key)) {
      const value = String(raw).trim();
      if (!value) continue;
      const parsed = z.string().uuid().safeParse(value);
      if (!parsed.success) {
        return {
          success: false,
          error: `${key.replaceAll("_", " ")} contains an invalid ID.`,
        };
      }
      if (!seen.has(parsed.data)) {
        seen.add(parsed.data);
        out[key].push(parsed.data);
      }
    }
  }
  return { success: true, data: out };
}

function normalizeDateInput(value: unknown) {
  if (value === "" || value == null) return null;
  if (typeof value !== "string") return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
function validDateOrNull(value: unknown) {
  return (
    value === null ||
    (typeof value === "string" && !Number.isNaN(new Date(value).getTime()))
  );
}
const supportedHashLengths: Record<string, number> = {
  md5: 32,
  sha1: 40,
  sha256: 64,
};
function validateHashObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, raw]) => {
    const expected = supportedHashLengths[key.toLowerCase()];
    return (
      expected !== undefined &&
      typeof raw === "string" &&
      new RegExp(`^[a-fA-F0-9]{${expected}}$`).test(raw)
    );
  });
}
const indicatorValue = z.string().trim().min(1);

export const actorSchema = z.object({
  name: z.string().trim().min(1).max(180),
  aliases: csv,
  country: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  motivations: csv,
  description: text(),
  known_ttps: text(),
  references: csv,
});
export const campaignSchema = z
  .object({
    name: z.string().trim().min(1).max(180),
    description: text(),
    start_date: dateNull,
    end_date: dateNull,
    targets: csv,
  })
  .refine(
    (value) =>
      !value.start_date ||
      !value.end_date ||
      value.end_date >= value.start_date,
    { message: "End date must be on or after start date." },
  );
export const indicatorSchema = z
  .object({
    value: indicatorValue,
    type: z.enum(indicatorTypes),
    confidence: z.enum(confidenceLevels),
    status: z.enum(indicatorStatuses).default("UNVERIFIED"),
    source: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || null),
    tags: csv,
    first_seen: dateNull,
    last_seen: dateNull,
    analyst_rationale: nullableText(5000),
    current_relevance: nullableText(2000),
  })
  .superRefine((value, context) => {
    const error = validateIndicator(value.value, value.type);
    if (error) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: error,
      });
    }
    if (
      value.first_seen &&
      value.last_seen &&
      value.last_seen < value.first_seen
    ) {
      context.addIssue({
        code: "custom",
        path: ["last_seen"],
        message: "Last seen must be after first seen.",
      });
    }
  })
  .transform((value) => ({
    ...value,
    value:
      value.type === "HASH"
        ? value.value.trim().toLowerCase()
        : normalizeIndicatorValue(value.value, value.type),
  }));
export const malwareSchema = z.object({
  name: z.string().trim().min(1).max(180),
  family: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  hashes: z
    .string()
    .trim()
    .optional()
    .transform((value, context) => {
      if (!value) return {};
      try {
        const parsed: unknown = JSON.parse(value);
        if (!validateHashObject(parsed)) {
          context.addIssue({
            code: "custom",
            message:
              "Hashes must be a JSON object with md5, sha1, or sha256 hex string values.",
          });
          return z.NEVER;
        }
        return Object.fromEntries(
          Object.entries(parsed as Record<string, string>).map(
            ([key, item]) => [key.toLowerCase(), String(item).toLowerCase()],
          ),
        );
      } catch {
        context.addIssue({ code: "custom", message: "Hashes must be valid JSON." });
        return z.NEVER;
      }
    }),
  description: text(),
  behavior: text(),
});
export const cveSchema = z.object({
  cve_id: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^CVE-[0-9]{4}-[0-9]{4,}$/,
      "Use a valid CVE ID such as CVE-2024-12345.",
    ),
  severity: z.enum(cveSeverities),
  description: text(),
  affected_product: z.string().trim().max(300).default(""),
  exploit_status: z.enum(exploitStatuses),
  references: csv,
});
export const mitreSchema = z.object({
  technique_id: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^T[0-9]{4}(\.[0-9]{3})?$/,
      "Use a MITRE technique ID such as T1059 or T1059.001.",
    ),
  technique_name: z.string().trim().min(1).max(240),
  tactic: z.string().trim().min(1).max(120),
  description: text(),
});
export const schemas = {
  actors: actorSchema,
  campaigns: campaignSchema,
  indicators: indicatorSchema,
  malware: malwareSchema,
  cves: cveSchema,
  mitre: mitreSchema,
};
export function formObj(formData: FormData) {
  return Object.fromEntries(formData.entries());
}
export const ctiModuleLabels = {
  actors: "Threat Actor",
  campaigns: "Campaign",
  indicators: "Indicator",
  malware: "Malware",
  cves: "CVE",
  mitre: "MITRE Technique",
} as const;
export function ctiRecordTitle(row: Record<string, unknown>) {
  return String(
    row.name ?? row.value ?? row.cve_id ?? row.technique_id ?? "CTI record",
  );
}
export function ctiDetailPath(
  projectId: string,
  tab: keyof typeof entityTables,
  id: string,
) {
  return `/projects/${projectId}/${tab}/${id}`;
}
export function buildRelationshipRpcPayload(
  tab: keyof typeof entityTables,
  selections: Record<string, string[]>,
) {
  return {
    p_entity_type: tab,
    p_threat_actor_ids: selections.threat_actor_ids ?? [],
    p_campaign_ids: selections.campaign_ids ?? [],
    p_indicator_ids: selections.indicator_ids ?? [],
    p_malware_ids: selections.malware_ids ?? [],
    p_cve_ids: selections.cve_ids ?? [],
    p_mitre_technique_ids: selections.mitre_technique_ids ?? [],
  };
}
export function formatDateInput(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}
export function formatDateTimeLocalInput(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}
