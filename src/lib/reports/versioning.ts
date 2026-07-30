import { z } from "zod";

export const productTypes = ["TECHNICAL_NOTE","IOC_BRIEF","INFRASTRUCTURE_ASSESSMENT","CAMPAIGN_ASSESSMENT","ATTRIBUTION_ASSESSMENT","OPERATIONAL_INTELLIGENCE_REPORT","INCIDENT_UPDATE","OTHER"] as const;
export const lifecycleStatuses = ["DRAFT","IN_REVIEW","APPROVED","PUBLISHED","SUPERSEDED","ARCHIVED"] as const;
export const createVersionSchema = z.object({
  changeSummary:z.string().trim().min(1).max(2000), executiveSummary:z.string().trim().min(1).max(20000),
  keyJudgments:z.string().trim().min(1).max(20000), confidence:z.string().trim().min(1).max(100),
  intelligenceGaps:z.string().trim().min(1).max(20000), recommendations:z.string().trim().min(1).max(20000),
}).strict();
export const metadataSchema=z.object({productType:z.enum(productTypes),lifecycleStatus:z.enum(lifecycleStatuses)}).strict();
export const idSchema=z.string().uuid();
export const attributionDisclaimer="Attribution remains an analytical judgement based on the information available when this version was created; it is not proof of responsibility.";

