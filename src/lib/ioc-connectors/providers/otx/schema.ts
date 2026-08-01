import {z} from "zod";
const text=(n:number)=>z.string().max(n);
const providerDate=text(100).refine(value=>{const parsed=new Date(value);return !Number.isNaN(parsed.valueOf())},"date");
export const otxIndicatorSchema=z.object({id:z.union([text(200),z.number().transform(String)]).optional(),indicator:text(8000),type:text(100),created:text(100).nullable().optional(),modified:text(100).nullable().optional(),is_active:z.boolean().optional(),active:z.boolean().optional()}).passthrough();
export const pulseIdentitySchema=z.object({id:z.string().regex(/^[0-9a-f]{24}$/),created:providerDate.nullable().optional(),modified:providerDate,indicators:z.array(z.unknown()).max(100000)});
export const pulseContextObjectSchema=z.object({id:text(200).optional(),name:text(200).optional(),display_name:text(200).optional(),username:text(200).optional()});
export const envelopeSchema=z.object({results:z.array(z.unknown()).max(250),next:z.string().max(8192).nullable(),previous:z.string().max(8192).nullable().optional(),count:z.number().int().nonnegative()}).passthrough();
