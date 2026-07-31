import {z} from "zod";

export const idSchema=z.string().uuid();
export const intervalSchema=z.coerce.number().int().refine(v=>[15,30,60,360,1440].includes(v),"Choose a supported interval.");
export const feedInputSchema=z.object({name:z.string().trim().min(1).max(240),description:z.string().max(10000).default(""),url:z.string().trim().max(4096).optional(),enabled:z.boolean(),schedulerEnabled:z.boolean(),interval:intervalSchema});
export const triageSchema=z.object({itemId:idSchema,action:z.enum(["read","unread","save","unsave","dismiss","restore"])});
export const linkSchema=z.object({itemId:idSchema,projectId:idSchema,note:z.string().max(2000)});
export const filterSchema=z.object({mode:z.enum(["all","unread","saved","dismissed"]).default("all"),q:z.string().trim().max(200).default(""),source:z.union([idSchema,z.literal("")]).default(""),from:z.union([z.string().date(),z.literal("")]).default(""),to:z.union([z.string().date(),z.literal("")]).default(""),cursor:z.string().max(500).default("")}).refine(v=>!v.from||!v.to||v.from<=v.to,{message:"Invalid date range."});
export function decodeCursor(value:string){if(!value)return null;try{const parsed=JSON.parse(Buffer.from(value,"base64url").toString("utf8"));return z.object({timestamp:z.string().datetime({offset:true}),id:idSchema}).parse(parsed)}catch{return null}}
export function encodeCursor(timestamp:string,id:string){return Buffer.from(JSON.stringify({timestamp,id})).toString("base64url")}
