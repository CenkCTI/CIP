import {z} from "zod";
import {requireOwnedProject} from "@/lib/projects/ownership";
import {readJsonLimited,noStore,validateOrigin} from "@/lib/ai/byok/security";
import {CopilotMemoryError,readInvestigationMemory,updateInvestigationNotes,clearInvestigationTurns} from "@/lib/ai/stage3/investigation-memory";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const ids=z.object({sourceId:z.string().uuid(),assetId:z.string().uuid()}).strict();
function fail(error:unknown){
  const code=error instanceof CopilotMemoryError?"memory_unavailable":
    error instanceof z.ZodError?"invalid_request":"request_failed";
  return noStore({code,error:code==="memory_unavailable"?
    "Investigation memory is unavailable. Apply the memory migration before using this feature.":
    "Memory request failed."},{status:code==="invalid_request"?400:503});
}
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const url=new URL(req.url);
    const input=ids.parse({sourceId:url.searchParams.get("sourceId"),assetId:url.searchParams.get("assetId")});
    const owned=await requireOwnedProject((await params).id);
    const memory=await readInvestigationMemory(owned,input.sourceId,input.assetId);
    return noStore({notes:memory.notes,turns:memory.turns.slice(0,25).reverse()});
  }catch(error){return fail(error);}
}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    validateOrigin(req);
    const input=ids.extend({notes:z.string().max(4000)}).parse(await readJsonLimited(req,6000));
    const owned=await requireOwnedProject((await params).id);
    await updateInvestigationNotes(owned,input.sourceId,input.assetId,input.notes);
    return noStore({saved:true});
  }catch(error){return fail(error);}
}
export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    validateOrigin(req);
    const input=ids.parse(await readJsonLimited(req,2000));
    const owned=await requireOwnedProject((await params).id);
    await clearInvestigationTurns(owned,input.sourceId,input.assetId);
    return noStore({cleared:true});
  }catch(error){return fail(error);}
}
