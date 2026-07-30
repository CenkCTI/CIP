import { z } from "zod";
import { normalizeFeedUrl } from "./url";
const safeUrl=z.string().trim().min(1).max(4096).superRefine((v,c)=>{try{normalizeFeedUrl(v);}catch{c.addIssue({code:"custom",message:"Use a permitted public HTTP or HTTPS feed URL."});}});
export const feedFormSchema=z.object({name:z.string().trim().min(1).max(240),description:z.string().trim().max(10000).default(""),configured_url:safeUrl,enabled:z.boolean()}).strict();
export const idsSchema=z.object({projectId:z.string().uuid(),feedId:z.string().uuid()}).strict();
