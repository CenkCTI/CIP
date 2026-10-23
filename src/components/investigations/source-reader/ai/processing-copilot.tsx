"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ByokConnectionPanel } from "@/components/ai/byok-connection-panel";
import { CopilotChat, type CopilotResult, type CopilotTurn } from "./copilot-chat";
import { CopilotContextSelector, contextTitle, type CopilotContext } from "./copilot-context-selector";
import { useCopilotWindow } from "./use-copilot-window";
import { CopilotCandidates } from "./copilot-candidates";
import type { Stage3Candidate, Stage3CandidateResponse } from "@/lib/ai/stage3/candidates";
import { dividePdfBatch, planPdfBatches, type PdfBatch } from "@/lib/ai/stage3/document-batches";
import { useDocumentExtraction, type ScanSelection } from "./use-document-extraction";
import { DocumentProcessingReview } from "./document-processing-review";
import { CopilotResearchConversation, type ResearchSession } from "./copilot-research-conversation";

type ByokStatus = {
  enabled?: boolean; connected?: boolean; state?: string;
  providerId?: string; provider?: string; model?: string;
};

/** Legacy connect responses provide provider name without a providerId. */
export function isNvidiaByokConnection(status: ByokStatus | null): boolean {
  return Boolean(status?.connected && (status.providerId === "nvidia_nim" ||
    (!status.providerId && status.provider === "NVIDIA NIM")));
}
const SAFE_ERRORS: Record<string,string> = {
  byok_required:"Connect NVIDIA NIM to use the Copilot.",
  byok_expired:"Your NVIDIA session expired. Reconnect to continue.",
  unsupported_provider:"The Copilot requires an NVIDIA NIM BYOK connection.",
  unsupported_asset:"Only ready original PDFs are supported.",
  pdf_text_unavailable:"No extractable text found. OCR is not enabled.",
  context_too_large:"This page contains too much text for one safe request. Even the smallest chunk cannot fit.",
  pdf_document_too_large:"The PDF needs multi-part processing. Select Entire PDF to process it in batches.",
  pdf_too_large:"PDF file is over the server's 50 MB limit. Compress or split the source PDF before processing.",
  pdf_page_out_of_range:"The selected PDF page does not exist.",
  rate_limited:"CİTEM's hourly AI quota is full (separate from NVIDIA). Keep this page open and retry Continue Entire PDF after earlier requests leave the rolling 60-minute window.",
  quota_unavailable:"CİTEM could not reach its usage reservation gate. This is a server/database configuration issue, not an NVIDIA rate limit.",
  provider_rate_limited:"NVIDIA has rate-limited this request.",
  nvidia_output_exhausted:"The model reached its output limit. Try a narrower question.",
  malformed_output:"NVIDIA returned invalid source-grounded JSON twice. CİTEM automatically narrows Entire PDF batches; if a single page still fails, choose that page or a different NVIDIA model. Failed pages remain unread.",
  analysis_incomplete:"NVIDIA produced missing or partly unsupported source evidence. CİTEM did not count these pages as analysed. Try Continue Entire PDF to retry smaller batches.",
  analysis_language_mismatch:"NVIDIA did not follow your selected response language. CİTEM will retry on fewer pages; if one page still fails, try another model.",
  invalid_request:"Choose a valid context and question.",
  bad_origin:"Request rejected due to origin validation.",
  request_failed:"CİTEM could not complete processing. Check the diagnostic code below.",
  provider_error:"NVIDIA rejected the generation request. Try a different allowlisted model or a smaller PDF selection.",
  byok_unavailable:"NVIDIA BYOK is not configured on the server.",
  provider_unreachable:"CİTEM could not reach NVIDIA.",
  timeout:"NVIDIA request timed out; try again.",
  stage3_not_found:"The selected source or PDF asset was not found.",
  pdf_invalid:"The selected PDF cannot be processed.",
  pdf_runtime_unavailable:"The server cannot load the PDF extraction engine. Check deployment dependencies.",
};

export function copilotContextKey(context: CopilotContext): string {
  if (context.kind === "document") return "document";
  if (context.kind === "annotation") return `annotation:${context.annotationId}`;
  if (context.kind === "page") return `page:${context.page}`;
  return `pages:${context.pageStart}-${context.pageEnd}`;
}

export function validCopilotContext(value: CopilotContext, pageCount: number | null) {
  const max = pageCount ?? 10000;
  if (value.kind === "document") return true;
  if (value.kind === "annotation") return Boolean(value.annotationId);
  if (value.kind === "page") return Number.isInteger(value.page) && value.page >= 1 && value.page <= max;
  return Number.isInteger(value.pageStart) && Number.isInteger(value.pageEnd)
    && value.pageStart >= 1 && value.pageEnd <= max
    && value.pageStart <= value.pageEnd && value.pageEnd - value.pageStart < 10;
}

type LargeDocumentRun = {
  mode:"ask"|"analyse"|"extract";
  prompt:string;
  language:"auto"|"tr"|"en";
  sourceId:string;
  assetId:string;
  total:number;
  completed:number;
  queue:PdfBatch[];
  needsReview:{page:number;code:string}[];
};
type PdfProgress = {
  total:number;completed:number;
  needsReview:{page:number;code:string}[];
  status:"running"|"paused"|"needs_review"|"complete";
};
function pdfRunProgress(run:LargeDocumentRun,status:PdfProgress["status"]):PdfProgress {
  return {total:run.total,completed:run.completed,
    needsReview:[...run.needsReview],status};
}
const RETRYABLE_PAGE_CODES = new Set([
  "context_too_large","malformed_output","nvidia_output_exhausted",
  "analysis_incomplete","analysis_language_mismatch",
]);

