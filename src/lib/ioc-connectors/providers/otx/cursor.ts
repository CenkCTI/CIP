import {z} from "zod";import {OtxError} from "./errors";
export const OTX_CURSOR_MAX_BYTES=1000,OTX_BOUNDARY_MAX=25,OTX_PROCESSED_MAX=10_000_000;
const pulseId=z.string().regex(/^[0-9a-f]{24}$/),itemKey=z.string().regex(/^[0-9a-f]{64}$/),canonical=z.string().refine(v=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&new Date(v).toISOString()===v);
const committed=z.object({last_modified:canonical,pulse_ids_at_boundary:z.array(pulseId).max(OTX_BOUNDARY_MAX)}).strict().superRefine((v,c)=>{const sorted=[...v.pulse_ids_at_boundary].sort();if(new Set(v.pulse_ids_at_boundary).size!==v.pulse_ids_at_boundary.length||sorted.some((x,i)=>x!==v.pulse_ids_at_boundary[i]))c.addIssue({code:"custom",message:"boundary"})});
const resume=z.object({pulse_modified:canonical,pulse_id:pulseId,item_key:itemKey}).strict();
const continuation=z.object({mode:z.enum(["BOOTSTRAP","INCREMENTAL"]),scope:z.enum(["LEGACY_BULK","SEARCH_PULSE"]).optional(),pulse_id:pulseId.optional(),window_start:canonical,window_end:canonical,resume_after:resume,processed_count:z.number().int().min(1).max(OTX_PROCESSED_MAX)}).strict().refine(v=>v.window_start<=v.window_end&&v.resume_after.pulse_modified>=v.window_start&&v.resume_after.pulse_modified<=v.window_end&&(((v.scope??"LEGACY_BULK")==="SEARCH_PULSE")===!!v.pulse_id),"window");
const v2=z.object({schema_version:z.literal(2),provider:z.literal("ALIENVAULT_OTX"),committed:committed.nullable(),continuation:continuation.nullable()}).strict();
const v1=z.object({schema_version:z.literal(1),provider:z.literal("ALIENVAULT_OTX"),last_modified:canonical,pulse_ids_at_boundary:z.array(pulseId).max(OTX_BOUNDARY_MAX)}).strict();
export type OtxCommitted=z.infer<typeof committed>;export type OtxContinuation=z.infer<typeof continuation>;export type OtxCursor=z.infer<typeof v2>;
const invalid=():never=>{throw new OtxError("OTX_CURSOR_INVALID")};
export function parseOtxCursor(value:string|null):OtxCursor|null{if(value===null)return null;if(Buffer.byteLength(value)>OTX_CURSOR_MAX_BYTES)invalid();try{const raw=JSON.parse(value),current=v2.safeParse(raw);if(current.success)return current.data;const legacy=v1.safeParse(raw);if(legacy.success){const c=committed.safeParse({last_modified:legacy.data.last_modified,pulse_ids_at_boundary:legacy.data.pulse_ids_at_boundary});if(c.success)return{schema_version:2,provider:"ALIENVAULT_OTX",committed:c.data,continuation:null}}}catch{}return invalid()}
export function serializeOtxState(value:{committed:OtxCommitted|null;continuation:OtxContinuation|null}){const parsed=v2.safeParse({schema_version:2,provider:"ALIENVAULT_OTX",...value});if(!parsed.success)return invalid();const result=JSON.stringify(parsed.data);if(Buffer.byteLength(result)>OTX_CURSOR_MAX_BYTES)invalid();return result}
export function serializeOtxCursor(last_modified:string,ids:string[]){return serializeOtxState({committed:{last_modified,pulse_ids_at_boundary:[...ids].sort()},continuation:null})}
export function isPulseEligible(modified:string,id:string,cursor:OtxCursor|null){const c=cursor?.committed;return !c||modified>c.last_modified||(modified===c.last_modified&&!c.pulse_ids_at_boundary.includes(id))}
export function hasActiveOtxContinuation(value:string|null){return parseOtxCursor(value)?.continuation!==null}

export function otxContinuationScope(value:string|null){return parseOtxCursor(value)?.continuation?.scope??null}
