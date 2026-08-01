import {z} from "zod";
const bounded=(n:number)=>z.string().max(n).nullable().optional();
export const threatFoxItemSchema=z.object({id:z.union([z.string(),z.number()]).transform(String).refine(v=>v.length>0&&v.length<=100),ioc:z.string().min(1).max(8000),ioc_type:z.string().min(1).max(100),ioc_type_desc:bounded(500),threat_type:bounded(500),threat_type_desc:bounded(500),malware:bounded(500),malware_printable:bounded(500),malware_alias:bounded(1000),malware_malpedia:bounded(4096),confidence_level:z.union([z.number(),z.string()]).nullable().optional(),first_seen:z.string().max(100),last_seen:bounded(100),reporter:bounded(500),reference:bounded(4096),tags:z.array(z.string().max(100)).max(200).nullable().optional()}).passthrough();
export const lookbackSchema=z.number().int().min(1).max(7);