export function ProcessingCopilot({
  projectId, sourceId, assetId, sourceTitle, selectedAnnotationId,
  activePage, pageCount, onClose, onNavigate, onReviewCandidate,
}: {
  projectId: string; sourceId: string; assetId: string; sourceTitle: string;
  selectedAnnotationId: string | null; activePage: number; pageCount: number | null;
  onClose: () => void;
  onNavigate: (page: number, annotationId?: string, quote?: string) => void;
  onReviewCandidate?: (candidate: Stage3Candidate) => void;
}) {
  const windowState = useCopilotWindow();
  const [byok, setByok] = useState<ByokStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [showConnection, setShowConnection] = useState(false);
  const [researchMode,setResearchMode]=useState(false);
  const [researchSessions,setResearchSessions]=useState<ResearchSession[]>([]);
  const researchCounter=useRef(0);
  const [context, setContext] = useState<CopilotContext>({kind:"document"});
  const [question, setQuestion] = useState("");
  const [analystChat,setAnalystChat]=useState(true);
  const [webResearch,setWebResearch]=useState(true);
  const [useSource,setUseSource]=useState(true);
  const [memoryNotes,setMemoryNotes]=useState("");
  const [memoryStatus,setMemoryStatus]=useState("");
  const [memoryReady,setMemoryReady]=useState(false);
  const [investigationEvents,setInvestigationEvents]=useState<{id:string;kind:string;summary:string;question:string;created_at:string;source_id:string|null;asset_id:string|null}[]>([]);
  const [indexStatus,setIndexStatus]=useState("");
  const [localEmbeddingApproved,setLocalEmbeddingApproved]=useState(false);
  const [semanticIndexing,setSemanticIndexing]=useState(false);
  const [semanticIndexOffset,setSemanticIndexOffset]=useState(0);
  const [semanticIndexStatus,setSemanticIndexStatus]=useState("");
  const [notesOpen,setNotesOpen]=useState(false);
  const [responseLanguage, setResponseLanguage] = useState<"auto" | "tr" | "en">("auto");
  const [turns, setTurns] = useState<CopilotTurn[]>([]);
  const [candidateResult, setCandidateResult] = useState<Stage3CandidateResponse|null>(null);
  const [dismissedCandidates, setDismissedCandidates] = useState<Set<string>>(()=>new Set());
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [diagnostic, setDiagnostic] = useState<{status:number;code:string;stage:string;sourceStep?:string}|null>(null);
  const inFlight = useRef<AbortController|null>(null);
  // Ephemeral browser-session state: failed or cancelled batches may be resumed.
  // Never store the original PDF, model key or source excerpts in browser storage.
  const documentRun = useRef<LargeDocumentRun|null>(null);
  const [pdfProgress, setPdfProgress] = useState<PdfProgress|null>(null);
  const documentScan=useDocumentExtraction(projectId,sourceId,assetId);
  const turnCounter = useRef(0);
  const mounted = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const r=await fetch("/api/ai/byok/status", {cache:"no-store"});
      if (!r.ok) throw new Error();
      const payload=await r.json() as ByokStatus;
      if (mounted.current) { setByok(payload); setStatusError(""); }
    } catch {
      if (mounted.current) { setByok({connected:false,state:"unavailable"}); setStatusError("Could not read NVIDIA connection status."); }
    }
  },[]);
  useEffect(() => {
    mounted.current=true;
    const timer=window.setTimeout(() => {void refreshStatus();},0);
    return () => {window.clearTimeout(timer);mounted.current=false; inFlight.current?.abort();};
  },[refreshStatus]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; },[turns,candidateResult]);
  useEffect(() => {
    const handler=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();};
    document.addEventListener("keydown",handler);
    return()=>document.removeEventListener("keydown",handler);
  },[onClose]);

  const effectiveContext = useMemo<CopilotContext>(() => {
    if (context.kind === "page") return {kind:"page",page:activePage};
    if (context.kind === "annotation" && selectedAnnotationId) return {kind:"annotation",annotationId:selectedAnnotationId};
    return context.kind === "annotation" ? {kind:"page",page:activePage} : context;
  },[context,activePage,selectedAnnotationId]);
  const onConnectionStatusChange = useCallback((next: ByokStatus) => { setByok(next); setStatusError(""); }, []);
  const connected = isNvidiaByokConnection(byok);
  const contextValid = validCopilotContext(effectiveContext,pageCount);
  const canProcess = connected && contextValid && !working && !documentScan.working;
  const canSend = canProcess && (!analystChat || memoryReady);
  const memoryUrl=`/api/projects/${projectId}/ai/processing/memory`;
  useEffect(()=>{
    if(!analystChat)return;
    const abort=new AbortController();
    async function load(){
      try{
        const query=new URLSearchParams({sourceId,assetId});
        const response=await fetch(memoryUrl+"?"+query,{cache:"no-store",signal:abort.signal});
        const body=await response.json() as {notes?:string;error?:string;
          turns?:{id:string;question:string;result:CopilotResult;context?:{context?:CopilotContext};created_at:string}[]};
        if(!response.ok)throw new Error(body.error||"Memory unavailable");
        if(abort.signal.aborted)return;
        setMemoryNotes(body.notes??"");
        setTurns((body.turns??[]).map((entry,index)=>({
          id:index+1,context:entry.context?.context??{kind:"page",page:activePage},
          prompt:entry.question,mode:"analyst",result:entry.result,
        })));
        turnCounter.current=(body.turns??[]).length;
        setMemoryReady(true);
        setMemoryStatus("Investigation memory loaded");
      }catch(error){
        if(!abort.signal.aborted){
          setMemoryReady(false);
          setMemoryStatus(error instanceof Error?error.message:"Memory unavailable");
        }
      }
    }
    void load();
    return()=>abort.abort();
  },[analystChat,projectId,sourceId,assetId,memoryUrl]);

  useEffect(()=>{
    if(!analystChat)return;
    const controller=new AbortController();
    void (async()=>{
      try{
        const response=await fetch("/api/projects/"+projectId+"/ai/processing/timeline",{
          cache:"no-store",signal:controller.signal,
        });
        if(!response.ok)return;
        const body=await response.json() as {events?:typeof investigationEvents};
        if(!controller.signal.aborted)setInvestigationEvents(body.events??[]);
      }catch{/* Timeline is supplemental; old chat must continue to work. */}
    })();
    return()=>controller.abort();
  },[analystChat,projectId,turns.length]);

  async function submit(mode:"ask"|"analyse"|"extract",prompt:string,resume=false) {
    if(!canProcess || (mode==="ask" && !prompt.trim())) {
      if(!connected)setError("Connect NVIDIA NIM before sending a message.");
      else if(!contextValid)setError("Select the entire PDF, a valid PDF page, a text annotation or 1–10 consecutive pages.");
      return;
    }
    const captured=effectiveContext;
    const active=resume?documentRun.current:null;
    if(resume && (!active || active.mode!==mode || active.prompt!==prompt ||
       active.sourceId!==sourceId || active.assetId!==assetId))return;
    if(!resume) {documentRun.current=null;setPdfProgress(null);}
    if(resume && active && !active.queue.length && active.needsReview.length){
      // Requeue only unresolved single pages on deliberate analyst retry.
      active.queue=active.needsReview.map(({page})=>({pageStart:page,pageEnd:page}));
      active.needsReview=[];
    }
    const history=turns
      .filter((turn)=>copilotContextKey(turn.context)===copilotContextKey(captured))
      .slice(-3)
      .map((turn)=>({user:turn.prompt.slice(0,500),assistant:turn.result.summary.slice(0,1000)}));
    setError("");
    setDiagnostic(null);
    setWorking(true);
    const abort=new AbortController();
    inFlight.current=abort;
    const language=active?.language ?? responseLanguage;

    async function requestPart(part:CopilotContext,withHistory:boolean):Promise<CopilotResult|Stage3CandidateResponse>{
      const response=await fetch(`/api/projects/${projectId}/ai/processing`, {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({sourceId,assetId,context:part,mode,
          ...(mode==="ask"?{question:prompt.trim().slice(0,1500)}:{}),
          ...(mode!=="extract" && withHistory && history.length?{history}:{}),
          ...(language!=="auto"?{responseLanguage:language}:{}),
          byokConsent:true}),
        signal:abort.signal,
        cache:"no-store",
      });
      let payload:{result?:CopilotResult|Stage3CandidateResponse;code?:string;error?:string;stage?:string;sourceStep?:string};
      try {payload=await response.json();}
      catch {
        setDiagnostic({status:response.status,code:"non_json_response",stage:"network"});
        throw new Error(`CİTEM returned a non-JSON response (HTTP ${response.status}).`);
      }
      if(!response.ok || !payload.result){
        const code=payload.code??"invalid_response";
        setDiagnostic({status:response.status,code,stage:payload.stage??"unknown",sourceStep:payload.sourceStep});
        if(code.startsWith("byok_"))void refreshStatus();
        const err=new Error(SAFE_ERRORS[code]??payload.error??"NVIDIA processing failed.");
        Object.assign(err,{code});
        throw err;
      }
      return payload.result;
    }
    function applyResult(result:CopilotResult|Stage3CandidateResponse,range?:PdfBatch){
      if(!mounted.current||abort.signal.aborted)return;
      if(mode==="extract"){
        if(!("candidates" in result))throw new Error("Invalid extraction response.");
        setCandidateResult((previous)=>{
          if(!range||!previous)return result;
          const ids=new Set(previous.candidates.map((item)=>item.candidateId));
          return {candidates:[...previous.candidates,...result.candidates.filter((item)=>!ids.has(item.candidateId))],
            discarded:previous.discarded+result.discarded,
            warnings:[...new Set([...previous.warnings,...result.warnings])]};
        });
        setDismissedCandidates(new Set());
      }else{
        if(!("summary" in result))throw new Error("Invalid answer response.");
        const label=range?` · PDF pages ${range.pageStart}–${range.pageEnd}`:"";
        setTurns((current)=>[...current,{
          id:++turnCounter.current,context:captured,mode,
          prompt:(mode==="analyse"?"Analyse selected source context":prompt.trim())+label,
          result,
        }]);
        setQuestion("");
      }
    }

    try{
      if(!resume){
        // Keep the existing single request for PDFs that fit the validated context.
        // Larger PDFs are never sampled or silently truncated.
        if(captured.kind!=="document" || (pageCount!==null && pageCount<=200)){
          try{
            const result=await requestPart(captured,true);
            applyResult(result);
            return;
          }catch(cause){
            const code=(cause as {code?:string}).code;
            if(captured.kind!=="document" ||
                (code!=="pdf_document_too_large" && code!=="context_too_large" &&
                 code!=="malformed_output" && code!=="nvidia_output_exhausted" &&
                 code!=="analysis_incomplete" && code!=="analysis_language_mismatch"))throw cause;
          }
        }
        if(captured.kind!=="document" || pageCount===null || pageCount<1){
          throw new Error("PDF page count is unavailable. Open the PDF viewer, then try Entire PDF again.");
        }
        const run:LargeDocumentRun={mode,prompt,language,sourceId,assetId,
          total:pageCount,completed:0,queue:planPdfBatches(pageCount),needsReview:[]};
        documentRun.current=run;
        if(mode==="extract"){setCandidateResult(null);setDismissedCandidates(new Set());}
      }
      const run=documentRun.current;
      if(!run)throw new Error("No document processing run is available.");
      setPdfProgress(pdfRunProgress(run,"running"));
      while(run.queue.length){
        if(abort.signal.aborted)break;
        const part=run.queue[0];
        let response:CopilotResult|Stage3CandidateResponse;
        try{
          response=await requestPart({kind:"pages",...part},false);
        }catch(cause){
          // A dense passage can exceed the input/output caps or produce invalid JSON.
          // Retry at smaller scope without claiming any failed page was processed.
          // Quota/network/auth errors are NOT splittable and must pause the run.
          const code=(cause as {code?:string}).code;
          if(typeof code==="string" && RETRYABLE_PAGE_CODES.has(code)){
            const halves=dividePdfBatch(part);
            if(halves){
              run.queue.splice(0,1,...halves);
              setDiagnostic(null);
              continue;
            }
            // A single page cannot be subdivided. Flag it, do not count it as
            // analysed, and continue other pages; only the analyst can retry.
            run.needsReview.push({page:part.pageStart,code});
            run.queue.shift();
            setDiagnostic(null);
            setPdfProgress(pdfRunProgress(run,"running"));
            continue;
          }
          throw cause;
        }
        if(abort.signal.aborted)break;
        applyResult(response,part);
        run.queue.shift();
        run.completed+=part.pageEnd-part.pageStart+1;
        setPdfProgress(pdfRunProgress(run,"running"));
      }
      if(!abort.signal.aborted && !run.queue.length){
        if(run.needsReview.length){
          // Attempts are exhausted but not every page has validated findings.
          setPdfProgress(pdfRunProgress(run,"needs_review"));
        }else{
          documentRun.current=null;
          setPdfProgress(pdfRunProgress(run,"complete"));
        }
      }else{
        setPdfProgress(pdfRunProgress(run,"paused"));
      }
    }catch(cause){
      if(documentRun.current){
        const run=documentRun.current;
        if(mounted.current)setPdfProgress(pdfRunProgress(run,"paused"));
      }
      if(!abort.signal.aborted && mounted.current){
        setError(cause instanceof Error?cause.message:"Processing request failed.");
      }
    }finally{
      if(mounted.current && inFlight.current===abort){
        inFlight.current=null;setWorking(false);
      }
    }
  }
  function startDocumentExtraction(){
    const target:ScanSelection=effectiveContext.kind==="pages"?
      {kind:"pages",pageStart:effectiveContext.pageStart,pageEnd:effectiveContext.pageEnd}:
      effectiveContext.kind==="page"?
        {kind:"pages",pageStart:effectiveContext.page,pageEnd:effectiveContext.page}:
        {kind:"document"};
    void documentScan.start(target);
  }
  async function askAnalyst(prompt:string){
    if(!canSend||!prompt.trim())return;
    setWorking(true);setError("");setDiagnostic(null);setMemoryStatus("");
    const abort=new AbortController();inFlight.current=abort;
    // Default quick chat uses the currently displayed PDF page, not a silent
    // whole-document sample. Explicit page-range selections remain respected.
    const selected:CopilotContext=effectiveContext.kind==="document"
      ?{kind:"page",page:activePage}:effectiveContext;
    try{
      const response=await fetch(`/api/projects/${projectId}/ai/processing/analyst-chat`,{
        method:"POST",headers:{"content-type":"application/json"},cache:"no-store",
        signal:abort.signal,
        body:JSON.stringify({sourceId,assetId,context:selected,
          question:prompt.trim().slice(0,1500),responseLanguage,
          useSource,webResearch:false,byokConsent:true}),
      });
      const data=await response.json() as {result?:CopilotResult;saved?:boolean;error?:string;code?:string};
      if(!response.ok||!data.result)throw new Error(data.error||data.code||"Analyst chat failed");
      if(abort.signal.aborted)return;
      setTurns(previous=>[...previous,{
        id:++turnCounter.current,context:selected,mode:"analyst" as const,
        prompt:prompt.trim(),result:data.result!,
      }]);
      setMemoryStatus(data.saved?"Conversation saved to this investigation":"Conversation not saved");
      setQuestion("");
    }catch(error){
      if(!abort.signal.aborted)setError(error instanceof Error?error.message:"Analyst chat failed");
    }finally{
      if(inFlight.current===abort){inFlight.current=null;setWorking(false);}
    }
  }
  async function prepareLocalSemanticIndex(){
    if(!localEmbeddingApproved||semanticIndexing)return;
    setSemanticIndexing(true);
    let cursor=semanticIndexOffset;
    try{
      for(let batch=0;batch<16;batch++){
        const response=await fetch("/api/projects/"+projectId+"/ai/processing/semantic-index",{
          method:"POST",headers:{"content-type":"application/json"},
          body:JSON.stringify({
            sourceId,assetId,approveLocalEmbedding:true,offset:cursor,
          }),
        });
        const body=await response.json() as {
          status?:string;processed?:number;nextOffset?:number|null;
          code?:string;error?:string;
        };
        if(!response.ok)throw new Error(body.code||body.error||"Semantic index unavailable");
        if(body.status==="COMPLETE"||body.nextOffset===null){
          setSemanticIndexOffset(0);
          setSemanticIndexStatus("Local semantic index complete for this PDF.");
          return;
        }
        if(!Number.isInteger(body.nextOffset)||body.nextOffset!<=cursor)
          throw new Error("Invalid semantic indexing cursor");
        cursor=body.nextOffset!;
        setSemanticIndexOffset(cursor);
        setSemanticIndexStatus(String(cursor)+" PDF chunks checked for local embeddings…");
      }
      setSemanticIndexStatus("Partial semantic index completed; press Continue to index remaining chunks.");
    }catch(error){
      setSemanticIndexStatus(error instanceof Error?error.message:"Semantic indexing failed");
    }finally{setSemanticIndexing(false);}
  }
  async function backfillPDFs(){
    setIndexStatus("Indexing existing PDF sources…");
    try{
      const response=await fetch("/api/projects/"+projectId+"/ai/processing/index",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({backfill:true}),
      });
      const body=await response.json() as {indexed?:unknown[];errors?:{reason?:string}[];error?:string};
      if(!response.ok)throw new Error(body.error||"Indexing unavailable");
      setIndexStatus(String(body.indexed?.length??0)+" PDF(s) checked; "+
        String(body.errors?.length??0)+" indexing errors. "+
        (body.errors?.some(e=>e.reason==="index_quality_review_required")
          ?"One or more PDFs require extraction review; no unsafe text was published. "
          :"")+
        "Repeat to index other PDFs.");
    }catch(err){setIndexStatus(err instanceof Error?err.message:"Indexing failed");}
  }
  async function saveNotes(){
    setMemoryStatus("");
    try{
      const response=await fetch(memoryUrl,{
        method:"PATCH",headers:{"content-type":"application/json"},
        body:JSON.stringify({sourceId,assetId,notes:memoryNotes}),
      });
      if(!response.ok)throw new Error("Notes were not saved");
      setMemoryStatus("Memory notes saved");
    }catch(error){setMemoryStatus(error instanceof Error?error.message:"Save failed");}
  }
  async function clearMemory(){
    setMemoryStatus("");
    try{
      const response=await fetch(memoryUrl,{
        method:"DELETE",headers:{"content-type":"application/json"},
        body:JSON.stringify({sourceId,assetId}),
      });
      if(!response.ok)throw new Error("Conversation was not cleared");
      setTurns([]);turnCounter.current=0;setMemoryStatus("Conversation cleared; notes retained");
    }catch(error){setMemoryStatus(error instanceof Error?error.message:"Clear failed");}
  }
  function sendQuestion(value:string){
    if(!canSend||!value.trim())return;
    if(researchMode){
      if(!webResearch){setError("Enable Web Research in settings first.");return;}
      const selected:CopilotContext=effectiveContext.kind==="document"
        ?{kind:"page",page:activePage}:effectiveContext;
      setResearchSessions(previous=>[...previous,{
        id:++researchCounter.current,question:value.trim().slice(0,1500),context:selected,sourceId,assetId,
      }]);
      setError("");setQuestion("");
    }else if(analystChat)void askAnalyst(value);
    else void submit("ask",value);
  }
  function onSubmit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();sendQuestion(question);
  }
  const isMinimized=windowState.geometry.minimized && !windowState.mobile;

  return <section
    role="dialog" aria-label="AI Processing Copilot" aria-modal="false"
    data-testid="stage3-processing-copilot"
    className="fixed z-[70] flex flex-col overflow-hidden border border-[var(--line)] bg-[var(--surface-panel)] text-[var(--foreground)] shadow-[0_24px_72px_rgba(0,0,0,0.65)] md:rounded-xl"
    style={windowState.style}
  >
    <header className="flex min-h-14 touch-none select-none items-center justify-between gap-3 border-b border-[var(--line-neutral)] bg-[var(--surface-raised)] px-4"
      onPointerDown={(event)=>windowState.startPointer(event,"drag")} aria-label="Drag Copilot window">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded border border-[var(--line)] bg-[var(--amber-tint)] text-lg text-[var(--amber-soft)]">✦</div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold tracking-[0.16em] text-[var(--amber-soft)]">CİTEM / COPILOT</p>
          <p className="flex items-center gap-1.5 truncate text-[11px] text-[var(--muted-strong)]"
            title={connected && byok?.model ? byok.model : "NVIDIA NIM"}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${connected ? "bg-[var(--success)]" : "bg-[var(--danger)]"}`}/>
            {connected ? "NVIDIA connected" : statusError || "NVIDIA not connected"}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 text-[var(--muted-strong)]">
        <button type="button" title="Copilot preferences and BYOK" aria-label="Copilot settings"
          aria-expanded={showConnection} aria-controls="citem-copilot-settings"
          className="rounded-lg border border-transparent px-3 py-1.5 text-[11px] font-semibold text-[var(--amber-soft)] hover:border-[var(--line)] hover:bg-[var(--amber-tint)]"
          onClick={()=>setShowConnection(v=>!v)}>
          ⚙ Settings
        </button>
        {!windowState.mobile ? <button type="button" className="rounded px-2 py-1.5 text-xs hover:bg-[var(--amber-tint)]"
          aria-label={windowState.geometry.minimized?"Restore Copilot":"Minimize Copilot"}
          onClick={windowState.setMinimized}>{windowState.geometry.minimized?"▢":"−"}</button> : null}
        {!windowState.mobile ? <button type="button" className="rounded px-2 py-1.5 text-[11px] hover:bg-[var(--amber-tint)]"
          aria-label={windowState.geometry.docked?"Undock Copilot":"Dock Copilot"}
          onClick={windowState.setDocked}>{windowState.geometry.docked?"Float":"Dock"}</button> : null}
        <button type="button" className="rounded px-2 py-1.5 text-base hover:bg-[var(--amber-tint)]"
          aria-label="Close Copilot" onClick={onClose}>×</button>
      </div>
    </header>
    {!isMinimized ? <>
      {showConnection ? <div id="citem-copilot-settings" role="region" aria-label="Copilot preferences"
        className="absolute right-3 top-14 z-20 max-h-[min(75vh,610px)] w-[min(95%,460px)] overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[0_16px_50px_rgba(0,0,0,0.65)]"
        data-testid="copilot-settings-popover">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--amber-soft)]">Copilot preferences</h3>
          <button type="button" onClick={()=>setShowConnection(false)} aria-label="Close settings"
            className="rounded px-2 py-1 text-xs text-[var(--muted-strong)] hover:bg-[var(--amber-tint)]">Done ×</button>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-[var(--line-neutral)] p-3">
            <p className="mb-2 text-xs font-semibold text-[var(--foreground)]">Intelligence memory</p>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={analystChat} onChange={event=>{
                setMemoryReady(false);setMemoryStatus(event.target.checked?"Loading investigation memory…":"");
                setAnalystChat(event.target.checked);
              }}/>
              Analyst chat · persistent investigation memory
            </label>
            <label className="mt-3 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={useSource} onChange={event=>setUseSource(event.target.checked)}/>
              Include selected PDF evidence
            </label>
            <label className="mt-3 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={webResearch} onChange={event=>{
                setWebResearch(event.target.checked);
                if(!event.target.checked)setResearchMode(false);
              }}/>
              Enable Web Research mode
            </label>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
              Preferences start enabled. Web searches are sent only after you explicitly press Search selected.
            </p>
            {analystChat ? <div className="mt-3 space-y-2 border-t border-[var(--line-neutral)] pt-3">
              <label htmlFor="citem-memory-notes" className="text-xs font-medium text-[var(--muted-strong)]">Investigation notes</label>
              <textarea id="citem-memory-notes" value={memoryNotes}
                onChange={event=>setMemoryNotes(event.target.value)}
                maxLength={4000} rows={3} aria-label="Investigation memory notes"
                className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-input)] p-2 text-xs"
                placeholder="Working hypotheses, assumptions and research questions…"/>
              <p className="text-[10px] text-[var(--muted)]">
                Notes are stored in the investigation and sent to NVIDIA for Analyst chat. Do not enter secrets.
              </p>
              <div className="flex items-center gap-3 text-xs">
                <button type="button" onClick={()=>void saveNotes()} className="text-[var(--amber-soft)] underline">Save notes</button>
                <button type="button" onClick={()=>void clearMemory()} className="text-[var(--muted-strong)] underline">Clear saved chat</button>
              </div>
              <p role="status" className="text-[11px] text-[var(--muted)]">{memoryStatus}</p>
            </div>:null}
          </div>
          <div className="rounded-xl border border-[var(--line-neutral)] p-3 text-xs">
            <p className="mb-2 font-semibold">Document memory index</p>
            <button type="button" onClick={()=>void backfillPDFs()}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-[var(--amber-soft)]">
              Index existing PDFs (2 at a time)
            </button>
            {indexStatus?<p role="status" className="mt-2 text-[var(--muted-strong)]">{indexStatus}</p>:null}
            <div className="mt-3 border-t border-[var(--line-neutral)] pt-3">
              <label className="flex items-start gap-2 text-[11px] text-[var(--muted-strong)]">
                <input type="checkbox" checked={localEmbeddingApproved}
                  onChange={event=>setLocalEmbeddingApproved(event.target.checked)}/>
                I approve local semantic processing for the selected original PDF on the trusted CİTEM worker. No third-party embedding provider is used.
              </label>
              <button type="button" disabled={!localEmbeddingApproved||semanticIndexing}
                onClick={()=>void prepareLocalSemanticIndex()}
                className="mt-2 rounded-lg border border-[var(--line)] px-3 py-2 text-[var(--amber-soft)] disabled:opacity-50">
                {semanticIndexing?"Preparing local embeddings…":
                  semanticIndexOffset>0?"Continue local semantic index":"Prepare local semantic index"}
              </button>
              {semanticIndexStatus?<p role="status" className="mt-2 text-[var(--muted-strong)]">{semanticIndexStatus}</p>:null}
            </div>
          </div>
          <details className="rounded-xl border border-[var(--line-neutral)] p-3">
            <summary className="cursor-pointer text-xs font-semibold text-[var(--foreground)]">
              NVIDIA BYOK · {connected?"Connected":"Connect to continue"}
            </summary>
            <div className="mt-3"><ByokConnectionPanel scope="user" defaultProviderId="nvidia_nim" autoLoad={false} initialStatus={byok??undefined}
              onStatusChange={onConnectionStatusChange}/></div>
          </details>
        </div>
      </div>:null}
      {!connected ? <button type="button" onClick={()=>setShowConnection(true)}
        className="mx-4 mt-3 rounded-lg border border-[var(--amber-dark)] bg-[var(--amber-tint)] px-3 py-2 text-xs text-[var(--amber-soft)]">
        Connect NVIDIA NIM in Settings
      </button> : null}
      <CopilotContextSelector context={effectiveContext} onChange={setContext}
        annotationId={selectedAnnotationId} activePage={activePage}
        totalPages={pageCount} sourceTitle={sourceTitle}/>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--line-neutral)] px-4 py-2">
        <label htmlFor="stage3-copilot-response-language" className="sr-only">Response language</label>
        <select id="stage3-copilot-response-language" value={responseLanguage}
          onChange={(event)=>setResponseLanguage(event.currentTarget.value as "auto" | "tr" | "en")}
          className="min-h-8 rounded border border-[var(--line)] bg-[var(--surface-input)] px-2 text-xs text-[var(--foreground)]"
          title="Response language">
          <option value="auto">Auto language</option>
          <option value="tr">Türkçe</option>
          <option value="en">English</option>
        </select>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" disabled={!canProcess||!webResearch}
            aria-pressed={researchMode}
            onClick={()=>{setResearchMode(value=>!value);setError("");}}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${researchMode
              ?"border-[var(--amber-strong)] bg-[var(--amber-tint)] text-[var(--amber-soft)]"
              :"border-[var(--line)] text-[var(--muted-strong)] hover:border-[var(--amber-dark)]"} disabled:opacity-40`}>
            Web research
          </button>
          <button type="button" disabled={!canProcess} onClick={()=>void submit("extract","")}
            className="rounded border border-[var(--amber-dark)] bg-[var(--amber-tint)] px-3 py-1.5 text-xs font-semibold text-[var(--amber-soft)] hover:bg-[var(--amber-glow)] disabled:opacity-40">
            Extract candidates
          </button>
          <button type="button" disabled={!canProcess} onClick={startDocumentExtraction}
            className="rounded border border-[var(--amber-dark)] bg-[var(--amber-tint)] px-3 py-1.5 text-xs font-semibold text-[var(--amber-soft)] hover:bg-[var(--amber-glow)] disabled:opacity-40">
            {effectiveContext.kind==="document"?"Extract whole PDF":"Scan selected pages"}
          </button>
          <button type="button" disabled={!canProcess} onClick={()=>void submit("analyse","")}
            className="rounded border border-[var(--amber-dark)] bg-[var(--amber-tint)] px-3 py-1.5 text-xs font-medium text-[var(--amber-soft)] hover:bg-[var(--amber-glow)] disabled:opacity-40">
            Analyse context
          </button>
          <button type="button" disabled={!canProcess}
            onClick={()=>void submit("ask","Explain this passage and its technical terminology using source evidence.")}
            className="rounded border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted-strong)] hover:border-[var(--line-hover)] hover:text-[var(--foreground)] disabled:opacity-40">
            Explain passage
          </button>
        </div>
      </div>
      {pdfProgress ? <div role="status" aria-live="polite" data-testid="pdf-batch-progress"
        className="shrink-0 border-b border-[var(--line-neutral)] px-4 py-2 text-xs text-[var(--muted-strong)]">
        <span>Entire PDF: {pdfProgress.completed} / {pdfProgress.total} pages processed</span>
        <span className="ml-2 text-[var(--amber-soft)]">
          {pdfProgress.status==="complete"?"Complete":
           pdfProgress.status==="needs_review"?"Review needed · other pages processed":
           pdfProgress.status==="paused"?"Paused · results retained":"Reading in verified batches…"}
        </span>
        {(pdfProgress.status==="paused" || pdfProgress.status==="needs_review") && !working ?
          <button type="button" className="ml-3 underline text-[var(--amber-soft)]"
            onClick={()=>{const run=documentRun.current;if(run)void submit(run.mode,run.prompt,true);}}>
            {pdfProgress.status==="needs_review"?"Retry flagged pages":"Continue Entire PDF"}
          </button>:null}
        {pdfProgress.needsReview.length>0 ? <p className="mt-1 text-[11px]" data-testid="pdf-needs-review">
          Needs analyst review: {pdfProgress.needsReview.length} unverified
          {pdfProgress.needsReview.length===1?" page":" pages"} ({pdfProgress.needsReview.slice(0,12)
            .map(({page,code})=>`p.${page}: ${code}`).join(", ")}
          {pdfProgress.needsReview.length>12?`, +${pdfProgress.needsReview.length-12} more`:""}).
          These pages were attempted but NOT counted as analysed.
        </p>:null}
        {pdfProgress.status!=="complete" ? <p className="mt-1 text-[11px]">
          Each batch is cited separately. Unverifiable pages are flagged while other pages continue; only validated results count as analysed.
        </p>:null}
      </div>:null}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface)]"
        aria-label="Copilot chat history">
        {documentScan.view?<DocumentProcessingReview view={documentScan.view}
          working={documentScan.working} dismissed={documentScan.dismissed}
          onDismiss={documentScan.dismiss} onNavigate={onNavigate}
          onReview={(candidate)=>{
            if(onReviewCandidate)onReviewCandidate(candidate);
            else if(candidate.verifiedSupport[0]?.page)
              onNavigate(candidate.verifiedSupport[0].page,candidate.verifiedSupport[0].provenance.annotationId,
                candidate.verifiedSupport[0].quote);
          }}
          onResume={(failed)=>void documentScan.resume(failed)} onCancel={documentScan.cancel}/>:null}
        {(turns.length>0||researchSessions.length===0)?<CopilotChat turns={turns} onNavigate={onNavigate}
          activeSourceId={sourceId} activeAssetId={assetId}/>:null}
        {investigationEvents.length ? <details className="mx-5 rounded-xl border border-[var(--line-neutral)] bg-[var(--surface-panel)] p-3"
          data-testid="copilot-investigation-timeline">
          <summary className="cursor-pointer text-xs font-semibold text-[var(--amber-soft)]">
            Investigation memory · {investigationEvents.length} recent analysis events
          </summary>
          <div className="mt-3 space-y-2">
            {investigationEvents.slice(0,12).map(event=><article key={event.id}
              className="rounded-lg bg-[var(--surface-input)] p-2.5 text-xs">
              <p className="font-semibold text-[var(--foreground)]">{event.kind} · {new Date(event.created_at).toLocaleDateString()}</p>
              <p className="mt-1 line-clamp-3 text-[var(--muted-strong)]">{event.summary||event.question}</p>
              {event.asset_id!==assetId ? <p className="mt-1 text-[var(--muted)]">
                Other source · {event.source_id?.slice(0,8)}
              </p>:null}
              <p className="mt-1 text-[10px] text-[var(--muted)]">Prior AI analysis, not independently verified</p>
            </article>)}
          </div>
        </details>:null}
        {researchSessions.filter(session=>session.sourceId===sourceId&&session.assetId===assetId).map(session=><CopilotResearchConversation
          key={session.id} projectId={projectId} sourceId={sourceId} assetId={assetId}
          session={session} responseLanguage={responseLanguage} useSource={useSource}
          onNavigate={onNavigate}/>)}
        {candidateResult ? <CopilotCandidates result={candidateResult} dismissed={dismissedCandidates}
          onDismiss={(candidateId)=>setDismissedCandidates((current)=>new Set([...current,candidateId]))}
          onReview={(candidate)=>{
            if(onReviewCandidate) onReviewCandidate(candidate);
            else if(candidate.verifiedSupport[0]?.page)
              onNavigate(candidate.verifiedSupport[0].page,candidate.verifiedSupport[0].provenance.annotationId,
                candidate.verifiedSupport[0].quote);
          }} onNavigate={onNavigate}/> : null}
      </div>
      <form onSubmit={onSubmit}
        className="shrink-0 border-t border-[var(--line)] bg-[var(--surface-panel)] px-4 pb-3 pt-3">
        <label htmlFor="stage3-copilot-question"
          className="mb-1.5 block text-xs font-medium text-[var(--muted-strong)]">
          {researchMode?"Research question":`Ask about ${contextTitle(effectiveContext)}`}
        </label>
        <div className="flex items-end gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-input)] p-2 focus-within:border-[var(--line-hover)]">
          <textarea id="stage3-copilot-question" value={question}
            onChange={(event)=>setQuestion(event.currentTarget.value)}
            onKeyDown={(event)=>{
              if(event.key==="Enter" && !event.shiftKey && !event.nativeEvent.isComposing){
                event.preventDefault();sendQuestion(question);
              }
            }}
            placeholder={researchMode?"Ask a research question…":"Ask a question about the selected source…"}
            maxLength={1500} rows={2}
            className="max-h-40 min-h-16 w-full flex-1 resize-y bg-transparent px-1.5 py-1 text-sm leading-relaxed text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
            disabled={working}/>
          <div className="flex shrink-0 flex-col gap-1">
            {working ? <button type="button" className="rounded border border-[var(--line)] px-3 py-2 text-xs text-[var(--muted-strong)]"
              onClick={()=>inFlight.current?.abort()}>Cancel</button> : null}
            <button type="submit" disabled={!canSend || !question.trim()}
              className="rounded border border-[var(--amber-strong)] bg-[var(--amber-strong)] px-4 py-2 text-xs font-semibold text-[#171106] hover:bg-[var(--amber-soft)] disabled:opacity-40">
              {working?"Working…":researchMode?"Suggest searches":analystChat?"Ask analyst":"Ask"}
            </button>
          </div>
        </div>
        {error ? <div role="alert" className="mt-2 space-y-1 text-xs text-[var(--danger)]">
          <p>{error}</p>
          {diagnostic ? <p className="break-words font-mono" data-testid="copilot-error-diagnostic">
            HTTP {diagnostic.status} · stage={diagnostic.stage}{diagnostic.sourceStep ? ` · sourceStep=${diagnostic.sourceStep}` : ""} · code={diagnostic.code}
          </p> : null}
        </div> : null}
        {!contextValid ? <p role="alert" className="mt-2 text-xs text-[var(--danger)]">Select 1–10 consecutive valid pages.</p> : null}
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          Enter to send · Shift+Enter for a new line · {analystChat?"Investigation memory on":"Legacy source-only mode"}
          {researchMode?" · Web search requires confirmation":""}
        </p>
      </form>
    </> : null}
    {!windowState.mobile && !windowState.geometry.docked && !isMinimized
      ? <div role="separator" aria-label="Resize Copilot" title="Drag to resize"
          className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize touch-none border-b-2 border-r-2 border-[var(--amber)]"
          onPointerDown={(event)=>windowState.startPointer(event,"resize")}/> : null}
  </section>;
}
