import {z} from "zod";
import {requireOwnedProject} from "@/lib/projects/ownership";
import {readJsonLimited,validateOrigin,noStore} from "@/lib/ai/byok/security";
import {embedOwnedChunkBatch} from "@/lib/ai/stage3/local-embedding-index";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const schema=z.object({
 sourceId:z.string().uuid(),assetId:z.string().uuid(),
 approveLocalEmbedding:z.literal(true),
 offset:z.number().int().min(0).max(1500).default(0),
}).strict();

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  validateOrigin(req);
  const input=schema.parse(await readJsonLimited(req,2500));
  const owned=await requireOwnedProject((await params).id);
  const result=await embedOwnedChunkBatch(
   owned,input.sourceId,input.assetId,input.offset);
  return noStore(result);
 }catch(error){
  if(error instanceof z.ZodError)return noStore({
   code:"invalid_request",error:"Invalid semantic indexing request."},{status:400});
  if(error instanceof Error&&error.message==="bad_origin")return noStore({
   code:"bad_origin",error:"Invalid request origin."},{status:403});
  if(error instanceof Error&&error.message==="Investigation not found")
    return noStore({code:"not_found",error:"Investigation not found."},{status:404});
  return noStore({code:"semantic_index_unavailable",
   error:"Local semantic indexing unavailable or source not verified."},{status:503});
 }
}
