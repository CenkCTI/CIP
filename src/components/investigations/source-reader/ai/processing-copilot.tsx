"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ByokConnectionPanel } from "@/components/ai/byok-connection-panel";
import { CopilotChat, type CopilotResult, type CopilotTurn } from "./copilot-chat";
import { CopilotContextSelector, contextTitle, type CopilotContext } from "./copilot-context-selector";
import { useCopilotWindow } from "./use-copilot-window";
import { CopilotCandidates } from "./copilot-candidates";
import type { Stage3Candidate, Stage3CandidateResponse } from "@/lib/ai/stage3/candidates";
import { dividePdfBatch, planPdfBatches, type PdfBatch } from "@/lib/ai/stage3/document-batches";

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
  rate_limited:"The AI usage limit was reached. Try again later.",
  provider_rate_limited:"NVIDIA has rate-limited this request.",
  nvidia_output_exhausted:"The model reached its output limit. Try a narrower question.",
  malformed_output:"NVIDIA could not provide valid, source-grounded JSON after a repair attempt. Try selecting 1–2 relevant pages and ask a more specific question.",
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
};
type PdfProgress = {total:number;completed:number;status:"running"|"paused"|"complete"};

export function ProcessingCopilot({
  projectId, sourceId, assetId, sourceTitle, selectedAnnotationId,
  activePage, pageCount, onClose, onNavigate, onReviewCandidate,
}: {
  projectId: string; sourceId: string; assetId: string; sourceTitle: string;
  selectedAnnotationId: string | null; activePage: number; pageCount: number | null;
  onClose: () => void;
  onNavigate: (page: number, annotationId?: string) => void;
  onReviewCandidate?: (candidate: Stage3Candidate) => void;
}) {
  const windowState = useCopilotWindow();
  const [byok, setByok] = useState<ByokStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [showConnection, setShowConnection] = useState(false);
  const [context, setContext] = useState<CopilotContext>({kind:"document"});
  const [question, setQuestion] = useState("");
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
  const canSend = connected && contextValid && !working;

  async function submit(mode:"ask"|"analyse"|"extract",prompt:string,resume=false) {
    if(!canSend || (mode==="ask" && !prompt.trim())) {
      if(!connected)setError("Connect NVIDIA NIM before sending a message.");
      else if(!contextValid)setError("Select the entire PDF, a valid PDF page, a text annotation or 1–10 consecutive pages.");
      return;
    }
    const captured=effectiveContext;
    const active=resume?documentRun.current:null;
    if(resume && (!active || active.mode!==mode || active.prompt!==prompt ||
       active.sourceId!==sourceId || active.assetId!==assetId))return;
    if(!resume) {documentRun.current=null;setPdfProgress(null);}
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
                (code!=="pdf_document_too_large" && code!=="context_too_large"))throw cause;
          }
        }
        if(captured.kind!=="document" || pageCount===null || pageCount<1){
          throw new Error("PDF page count is unavailable. Open the PDF viewer, then try Entire PDF again.");
        }
        const run:LargeDocumentRun={mode,prompt,language,sourceId,assetId,
          total:pageCount,completed:0,queue:planPdfBatches(pageCount)};
        documentRun.current=run;
        if(mode==="extract"){setCandidateResult(null);setDismissedCandidates(new Set());}
      }
      const run=documentRun.current;
      if(!run)throw new Error("No document processing run is available.");
      setPdfProgress({total:run.total,completed:run.completed,status:"running"});
      while(run.queue.length){
        if(abort.signal.aborted)break;
        const part=run.queue[0];
        let response:CopilotResult|Stage3CandidateResponse;
        try{
          response=await requestPart({kind:"pages",...part},false);
        }catch(cause){
          // A dense page range can exceed the input cap; divide and retry without
          // losing completed pages or silently skipping an oversized segment.
          const code=(cause as {code?:string}).code;
          if(code==="context_too_large"){
            const halves=dividePdfBatch(part);
            if(halves){run.queue.splice(0,1,...halves);continue;}
          }
          throw cause;
        }
        if(abort.signal.aborted)break;
        applyResult(response,part);
        run.queue.shift();
        run.completed+=part.pageEnd-part.pageStart+1;
        setPdfProgress({total:run.total,completed:run.completed,status:"running"});
      }
      if(!abort.signal.aborted && !run.queue.length){
        documentRun.current=null;
        setPdfProgress({total:run.total,completed:run.completed,status:"complete"});
      }else{
        setPdfProgress({total:run.total,completed:run.completed,status:"paused"});
      }
    }catch(cause){
      if(documentRun.current){
        const run=documentRun.current;
        if(mounted.current)setPdfProgress({total:run.total,completed:run.completed,status:"paused"});
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
  function onSubmit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();void submit("ask",question);
  }
  const isMinimized=windowState.geometry.minimized && !windowState.mobile;

  return <section
    role="dialog" aria-label="AI Processing Copilot" aria-modal="false"
    data-testid="stage3-processing-copilot"
    className="fixed z-[70] flex flex-col overflow-hidden border border-[var(--line)] bg-[var(--surface-panel)] text-[var(--foreground)] shadow-[0_24px_72px_rgba(0,0,0,0.65)] md:rounded-lg"
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
        <button type="button" title="NVIDIA connection settings" aria-label="BYOK settings"
          className="rounded px-2 py-1.5 text-[11px] text-[var(--amber-soft)] hover:bg-[var(--amber-tint)]"
          onClick={()=>{setShowConnection((v)=>!v);void refreshStatus();}}>
          {showConnection ? "Hide settings" : "BYOK"}
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
      {!connected || showConnection ? <div className="max-h-[45%] shrink-0 overflow-y-auto border-b border-[var(--line-neutral)] bg-[var(--surface-input)] px-4 py-3">
        <ByokConnectionPanel scope="user" defaultProviderId="nvidia_nim" autoLoad={true}
          onStatusChange={onConnectionStatusChange}/>
        {!connected ? <p className="mt-2 text-xs text-[var(--amber-soft)]">
          Choose an NVIDIA NIM model to enable source processing.
        </p> : null}
      </div> : null}
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
          <button type="button" disabled={!canSend} onClick={()=>void submit("extract","")}
            className="rounded border border-[var(--amber-dark)] bg-[var(--amber-tint)] px-3 py-1.5 text-xs font-semibold text-[var(--amber-soft)] hover:bg-[var(--amber-glow)] disabled:opacity-40">
            Extract candidates
          </button>
          <button type="button" disabled={!canSend} onClick={()=>void submit("analyse","")}
            className="rounded border border-[var(--amber-dark)] bg-[var(--amber-tint)] px-3 py-1.5 text-xs font-medium text-[var(--amber-soft)] hover:bg-[var(--amber-glow)] disabled:opacity-40">
            Analyse context
          </button>
          <button type="button" disabled={!canSend}
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
          {pdfProgress.status==="complete"?"Complete":pdfProgress.status==="paused"?"Paused · results retained":"Reading in verified batches…"}
        </span>
        {pdfProgress.status==="paused" && !working ?
          <button type="button" className="ml-3 underline text-[var(--amber-soft)]"
            onClick={()=>{const run=documentRun.current;if(run)void submit(run.mode,run.prompt,true);}}>
            Continue Entire PDF
          </button>:null}
        {pdfProgress.status!=="complete" ? <p className="mt-1 text-[11px]">
          Each batch is cited separately. Rate limits may pause the run; unfinished pages are never reported as read.
        </p>:null}
      </div>:null}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface)]"
        aria-label="Copilot chat history">
        <CopilotChat turns={turns} onNavigate={onNavigate}/>
        {candidateResult ? <CopilotCandidates result={candidateResult} dismissed={dismissedCandidates}
          onDismiss={(candidateId)=>setDismissedCandidates((current)=>new Set([...current,candidateId]))}
          onReview={(candidate)=>{
            if(onReviewCandidate) onReviewCandidate(candidate);
            else if(candidate.verifiedSupport[0]?.page) onNavigate(candidate.verifiedSupport[0].page,candidate.verifiedSupport[0].provenance.annotationId);
          }} onNavigate={onNavigate}/> : null}
      </div>
      <form onSubmit={onSubmit}
        className="shrink-0 border-t border-[var(--line)] bg-[var(--surface-panel)] px-4 pb-3 pt-3">
        <label htmlFor="stage3-copilot-question"
          className="mb-1.5 block text-xs font-medium text-[var(--muted-strong)]">
          Ask about {contextTitle(effectiveContext)}
        </label>
        <div className="flex items-end gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-input)] p-2 focus-within:border-[var(--line-hover)]">
          <textarea id="stage3-copilot-question" value={question}
            onChange={(event)=>setQuestion(event.currentTarget.value)}
            onKeyDown={(event)=>{
              if(event.key==="Enter" && !event.shiftKey && !event.nativeEvent.isComposing){
                event.preventDefault();void submit("ask",question);
              }
            }}
            placeholder="Ask a question about the selected source…" maxLength={1500} rows={3}
            className="max-h-40 min-h-16 w-full flex-1 resize-y bg-transparent px-1.5 py-1 text-sm leading-relaxed text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
            disabled={working}/>
          <div className="flex shrink-0 flex-col gap-1">
            {working ? <button type="button" className="rounded border border-[var(--line)] px-3 py-2 text-xs text-[var(--muted-strong)]"
              onClick={()=>inFlight.current?.abort()}>Cancel</button> : null}
            <button type="submit" disabled={!canSend || !question.trim()}
              className="rounded border border-[var(--amber-strong)] bg-[var(--amber-strong)] px-4 py-2 text-xs font-semibold text-[#171106] hover:bg-[var(--amber-soft)] disabled:opacity-40">
              {working?"Asking…":"Ask"}
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
          Enter: send · Shift+Enter: new line · Source text shared with NVIDIA · No saved chat history
        </p>
      </form>
    </> : null}
    {!windowState.mobile && !windowState.geometry.docked && !isMinimized
      ? <div role="separator" aria-label="Resize Copilot" title="Drag to resize"
          className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize touch-none border-b-2 border-r-2 border-[var(--amber)]"
          onPointerDown={(event)=>windowState.startPointer(event,"resize")}/> : null}
  </section>;
}
