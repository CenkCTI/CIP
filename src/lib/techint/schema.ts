import { z } from "zod";
import {
  indicatorTypes,
  normalizeIndicatorValue,
  validateIndicator,
  type IndicatorType,
} from "@/lib/cti/indicators";

export const intelProfileKinds = ["STANDALONE", "INVESTIGATION"] as const;
export const intelProfileStatuses = ["ACTIVE", "PAUSED", "ARCHIVED"] as const;
export const intelProfilePriorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const intelProfileItemOrigins = ["EXPLICIT", "DERIVED", "SUGGESTED"] as const;
export const intelProfileItemStates = ["PENDING", "ACTIVE", "EXCLUDED", "REMOVED"] as const;
export const intelProfileItemKinds = [
  "THREAT_ACTOR",
  "MALWARE",
  "CAMPAIGN",
  "CVE",
  "INDICATOR",
  "INFRASTRUCTURE",
  "ATTACK_TECHNIQUE",
  "VENDOR",
  "PRODUCT",
  "SECTOR",
  "COUNTRY",
  "REGION",
  "TAG",
  "KEYWORD",
] as const;
export const intelProfileSemanticRoles = [
  "TARGET",
  "AFFECTED_REGION",
  "INFRASTRUCTURE_LOCATION",
  "ACTOR_ASSOCIATION",
  "STRATEGIC_CONTEXT",
  "GENERAL_CONTEXT",
] as const;
export const techIntIndicatorTypes = ["IP", "CIDR", "DOMAIN", "URL", "HASH", "EMAIL"] as const;

export const idSchema = z.string().uuid();
export const profileDefinitionSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).default(""),
  intelligence_question: z.string().trim().max(2000).default(""),
  priority: z.enum(intelProfilePriorities).default("MEDIUM"),
  time_horizon_days: z.coerce.number().int().min(1).max(730).default(90),
  minimum_confidence: z
    .preprocess((value) => (value === "" || value == null ? null : value), z.coerce.number().int().min(0).max(100).nullable())
    .default(null),
  relationship_depth: z.coerce.number().int().min(0).max(3).default(1),
});
export const itemInputSchema = z
  .object({
    profileId: idSchema,
    kind: z.enum(intelProfileItemKinds),
    displayValue: z.string().trim().min(1).max(300),
    semanticRole: z.enum(intelProfileSemanticRoles).optional().nullable(),
    indicatorType: z.enum(techIntIndicatorTypes).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "INDICATOR") {
      if (!value.indicatorType) {
        ctx.addIssue({ code: "custom", path: ["indicatorType"], message: "Indicator subtype is required." });
        return;
      }
      const error = validateIndicator(value.displayValue, value.indicatorType);
      if (error) ctx.addIssue({ code: "custom", path: ["displayValue"], message: error });
    }
  });

export function normalizeTechIntItem(kind: string, value: string, indicatorType?: IndicatorType | string | null) {
  const trimmed = value.trim();
  if (kind === "CVE") return trimmed.toUpperCase().replace(/^CVE(\d)/, "CVE-$1");
  if (kind === "INDICATOR") {
    if (!indicatorType) throw new Error("Indicator subtype is required.");
    const error = validateIndicator(trimmed, indicatorType);
    if (error) throw new Error(error);
    return normalizeIndicatorValue(trimmed, indicatorType);
  }
  return trimmed.toLowerCase().replace(/\s+/g, " ");
}
export function profileLocalKey(kind: string, normalized: string, role?: string | null) {
  return `${kind.toLowerCase()}:${(role ?? "").toLowerCase()}:${normalized}`;
}
export type IntelProfile = {
  id: string;
  owner_id: string;
  kind: "STANDALONE" | "INVESTIGATION";
  project_id: string | null;
  name: string;
  description: string;
  intelligence_question: string;
  priority: (typeof intelProfilePriorities)[number];
  status: (typeof intelProfileStatuses)[number];
  time_horizon_days: number;
  minimum_confidence: number | null;
  relationship_depth: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  item_count?: number;
  active_count?: number;
  pending_count?: number;
  projects?: { name: string } | null;
};
export type IntelProfileItem = {
  id: string;
  profile_id: string;
  kind: (typeof intelProfileItemKinds)[number];
  display_value: string;
  normalized_value: string;
  origin: (typeof intelProfileItemOrigins)[number];
  state: (typeof intelProfileItemStates)[number];
  semantic_role: (typeof intelProfileSemanticRoles)[number] | null;
  indicator_type: (typeof indicatorTypes)[number] | null;
  source_project_id: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  created_at: string;
  updated_at: string;
  removed_at: string | null;
};
