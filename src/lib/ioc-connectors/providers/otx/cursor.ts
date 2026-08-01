import {z} from "zod";
import {OtxError} from "./errors";
export const OTX_CURSOR_MAX_BYTES=1000, OTX_BOUNDARY_MAX=25;
const pulseId=z.string().regex(/^[0-9a-f]{24}$/);
const canonical=z.string().refine(v=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&new Date(v).toISOString()===v);
const schema=z.object({schema_version:z.literal(1),provider:z.literal("ALIENVAULT_OTX"),last_modified:canonical,pulse_ids_at_boundary:z.array(pulseId).max(OTX_BOUNDARY_MAX)}).strict().superRefine((v,c)=>{const sorted=[...v.pulse_ids_at_boundary].sort();if(new Set(v.pulse_ids_at_boundary).size!==v.pulse_ids_at_boundary.length||sorted.some((x,i)=>x!==v.pulse_ids_at_boundary[i]))c.addIssue({code:"custom",message:"boundary"})});
export type OtxCursor=z.infer<typeof schema>;
const invalid=():never=>{throw new OtxError("OTX_CURSOR_INVALID")};
export function parseOtxCursor(value:string|null):OtxCursor|null{if(value===null)return null;if(Buffer.byteLength(value)>OTX_CURSOR_MAX_BYTES)invalid();try{const p=schema.safeParse(JSON.parse(value));if(p.success)return p.data}catch{}return invalid()}
export function serializeOtxCursor(last_modified:string,ids:string[]){const value=schema.safeParse({schema_version:1,provider:"ALIENVAULT_OTX",last_modified,pulse_ids_at_boundary:[...ids].sort()});if(!value.success)return invalid();return JSON.stringify(value.data)}
export function isPulseEligible(modified:string,id:string,cursor:OtxCursor|null){return !cursor||modified>cursor.last_modified||(modified===cursor.last_modified&&!cursor.pulse_ids_at_boundary.includes(id))}
