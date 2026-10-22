import {z} from "zod";
import {byokChat} from "@/lib/ai/byok/client";
import {validateOrigin,readJsonLimited,noStore} from "@/lib/ai/byok/security";
import {requireOwnedProject} from "@/lib/projects/ownership";
import {stage3RequestSchema} from "@/lib/ai/stage3/schemas";
import {createStage3ReadContext,loadStage3DocumentContext} from "@/lib/ai/stage3/context";
import {selectMemoryHints,readInvestigationMemory,saveInvestigationTurn,CopilotMemoryError} from "@/lib/ai/stage3/investigation-memory";
import {runAnalystReasoning} from "@/lib/ai/stage3/analyst-reasoning";
import {getResearchProvider} from "@/lib/ai/research/provider";
import {loadSelectedComparisonPages} from "@/lib/ai/research/comparison-fetch";
import {requireResearchByok,withResearchQuota,researchError} from "@/lib/ai/research/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const inputSchema=z.object({
  sourceId:z.string().uuid(),assetId:z.string().uuid(),
  context:stage3RequestSchema.shape.context,
  question:z.string().trim().min(1).max(1500),
  responseLanguage:z.enum(["auto","tr","en"]).default("auto"),
  useSource:z.boolean().default(true),
  webResearch:z.boolean().default(false),
  byokConsent:z.literal(true),
}).strict();
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    validateOrigin(req);
    const input=inputSchema.parse(await readJsonLimited(req,6000));
    const owned=await requireOwnedProject((await params).id);
    const credential=await requireResearchByok(owned);
    const reader=createStage3ReadContext(owned);
    // Independently validate the owned source and asset even when PDF context is off.
    await reader.readSource(input.sourceId);
    const asset=await reader.readAsset(input.sourceId,input.assetId);
    if(asset.state!=="READY"||asset.asset_role!=="ORIGINAL")return noStore({
      code:"unsupported_asset",error:"An owned ready original PDF is required."},{status:422});
    const memory=await readInvestigationMemory(owned,input.sourceId,input.assetId);
    const spans=input.useSource?(await loadStage3DocumentContext(reader,{
      sourceId:input.sourceId,assetId:input.assetId,context:input.context,
      mode:"ask",question:input.question,byokConsent:true,
    })).spans:[];
    const history=selectMemoryHints(memory.turns,input.question);
    const language=input.responseLanguage==="auto"?
      (/[çğıöşü]/i.test(input.question)||/\b(neden|nasıl|amacı|hipotez|analiz)\b/i.test(input.question)?"tr":"en"):
      input.responseLanguage;
    const reservedChars=JSON.stringify({question:input.question,spans,history,notes:memory.notes}).length+
      (input.webResearch?8000:0);
    const result=await withResearchQuota(owned,reservedChars,async()=>{
      let pages:Awaited<ReturnType<typeof loadSelectedComparisonPages>>["pages"]=[];
      let researchWarning="";
      if(input.webResearch){
        // Search is explicitly permitted by the UI checkbox for THIS message.
        // Never send private PDF text or stored conversations to Brave; query only analyst text.
        const query=input.question.trim().slice(0,180);
        const hits=await getResearchProvider().search(query.length>=5?query:query+" cyber intelligence");
        const selection=hits.slice(0,2);
        if(selection.length){
          const loaded=await loadSelectedComparisonPages(selection.map(x=>x.url));
          pages=loaded.pages;
          if(loaded.skippedSources.length)
            researchWarning="Some externally discovered pages were unreadable; they were not treated as evidence.";
        }else researchWarning="No web search results were returned.";
      }
      const analysis=await runAnalystReasoning({
        question:input.question,language,notes:memory.notes,history,spans,webPages:pages,
      },messages=>byokChat("nvidia_nim",credential.model,credential.apiKey,messages,"generation"));
      if(researchWarning)analysis.warnings.push(researchWarning);
      if(input.webResearch&&!pages.length)
        analysis.warnings.push("Web research did not provide readable evidence. Analysis is based only on PDF or general model knowledge.");
      return analysis;
    });
    // If memory persistence fails, do not silently claim a conversation was saved.
    await saveInvestigationTurn(owned,input.sourceId,input.assetId,input.question,
      {context:input.context,useSource:input.useSource},result,input.webResearch);
    return noStore({result,saved:true,notice:"Analysis is provisional. Memory is not a verified evidence source; only analyst-approved actions write intelligence records."});
  }catch(error){
    if(error instanceof CopilotMemoryError)return noStore({
      code:"memory_unavailable",error:"Investigation memory unavailable. Apply migration 064 before using Analyst chat."
    },{status:503});
    return researchError(error);
  }
}
