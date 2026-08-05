import { z } from "zod";
import { candidateTypes, providerSkipReasons } from "./types";

const uuidOrEmpty = z.union([z.string().uuid(), z.literal("")]).default("");
export const iocInboxSchema = z.object({
  view: z.literal("iocs"),
  ioc_q: z.string().trim().max(200).default(""),
  ioc_status: z.enum(["NEW", "REVIEWED", "ACCEPTED", "DISMISSED", "EXPIRED", ""]).default(""),
  ioc_type: z.enum([...candidateTypes, ""]).default(""),
  ioc_provider: uuidOrEmpty,
  ioc_sort: z.enum(["last", "first", "confidence"]).default("last"),
  ioc_min_confidence: z.union([z.coerce.number().int().min(0).max(100), z.literal("")]).default(""),
  ioc_max_confidence: z.union([z.coerce.number().int().min(0).max(100), z.literal("")]).default(""),
  ioc_port: z.enum(["", "present", "absent"]).default(""),
  ioc_project: uuidOrEmpty,
  ioc_cursor: z.string().max(1000).default(""),
}).refine((value) => value.ioc_min_confidence === "" || value.ioc_max_confidence === "" || value.ioc_min_confidence <= value.ioc_max_confidence, "Invalid confidence range.");
export type IocInboxFilters = z.infer<typeof iocInboxSchema>;

const cursorSchema = z.object({ sort: z.enum(["last", "first", "confidence"]), value: z.union([z.string().datetime({ offset: true }), z.number().int()]), id: z.string().uuid() });
export type IocCursor = z.infer<typeof cursorSchema>;
export function encodeIocCursor(cursor: IocCursor) { return Buffer.from(JSON.stringify(cursor)).toString("base64url"); }
export function decodeIocCursor(value: string): IocCursor | null {
  if (!value) return null;
  try { return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8"))); } catch { return null; }
}
export function inboxQuery(filters: IocInboxFilters, cursor = "") {
  const values = { ...filters, ioc_cursor: cursor };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== "") params.set(key, String(value));
  return `/osint?${params.toString()}`;
}

export const normalizedCandidateSchema = z.object({
  provider_item_id: z.string().min(1).max(500), candidate_type: z.enum(candidateTypes), normalized_value: z.string().min(1).max(8000), original_value: z.string().min(1).max(8000), network_port: z.number().int().min(1).max(65535).nullable(), provider_reference_url: z.string().url().max(4096).refine(value => value.startsWith("http://") || value.startsWith("https://")).nullable(), threat_type: z.string().max(500).nullable(), malware_family: z.string().max(500).nullable(), confidence_score: z.number().int().min(0).max(100).nullable(), first_seen_at: z.string().datetime({ offset: true }).nullable(), last_seen_at: z.string().datetime({ offset: true }).nullable(), tags: z.array(z.string().max(100)).max(50), metadata: z.record(z.string(), z.unknown()), source_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const diagnosticCount=z.number().int().min(0).max(10_000_000);
const adapterDiagnosticsSchema = z.object({ received_count:diagnosticCount,eligible_count:z.number().int().min(0).max(1000),already_seen_count:diagnosticCount,deferred_count:diagnosticCount.default(0),has_more:z.boolean().default(false),mapped_count:z.number().int().min(0).max(1000),mapping_skipped_count:z.number().int().min(0).max(1000),skip_reason_counts:z.partialRecord(z.enum(providerSkipReasons),z.number().int().min(1).max(1000)),pulse_context_fields_dropped:z.partialRecord(z.enum(["name","description","author","tlp","tags","references","adversary","targeted_countries","industries","malware_families","attack_ids"]),diagnosticCount).default({}),pulse_context_items_dropped:diagnosticCount.default(0),invalid_identity_pulse_count:diagnosticCount.default(0)}).strict().superRefine((d,ctx)=>{if(d.received_count!==d.already_seen_count+d.eligible_count+d.deferred_count)ctx.addIssue({code:"custom",message:"Inconsistent received count."});if(d.eligible_count!==d.mapped_count+d.mapping_skipped_count)ctx.addIssue({code:"custom",message:"Inconsistent eligible count."});if(Object.values(d.skip_reason_counts).reduce((a,b)=>a+(b??0),0)!==d.mapping_skipped_count)ctx.addIssue({code:"custom",message:"Inconsistent skip reasons."});if(d.has_more!== (d.deferred_count>0))ctx.addIssue({code:"custom",message:"Inconsistent deferred state."})});
const succeededResult=z.object({status:z.literal("SUCCEEDED"),items:z.array(z.union([normalizedCandidateSchema,z.object({provider_skip_reason:z.enum(providerSkipReasons)}).strict()])).max(1000),nextCursor:z.string().max(1000).optional(),diagnostics:adapterDiagnosticsSchema}).strict();
const notModifiedResult=z.object({status:z.literal("NOT_MODIFIED"),items:z.tuple([]),nextCursor:z.string().max(1000).optional(),diagnostics:adapterDiagnosticsSchema.refine(d=>d.eligible_count===0&&d.deferred_count===0&&!d.has_more&&d.mapped_count===0&&d.mapping_skipped_count===0,"Modified diagnostics for NOT_MODIFIED.")}).strict();
export const adapterResultSchema=z.discriminatedUnion("status",[succeededResult,notModifiedResult]).superRefine((result,ctx)=>{if(result.diagnostics.has_more&&(!result.nextCursor||result.status!=="SUCCEEDED"))ctx.addIssue({code:"custom",message:"Continuation cursor required."})});
