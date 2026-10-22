import {z} from "zod";
import {byokChat} from "@/lib/ai/byok/client";
import {validateOrigin,readJsonLimited,noStore} from "@/lib/ai/byok/security";
import {requireOwnedProject} from "@/lib/projects/ownership";
import {stage3RequestSchema} from "@/lib/ai/stage3/schemas";
import {createStage3ReadContext,loadStage3DocumentContext} from "@/lib/ai/stage3/context";
import {selectMemoryHints,readInvestigationMemory,readProjectMemoryTurns,saveInvestigationTurn,CopilotMemoryError} from "@/lib/ai/stage3/investigation-memory";
import {runAnalystReasoning} from "@/lib/ai/stage3/analyst-reasoning";
import {ensureIndexedOriginalPDF,retrieveOwnedEvidence,readProjectMemoryEvents,eventMemoryHints,
  saveInvestigationEvent} from "@/lib/ai/stage3/indexed-investigation-memory";
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
  selectedUrls:z.array(z.string().url().max(2048)).max(2).default([]),
  byokConsent:z.literal(true),
}).strict().refine(v=>!v.webResearch||v.selectedUrls.length>0,{
  message:"Select at least one web search result before researching.",
  path:["selectedUrls"],
}).refine(v=>v.webResearch||v.selectedUrls.length===0,{
  message:"Web sources require explicit research consent.",path:["webResearch"],
});
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
    const [memory,projectTurns,events]=await Promise.all([
      readInvestigationMemory(owned,input.sourceId,input.assetId),
      readProjectMemoryTurns(owned),
      readProjectMemoryEvents(owned),
    ]);
    // The current original is indexed once; subsequent questions retrieve the
    // relevant page excerpts without re-parsing the PDF. Indexing failures
    // never cause fabricated evidence; fallback uses the original PDF reader.
    let indexedCurrent=false;
    if(input.useSource){
      try{
        const indexed=await ensureIndexedOriginalPDF(owned,input.sourceId,input.assetId,reader);
        indexedCurrent=indexed.cached||indexed.chunks>0;
      }catch{indexedCurrent=false;}
    }
    let indexedSpans:Awaited<ReturnType<typeof retrieveOwnedEvidence>>=[];
    if(input.useSource){
      try{indexedSpans=await retrieveOwnedEvidence(owned,input.question,events);}
      catch{indexedSpans=[];}
    }
    // The active page is a fallback for newly uploaded or non-indexable PDFs.
    // With indexed evidence, preserve current-page context only when user
    // explicitly chose a smaller scope, and never silently send an entire PDF.
    const includePage=input.useSource && (!indexedSpans.length||
      input.context.kind==="annotation"||input.context.kind==="page_range");
    const pageSpans=includePage?(await loadStage3DocumentContext(reader,{
      sourceId:input.sourceId,assetId:input.assetId,context:input.context,
      mode:"ask",question:input.question,byokConsent:true,
    })).spans:[];
    const spans=[...pageSpans,...indexedSpans].slice(0,16);
    const history=selectMemoryHints(projectTurns,input.question);
    const eventHistory=eventMemoryHints(events,input.question);
    const language=input.responseLanguage==="auto"?
      (/[çğıöşü]/i.test(input.question)||/\b(neden|nasıl|amacı|hipotez|analiz)\b/i.test(input.question)?"tr":"en"):
      input.responseLanguage;
    const reservedChars=JSON.stringify({question:input.question,spans,history,eventHistory,notes:memory.notes}).length+
      (input.webResearch?8000:0);
    const result=await withResearchQuota(owned,reservedChars,async()=>{
      let pages:Awaited<ReturnType<typeof loadSelectedComparisonPages>>["pages"]=[];
      let researchWarning="";
      if(input.webResearch){
        // Only explicitly selected results from the in-chat search stage are read.
        // No automatic hidden Brave searches, and no PDF or notes sent to Brave.
        const loaded=await loadSelectedComparisonPages([...new Set(input.selectedUrls)]);
        pages=loaded.pages;
        if(loaded.skippedSources.length)
          researchWarning="Some selected web pages were unreadable; they were not treated as evidence.";
      }
      const analysis=await runAnalystReasoning({
        question:input.question,language,notes:memory.notes,history,eventHistory,spans,webPages:pages,
      },messages=>byokChat("nvidia_nim",credential.model,credential.apiKey,messages,"generation"));
      if(researchWarning)analysis.warnings.push(researchWarning);
      if(input.webResearch&&!pages.length)
        analysis.warnings.push("Web research did not provide readable evidence. Analysis is based only on PDF or general model knowledge.");
      return analysis;
    });
    // If memory persistence fails, do not silently claim a conversation was saved.
    await saveInvestigationTurn(owned,input.sourceId,input.assetId,input.question,
      {context:input.context,useSource:input.useSource,webResearch:input.webResearch},result,input.webResearch);
    let unifiedSaved=true;
    try{
      await saveInvestigationEvent(owned,{kind:input.webResearch?"WEB_RESEARCH":"ASSESSMENT",
        sourceId:input.sourceId,assetId:input.assetId,question:input.question,
        result:result as unknown as Record<string,unknown>,
        context:{selected:input.context,indexedCurrent,sourceCount:indexedSpans.length}});
    }catch{unifiedSaved=false;}
    return noStore({result,saved:true,unifiedSaved,
      notice:unifiedSaved?"Verified source references and provisional analysis are indexed in investigation history.":
        "Chat was saved but the unified investigation timeline is temporarily unavailable."});
  }catch(error){
    if(error instanceof CopilotMemoryError)return noStore({
      code:"memory_unavailable",error:"Investigation memory unavailable. Apply migration 064 before using Analyst chat."
    },{status:503});
    return researchError(error);
  }
}
