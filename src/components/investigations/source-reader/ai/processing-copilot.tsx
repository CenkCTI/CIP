"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ByokConnectionPanel } from "@/components/ai/byok-connection-panel";
import { CopilotChat, type CopilotResult, type CopilotTurn } from "./copilot-chat";
import { CopilotContextSelector, contextTitle, type CopilotContext } from "./copilot-context-selector";
import { useCopilotWindow } from "./use-copilot-window";

type ByokStatus = {
  enabled?: boolean; connected?: boolean; state?: string;
  providerId?: string; model?: string;
};
const SAFE_ERRORS: Record<string,string> = {
  byok_required:"Connect NVIDIA NIM to use the Copilot.",
  byok_expired:"Your NVIDIA session expired. Reconnect to continue.",
  unsupported_provider:"The Copilot requires an NVIDIA NIM BYOK connection.",
  unsupported_asset:"Only ready original PDFs are supported.",
  pdf_text_unavailable:"No extractable text found. OCR is not enabled.",
  context_too_large:"Too much source text. Select a smaller page range.",
  pdf_page_out_of_range:"The selected PDF page does not exist.",
  rate_limited:"The AI usage limit was reached. Try again later.",
  provider_rate_limited:"NVIDIA has rate-limited this request.",
  nvidia_output_exhausted:"The model reached its output limit. Try a narrower question.",
  malformed_output:"The model did not return a valid, grounded response.",
  invalid_request:"Choose a valid context and question.",
  bad_origin:"Request rejected due to origin validation.",
  request_failed:"Could not complete the request.",
};

export function validCopilotContext(value: CopilotContext, pageCount: number | null) {
  const max = pageCount ?? 10000;
  if (value.kind === "annotation") return Boolean(value.annotationId);
  if (value.kind === "page") return Number.isInteger(value.page) && value.page >= 1 && value.page <= max;
  return Number.isInteger(value.pageStart) && Number.isInteger(value.pageEnd)
    && value.pageStart >= 1 && value.pageEnd <= max
    && value.pageStart <= value.pageEnd && value.pageEnd - value.pageStart < 10;
}

