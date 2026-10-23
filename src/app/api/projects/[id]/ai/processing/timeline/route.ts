import {requireOwnedProject} from "@/lib/projects/ownership";
import {noStore} from "@/lib/ai/byok/security";
import {readProjectMemoryEvents} from "@/lib/ai/stage3/indexed-investigation-memory";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const owned=await requireOwnedProject((await params).id);
    // Source-bound IDs and timestamps; no PDF binaries, provider keys or unverified
    // model text are promoted to verified intelligence-domain entries.
    const events=await readProjectMemoryEvents(owned,25);
    return noStore({events});
  }catch{
    return noStore({code:"timeline_unavailable",
      error:"Investigation history is unavailable. Check migration 066."},{status:503});
  }
}
