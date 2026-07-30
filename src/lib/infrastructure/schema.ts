import { z } from "zod";
export const clusterStatuses=["DRAFT","ASSESSED","INACTIVE","ARCHIVED"] as const;
export const confidenceLevels=["LOW","MEDIUM","HIGH"] as const;
export const memberStatuses=["POSSIBLE","CONFIRMED","REJECTED","REMOVED"] as const;
export const indicatorRoles=["PHISHING","CREDENTIAL_HARVESTING","REDIRECTOR","PAYLOAD_DELIVERY","COMMAND_AND_CONTROL","STAGING","EXFILTRATION","MALWARE_HOSTING","SCANNING","INFRASTRUCTURE_SUPPORT","UNKNOWN"] as const;
const optionalDate=z.string().trim().transform(v=>v?new Date(v).toISOString():null);
export const clusterSchema=z.object({name:z.string().trim().min(1).max(160),description:z.string().max(10000).default(""),status:z.enum(clusterStatuses),confidence:z.enum(confidenceLevels),technical_purpose:z.string().max(10000).default(""),current_assessment:z.string().max(20000).default(""),operational_relevance:z.string().max(20000).default(""),first_observed_at:optionalDate,last_observed_at:optionalDate}).refine(v=>!v.first_observed_at||!v.last_observed_at||v.first_observed_at<=v.last_observed_at,{message:"First observed must not be later than last observed."}).refine(v=>v.status!=="ASSESSED"||v.current_assessment.trim().length>0,{message:"Assessed clusters require a current assessment."});
export const memberSchema=z.object({indicator_id:z.string().uuid(),status:z.enum(memberStatuses),role:z.enum(indicatorRoles),confidence:z.enum(confidenceLevels),rationale:z.string().trim().min(1).max(10000),first_observed_at:optionalDate,last_observed_at:optionalDate}).refine(v=>!v.first_observed_at||!v.last_observed_at||v.first_observed_at<=v.last_observed_at,{message:"First observed must not be later than last observed."});
export const supportSchema=z.object({cluster_member_id:z.string().uuid().or(z.literal("")).transform(v=>v||null),kind:z.enum(["source","evidence","enrichment"]),target_id:z.string().uuid(),note:z.string().max(5000)});
export function objectFromForm(fd:FormData){return Object.fromEntries(fd.entries());}
export const label=(value:string)=>value.toLowerCase().replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