export function ProcessingCopilot({
  projectId, sourceId, assetId, sourceTitle, selectedAnnotationId,
  activePage, pageCount, onClose, onNavigate,
}: {
  projectId: string; sourceId: string; assetId: string; sourceTitle: string;
  selectedAnnotationId: string | null; activePage: number; pageCount: number | null;
  onClose: () => void;
  onNavigate: (page: number, annotationId?: string) => void;
}) {
  const windowState = useCopilotWindow();
  const [byok, setByok] = useState<ByokStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [showConnection, setShowConnection] = useState(false);
  const [context, setContext] = useState<CopilotContext>({kind:"page",page:1});
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<CopilotTurn[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef<AbortController|null>(null);
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
    void refreshStatus();
    return () => {mounted.current=false; inFlight.current?.abort();};
  },[refreshStatus]);
  useEffect(() => { scrollRef.current?.scrollTo({ top:scrollRef.current.scrollHeight, behavior:"smooth" }); },[turns]);
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
  const connected = Boolean(byok?.connected && byok.providerId==="nvidia_nim");
  const contextValid = validCopilotContext(effectiveContext,pageCount);
  const canSend = connected && contextValid && !working;

  async function submit(mode: "ask" | "analyse", prompt: string) {
    if (!canSend || (mode === "ask" && !prompt.trim())) return;
    const captured=effectiveContext;
    setError("");
    setWorking(true);
    const abort=new AbortController();
    inFlight.current=abort;
    try {
      const response=await fetch(`/api/projects/${projectId}/ai/processing`, {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({sourceId,assetId,context:captured,mode,
          ...(mode==="ask"?{question:prompt.trim().slice(0,1500)}:{}),
          byokConsent:true}),
        signal:abort.signal,
        cache:"no-store",
      });
      const payload=await response.json() as {result?:CopilotResult;code?:string;error?:string};
      if(!response.ok || !payload.result) {
        if (payload.code?.startsWith("byok_")) void refreshStatus();
        throw new Error(SAFE_ERRORS[payload.code ?? ""] ?? payload.error ?? "NVIDIA processing failed.");
      }
      if (!mounted.current || abort.signal.aborted) return;
      setTurns((current)=>[...current,{
        id:++turnCounter.current,context:captured,mode,
        prompt:mode==="analyse"?"Analyse selected source context":prompt.trim(),
        result:payload.result!,
      }]);
      setQuestion("");
    } catch(cause) {
      if (!abort.signal.aborted && mounted.current) {
        setError(cause instanceof Error ? cause.message : "Processing request failed.");
      }
    } finally {
      if(mounted.current && inFlight.current===abort) {
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
    className="fixed z-[70] flex flex-col overflow-hidden border border-amber-900/60 bg-[#101519] text-stone-100 shadow-2xl shadow-black/70 md:rounded-xl"
    style={windowState.style}
  >
    <header className="flex touch-none select-none items-center justify-between border-b border-stone-800 bg-[#182026] px-3 py-3"
      onPointerDown={(event)=>windowState.startPointer(event,"drag")}
      aria-label="Drag Copilot window">
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold tracking-widest text-amber-300">◈ AI PROCESSING COPILOT</p>
        <p className="max-w-64 truncate text-[11px] text-stone-400">
          NVIDIA NIM {connected && byok?.model ? `· ${byok.model}` : "· disconnected"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!windowState.mobile ? <button type="button" className="rounded px-2 py-1 text-xs hover:bg-stone-700"
          aria-label={windowState.geometry.minimized?"Restore Copilot":"Minimize Copilot"}
          onClick={windowState.setMinimized}>{windowState.geometry.minimized?"▢":"—"}</button> : null}
        {!windowState.mobile ? <button type="button" className="rounded px-2 py-1 text-xs hover:bg-stone-700"
          aria-label={windowState.geometry.docked?"Undock Copilot":"Dock Copilot"}
          onClick={windowState.setDocked}>{windowState.geometry.docked?"Float":"Dock"}</button> : null}
        <button type="button" className="rounded px-2 py-1 text-sm hover:bg-stone-700"
          aria-label="Close Copilot" onClick={onClose}>×</button>
      </div>
    </header>
    {!isMinimized ? <>
      <div className="flex items-center justify-between border-b border-stone-800 px-4 py-2 text-xs">
        <span className={connected?"text-emerald-300":"text-amber-300"}>
          {connected?"NVIDIA connected":statusError||"NVIDIA not connected"}
        </span>
        <button type="button" className="text-amber-300 underline"
          onClick={()=>{setShowConnection((v)=>!v);void refreshStatus();}}>
          {showConnection?"Hide connection":"BYOK settings"}
        </button>
      </div>
      {!connected || showConnection ? <div className="max-h-[45%] overflow-auto px-3 py-3">
        <ByokConnectionPanel scope="user" defaultProviderId="nvidia_nim" autoLoad={false}
          onStatusChange={(next)=>{setByok(next);setStatusError("");}} />
        {!connected ? <p className="mt-2 text-xs text-amber-300">
          Select NVIDIA NIM and an allowlisted model. Other BYOK providers cannot run Stage 3 Processing.
        </p> : null}
      </div> : null}
      <CopilotContextSelector context={effectiveContext} onChange={setContext}
        annotationId={selectedAnnotationId} activePage={activePage}
        totalPages={pageCount} sourceTitle={sourceTitle} />
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-800 px-4 py-2 text-xs">
        <button type="button" disabled={!canSend} onClick={()=>void submit("analyse","")}
          className="rounded bg-amber-800/60 px-3 py-1.5 text-amber-100 disabled:opacity-40">
          Analyse context
        </button>
        <button type="button" disabled={!canSend}
          onClick={()=>void submit("ask","Explain this passage and its technical terminology using source evidence.")}
          className="rounded border border-stone-700 px-3 py-1.5 disabled:opacity-40">Explain passage</button>
        <span className="text-stone-500" title="Structured candidate extraction is planned for Phase 3">Extract candidates · Phase 3</span>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" aria-label="Copilot chat history">
        <CopilotChat turns={turns} onNavigate={onNavigate}/>
      </div>
      <form onSubmit={onSubmit} className="border-t border-stone-800 p-3">
        <label htmlFor="stage3-copilot-question" className="text-xs text-stone-400">
          Ask about {contextTitle(effectiveContext)}
        </label>
        <textarea id="stage3-copilot-question" value={question}
          onChange={(event)=>setQuestion(event.currentTarget.value)}
          placeholder="What does this passage report?" maxLength={1500} rows={2}
          className="mt-1 w-full resize-none rounded border border-stone-700 bg-stone-950 p-2 text-sm text-white"
          disabled={working} />
        {error ? <p role="alert" className="mb-2 text-xs text-red-300">{error}</p> : null}
        {!contextValid ? <p role="alert" className="mb-2 text-xs text-amber-300">Select 1–10 consecutive valid pages.</p> : null}
        <div className="flex items-center justify-between gap-2">
          <p className="max-w-64 text-[10px] text-stone-500">
            Sending will share selected source text with NVIDIA. Each question is independent; chat history stays only in memory.
          </p>
          <div className="flex gap-2">
            {working ? <button type="button" className="rounded border border-stone-600 px-3 py-2 text-xs"
              onClick={()=>{inFlight.current?.abort();setWorking(false);}}>Cancel</button> : null}
            <button type="submit" disabled={!canSend || !question.trim()}
              className="rounded bg-amber-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
              {working?"Asking…":"Ask"}
            </button>
          </div>
        </div>
      </form>
    </> : null}
    {!windowState.mobile && !windowState.geometry.docked && !isMinimized
      ? <div role="separator" aria-label="Resize Copilot" title="Drag to resize"
          className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize touch-none border-b-2 border-r-2 border-amber-700"
          onPointerDown={(event)=>windowState.startPointer(event,"resize")}/> : null}
  </section>;
}
