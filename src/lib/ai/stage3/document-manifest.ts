import { createHash } from "node:crypto";
import { z } from "zod";

export const documentSelectionSchema=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("document")}).strict(),
  z.object({kind:z.literal("pages"),pageStart:z.number().int().min(1).max(10000),
    pageEnd:z.number().int().min(1).max(10000)}).strict()
    .refine(x=>x.pageEnd>=x.pageStart && x.pageEnd-x.pageStart<20,"Select at most 20 pages."),
]);
export type DocumentSelection=z.infer<typeof documentSelectionSchema>;
export const documentInputSchema=z.object({
  sourceId:z.string().uuid(),assetId:z.string().uuid(),selection:documentSelectionSchema,
}).strict();
export const documentChunkInputSchema=documentInputSchema.extend({
  chunkId:z.string().regex(/^[a-f0-9]{40}$/),fingerprint:z.string().regex(/^[a-f0-9]{24}$/),
  byokConsent:z.literal(true),
}).strict();
export const DOCUMENT_PLAN_VERSION="phase4-document-v1";
const intEnv=(name:string,defaultValue:number,min:number,max:number)=>{
  const value=Number(process.env[name]);return Number.isInteger(value)?Math.min(max,Math.max(min,value)):defaultValue;
};
export const documentLimits=()=>({
  chunkChars:intEnv("AI_STAGE3_CHUNK_CHARS",8000,6000,8000),
  overlap:intEnv("AI_STAGE3_CHUNK_OVERLAP",400,0,400),
  maxChunks:intEnv("AI_STAGE3_MAX_DOCUMENT_CHUNKS",24,1,24),
  maxCandidates:intEnv("AI_STAGE3_MAX_CANDIDATES",150,1,150),
  maxSelectedPages:intEnv("AI_STAGE3_MAX_SELECTED_PAGES",20,1,20),
  concurrency:intEnv("AI_STAGE3_DOCUMENT_CONCURRENCY",2,1,2),
});
export type PageText={page:number;text:string};
export type DocumentChunk={chunkId:string;ordinal:number;pageStart:number;pageEnd:number;chars:number;pieces:PageText[]};
export type ScanManifest={
  scanVersion:typeof DOCUMENT_PLAN_VERSION;fingerprint:string;pageCount:number;
  chunks:Omit<DocumentChunk,"pieces">[];limits:ReturnType<typeof documentLimits>;
};
export class DocumentScanError extends Error {
  constructor(public code:"document_chunk_limit"|"document_empty",public requiredChunks?:number){
    super(code);
  }
}
const hash=(value:Uint8Array|string)=>createHash("sha256").update(value).digest("hex");

export function buildDocumentPlan(pages:PageText[],assetSha256:string){
  const limits=documentLimits();
  if(!/^[a-f0-9]{64}$/.test(assetSha256))throw new Error("invalid_asset_hash");
  if(!pages.length)throw new DocumentScanError("document_empty");
  const pieces:PageText[][]=[];
  let current:PageText[]=[];let chars=0;
  const flush=()=>{if(current.length){pieces.push(current);current=[];chars=0;}};
  for(const page of pages){
    const text=page.text.replace(/[ \t]+/g," ").trim();
    if(!text)throw new DocumentScanError("document_empty");
    if(text.length<=limits.chunkChars){
      if(chars+text.length>limits.chunkChars)flush();
      current.push({page:page.page,text});chars+=text.length;
      continue;
    }
    flush();
    const stride=limits.chunkChars-limits.overlap;
    for(let start=0;start<text.length;start+=stride){
      const portion=text.slice(start,start+limits.chunkChars);
      pieces.push([{page:page.page,text:portion}]);
      if(start+limits.chunkChars>=text.length)break;
    }
  }
  flush();
  if(pieces.length>limits.maxChunks)throw new DocumentScanError("document_chunk_limit",pieces.length);
  const fingerprint=hash(DOCUMENT_PLAN_VERSION+":"+assetSha256).slice(0,24);
  const chunks:DocumentChunk[]=pieces.map((part,i)=>{
    const ordinal=i+1;
    const pageStart=part[0].page,pageEnd=part[part.length-1].page;
    const chars=part.reduce((n,p)=>n+p.text.length,0);
    return {chunkId:hash(JSON.stringify({fingerprint,ordinal,part})).slice(0,40),
      ordinal,pageStart,pageEnd,chars,pieces:part};
  });
  const manifest:ScanManifest={scanVersion:DOCUMENT_PLAN_VERSION,fingerprint,
    pageCount:pages.length,chunks:chunks.map(({pieces:_pieces,...safe})=>safe),limits};
  return {manifest,chunks};
}
