import { createHash } from "node:crypto";
import type { NormalizedResearchItem } from "./parser";
export const sha256=(value:string)=>createHash("sha256").update(value).digest("hex");
export function itemFingerprints(item:NormalizedResearchItem){return{url:item.canonicalUrl?sha256(item.canonicalUrl):null,content:sha256([item.title??"",item.summaryText??"",item.contentText??""].map(x=>x.replace(/\s+/g," ").trim().toLowerCase()).join("\n"))};}
