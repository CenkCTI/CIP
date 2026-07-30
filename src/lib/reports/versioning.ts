import { z } from "zod";

export const productTypes = ["TECHNICAL_NOTE","IOC_BRIEF","INFRASTRUCTURE_ASSESSMENT","CAMPAIGN_ASSESSMENT","ATTRIBUTION_ASSESSMENT","OPERATIONAL_INTELLIGENCE_REPORT","INCIDENT_UPDATE","OTHER"] as const;
export const lifecycleStatuses = ["DRAFT","IN_REVIEW","APPROVED","ARCHIVED"] as const;
export const referenceTypes = ["SOURCE","EVIDENCE","INDICATOR","ENRICHMENT_RESULT","INFRASTRUCTURE_CLUSTER","TIMELINE_EVENT","CAMPAIGN","THREAT_ACTOR","MALWARE","CVE","MITRE_TECHNIQUE","ATTRIBUTION_HYPOTHESIS","ATTRIBUTION_ASSESSMENT"] as const;
export const createVersionSchema = z.object({
  changeSummary:z.string().trim().min(1).max(2000), executiveSummary:z.string().trim().min(1).max(20000),
  keyJudgments:z.string().trim().min(1).max(20000), confidence:z.string().trim().min(1).max(100),
  intelligenceGaps:z.string().trim().min(1).max(20000), recommendations:z.string().trim().min(1).max(20000),
}).strict();
export const metadataSchema=z.object({productType:z.enum(productTypes),lifecycleStatus:z.enum(lifecycleStatuses)}).strict();
export const idSchema=z.string().uuid();
export const referenceInputSchema=z.object({referenceType:z.enum(referenceTypes),targetId:idSchema}).strict();
export const attributionDisclaimer="Attribution remains an analytical judgement based on the information available when this version was created; it is not proof of responsibility.";
export type ChangeAwareness="UNCHANGED"|"CURRENT_RECORD_UPDATED_AFTER_VERSION"|"CURRENT_RECORD_ARCHIVED"|"CURRENT_RECORD_UNAVAILABLE"|"NEW_DRAFT_REFERENCE"|"REMOVED_FROM_CURRENT_DRAFT";
export function compareReference(snapshot:{source_updated_at?:unknown}|undefined,current:{updated_at?:unknown;created_at?:unknown;archived_at?:unknown}|undefined):ChangeAwareness {if(!snapshot)return "NEW_DRAFT_REFERENCE";if(!current)return "CURRENT_RECORD_UNAVAILABLE";if(current.archived_at)return "CURRENT_RECORD_ARCHIVED";return new Date(String(current.updated_at??current.created_at)).getTime()>new Date(String(snapshot.source_updated_at)).getTime()?"CURRENT_RECORD_UPDATED_AFTER_VERSION":"UNCHANGED";}
