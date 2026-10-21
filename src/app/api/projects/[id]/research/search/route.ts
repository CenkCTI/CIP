import {validateOrigin,readJsonLimited,noStore} from "@/lib/ai/byok/security";
import {requireOwnedProject} from "@/lib/projects/ownership";
import {researchSearchRequestSchema} from "@/lib/ai/research/types";
import {getResearchProvider} from "@/lib/ai/research/provider";
import {withResearchQuota,researchError} from "@/lib/ai/research/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    validateOrigin(req);
    // This endpoint is called ONLY by the analyst's Search selected action.
    const input=researchSearchRequestSchema.parse(await readJsonLimited(req,4096));
    const owned=await requireOwnedProject((await params).id);
    const provider=getResearchProvider();
    // Authenticated, atomic cost gate also protects the configured search provider.
    const results=await withResearchQuota(owned,input.queries.join(" ").length,async()=>{
      const batches=await Promise.all(input.queries.map(query=>provider.search(query)));
      const seen=new Set<string>();
      return batches.flat().filter(item=>{
        if(seen.has(item.url))return false;
        seen.add(item.url);return true;
      }).slice(0,15);
    });
    return noStore({results,queries:input.queries,
      notice:"External search results are not intelligence records. Review before collecting."});
  }catch(e){return researchError(e);}
}
