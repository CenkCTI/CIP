import {z} from "zod";
import {byokChat} from "@/lib/ai/byok/client";
import {validateOrigin,readJsonLimited,noStore} from "@/lib/ai/byok/security";
import {requireOwnedProject} from "@/lib/projects/ownership";
import {stage3RequestSchema} from "@/lib/ai/stage3/schemas";
import {createStage3ReadContext,loadStage3DocumentContext} from "@/lib/ai/stage3/context";
import {selectMemoryHints,readInvestigationMemory,readProjectMemoryTurns,saveInvestigationTurn,CopilotMemoryError} from "@/lib/ai/stage3/investigation-memory";
import {runAnalystReasoning} from "@/lib/ai/stage3/analyst-reasoning";
import {ensureIndexedOriginalPDF,retrieveOwnedEvidence,readProjectMemoryEvents,readProjectAnalystNotes,eventMemoryHints,
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
    const [memory,projectTurns,events,projectNotes]=await Promise.all([
      readInvestigationMemory(owned,input.sourceId,input.assetId),
      readProjectMemoryTurns(owned),
      readProjectMemoryEvents(owned),
      readProjectAnalystNotes(owned),
    ]);
    // The current original is indexed once; subsequent questions retrieve the
    // relevant page excerpts without re-parsing the PDF. Indexing failures
    // never cause fabricated evidence; fallback uses the original PDF reader.
    let indexedCurrent=false;
    let indexReason:string|null=null;
    if(input.useSource){
      try{
        const indexed=await ensureIndexedOriginalPDF(owned,input.sourceId,input.assetId,reader);
        indexedCurrent=Boolean(indexed.cached||indexed.chunks>0);
        if(indexed.processing)indexReason="INDEX_PROCESSING";
      }catch(error){
        indexedCurrent=false;
        indexReason=error instanceof Error?error.message:"INDEX_UNAVAILABLE";
      }
    }
    let indexedSpans:Awaited<ReturnType<typeof retrieveOwnedEvidence>>=[];
    if(input.useSource){
      try{indexedSpans=await retrieveOwnedEvidence(owned,input.question,events,12,
        {sourceId:input.sourceId,assetId:input.assetId,ready:indexedCurrent});}
      catch{indexedSpans=[];indexReason??="RETRIEVAL_UNAVAILABLE";}
    }
    // The active page is a fallback for newly uploaded or non-indexable PDFs.
    // With indexed evidence, preserve current-page context only when user
    // explicitly chose a smaller scope, and never silently send an entire PDF.
    // Do not relabel a 45k-character legacy document cap as full-document RAG.
    // A failed entire-document index must not silently become page-one evidence.
    const includePage=input.useSource && input.context.kind!=="document" &&
      (!indexedSpans.length||input.context.kind==="annotation"||
       input.context.kind==="pages"||input.context.kind==="page");
    const pageSpans=includePage?(await loadStage3DocumentContext(reader,{
      sourceId:input.sourceId,assetId:input.assetId,context:input.context,
      mode:"ask",question:input.question,byokConsent:true,
    })).spans:[];
    const spans=[...pageSpans,...indexedSpans].slice(0,16);
    const history=selectMemoryHints(projectTurns,input.question);
    const eventHistory=eventMemoryHints(events,input.question);
    const investigationNotes=[memory.notes,...projectNotes.filter(item=>
      item.source_id!==input.sourceId).map(item=>"Other source "+item.source_id.slice(0,8)+": "+item.notes)]
      .filter(Boolean).join("\n").slice(0,4000);
    const language=input.responseLanguage==="auto"?
      (/[çğıöşü]/i.test(input.question)||/\b(neden|nasıl|amacı|hipotez|analiz)\b/i.test(input.question)?"tr":"en"):
      input.responseLanguage;
    const reservedChars=JSON.stringify({question:input.question,spans,history,eventHistory,notes:investigationNotes}).length+
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
        question:input.question,language,notes:investigationNotes,history,eventHistory,spans,webPages:pages,
      },messages=>byokChat("nvidia_nim",credential.model,credential.apiKey,messages,"generation"));
      if(researchWarning)analysis.warnings.push(researchWarning);
      if(input.useSource&&!indexedCurrent)
        analysis.warnings.push("INDEX_UNAVAILABLE: Current PDF could not be fully indexed ("+
          (indexReason??"NO_READY_INDEX")+"). Results, if any, may come from other indexed sources.");
      if(input.useSource&&!indexedSpans.length&&pageSpans.length)
        analysis.warnings.push("FALLBACK_CURRENT_PAGE: Only the selected original page/range is available; this is not Entire PDF analysis.");
      if(input.useSource&&input.context.kind==="document"&&!indexedSpans.length)
        analysis.warnings.push("INSUFFICIENT_RETRIEVAL: Entire PDF evidence is unavailable. No page was silently substituted.");
      if(input.useSource&&indexedSpans.length)
        analysis.warnings.push("LEXICAL_ONLY: Indexed passages were found by keyword matching, not multilingual semantic search.");
      if(spans.some(span=>span.kind==="PDF"&&/[\uE000-\uF8FF\uFFFD]/u.test(span.text)))
        analysis.warnings.push("PDF_GLYPH_INTEGRITY_WARNING: PDF extraction contains unmapped glyphs. Dates, CVEs and names must be checked against the original rendered page.");
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
        context:{selected:input.context,indexedCurrent,sourceCount:indexedSpans.length,indexReason}});
    }catch{unifiedSaved=false;}
    return noStore({result,saved:true,unifiedSaved,
      retrieval:{status:!input.useSource?"DISABLED":indexedSpans.length?"LEXICAL_ONLY":
        pageSpans.length?"FALLBACK_CURRENT_PAGE":"INDEX_UNAVAILABLE",
        indexReason,entireDocumentAvailable:indexedCurrent&&indexedSpans.length>0,
        returnedPassages:indexedSpans.length},
      notice:unifiedSaved?"Verified source references and provisional analysis are indexed in investigation history.":
        "Chat was saved but the unified investigation timeline is temporarily unavailable."});
  }catch(error){
    if(error instanceof CopilotMemoryError)return noStore({
      code:"memory_unavailable",error:"Investigation memory unavailable. Apply migration 064 before using Analyst chat."
    },{status:503});
    return researchError(error);
  }
}
