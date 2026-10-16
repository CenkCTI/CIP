"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ByokConnectionPanel } from "@/components/ai/byok-connection-panel";
import { useCopilotWindow } from "./use-copilot-window";

type AnnotationOption = {id: string; page: number | null; text: string};
type ContextKind = "annotation" | "page" | "pages";
type Support = {
  statement: string; quote: string; sourceToken: string; page: number | null;
  kind: "PDF" | "ANNOTATION";
  provenance: {sourceId:string;assetId:string;annotationId?:string};
};
type CopilotResult = {
  summary: string; evidence: Support[];
  unansweredQuestions: string[]; warnings: string[]; discarded: number;
};
type ByokStatus = {enabled?:boolean;connected?:boolean;providerId?:string;provider?:string;model?:string;state?:string};
type Turn = {id:number; question:string; mode:"ask"|"analyse"; contextKey:string; contextLabel:string; response?:CopilotResult; error?:string};
type ApiResponse = {result?:CopilotResult;error?:string;code?:string};

function statusIsNvidia(status:ByokStatus) {
  return Boolean(status.connected && (status.providerId === "nvidia_nim" || status.provider === "NVIDIA NIM"));
}
function pageNum(value:number, fallback:number, max:number) {
  return Number.isFinite(value) ? Math.max(1, Math.min(max, Math.trunc(value))) : fallback;
}
export function buildCopilotRequest(
  sourceId:string, assetId:string, context: {kind:ContextKind;page:number;start:number;end:number;annotationId:string|null},
  mode:"ask"|"analyse", question:string, history:{user:string;assistant:string}[],
) {
  return {
    sourceId, assetId,
    context: context.kind === "annotation"
      ? {kind:"annotation" as const,annotationId:context.annotationId}
      : context.kind === "pages"
        ? {kind:"pages" as const,pageStart:context.start,pageEnd:context.end}
        : {kind:"page" as const,page:context.page},
    mode, ...(mode === "ask" ? {question:question.trim()} : {}),
    history: history.slice(-3).map(h=>({user:h.user.slice(0,500),assistant:h.assistant.slice(0,1000)})),
    byokConsent:true as const,
  };
}

export function ProcessingCopilot({
  projectId, sourceId, assetId, sourceTitle, activePage, pageCount,
  annotations, selectedAnnotationId, onClose, onJumpToPage, onFocusAnnotation,
}:{
  projectId:string; sourceId:string; assetId:string; sourceTitle:string;
  activePage:number; pageCount:number; annotations:AnnotationOption[];
  selectedAnnotationId:string|null; onClose:()=>void;
  onJumpToPage:(page:number)=>void; onFocusAnnotation:(annotationId:string)=>void;
}) {
  const windowState = useCopilotWindow();
  const {geometry,mobile,begin,move,end,toggleDock,toggleMinimized} = windowState;
  const [status,setStatus] = useState<ByokStatus>({connected:false,state:"loading"});
  const [connectOpen,setConnectOpen] = useState(false);
  const [consent,setConsent] = useState(false);
  const [kind,setKind] = useState<ContextKind>(selectedAnnotationId ? "annotation" : "page");
  const [start,setStart] = useState(activePage);
  const [finish,setFinish] = useState(activePage);
  const [selectedId,setSelectedId] = useState<string|null>(selectedAnnotationId);
  const [question,setQuestion] = useState("");
  const [turns,setTurns] = useState<Turn[]>([]);
  const [pending,setPending] = useState(false);
  const [error,setError] = useState("");
  const turnId = useRef(0);
  const abort = useRef<AbortController|null>(null);
  const scrollEnd = useRef<HTMLDivElement|null>(null);
  const maxPage=Math.max(1,pageCount);
  const page=pageNum(activePage,1,maxPage);
  const selectedAnnotation=annotations.find(a=>a.id===selectedId && a.text.trim()) ?? null;
  const safeStart=pageNum(start,1,maxPage);
  const safeEnd=pageNum(finish,safeStart,maxPage);
  const rangeValid=safeEnd>=safeStart && safeEnd-safeStart < 10;
  const contextValid = kind === "annotation" ? Boolean(selectedAnnotation)
    : kind === "page" ? pageCount>0 : pageCount>0 && rangeValid;
  const contextKey = kind === "annotation" ? `ann:${selectedId ?? ""}`
    : kind === "page" ? `page:${page}` : `pages:${safeStart}-${safeEnd}`;
  const contextLabel = kind === "annotation" ? `Annotation · p.${selectedAnnotation?.page ?? "?"}`
    : kind === "page" ? `PDF · p.${page}` : `PDF · p.${safeStart}–${safeEnd}`;

  useEffect(()=>{
    if(selectedAnnotationId && annotations.some(a=>a.id===selectedAnnotationId && a.text.trim())){
      setSelectedId(selectedAnnotationId);
    }
  },[selectedAnnotationId,annotations]);

  const refreshStatus=useCallback(async()=>{
    try{
      const res=await fetch("/api/ai/byok/status",{cache:"no-store"});
      if(!res.ok) throw new Error("status_unavailable");
      const body=await res.json() as ByokStatus;
      setStatus(body);
    }catch{setStatus({connected:false,state:"unavailable"});}
  },[]);

  useEffect(()=>{void refreshStatus();},[refreshStatus]);
  useEffect(()=>()=>{abort.current?.abort();},[]);
  useEffect(()=>{
    if(!geometry.minimized) scrollEnd.current?.scrollIntoView({block:"end"});
  },[turns,geometry.minimized]);
  useEffect(()=>{
    const keydown=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};
    window.addEventListener("keydown",keydown);
    return()=>window.removeEventListener("keydown",keydown);
  },[onClose]);

  const history=useMemo(()=>turns.filter(t=>t.contextKey===contextKey && t.response && !t.error)
    .slice(-3).map(t=>({user:t.question.slice(0,500),assistant:(t.response?.summary ?? "").slice(0,1000)})),[turns,contextKey]);
  const canSend=statusIsNvidia(status)&&contextValid&&consent&&!pending;

  async function send(mode:"ask"|"analyse", prompt:string) {
    if(!canSend || (mode==="ask"&&!prompt.trim())) return;
    setError("");
    const currentId=++turnId.current;
    const item:Turn={id:currentId,question:mode==="analyse"?"Analyse selected source":prompt.trim(),mode,contextKey,contextLabel};
    setTurns(old=>[...old,item]);
    setQuestion("");
    setPending(true);
    const controller=new AbortController();
    abort.current=controller;
    try {
      const payload=buildCopilotRequest(sourceId,assetId,{
        kind,page,start:safeStart,end:safeEnd,annotationId:selectedAnnotation?.id??null,
      },mode,prompt,history);
      const res=await fetch(`/api/projects/${projectId}/ai/processing`,{
        method:"POST",headers:{"content-type":"application/json"},
        credentials:"same-origin",cache:"no-store",signal:controller.signal,
        body:JSON.stringify(payload),
      });
      const body=await res.json() as ApiResponse;
      if(!res.ok || !body.result) throw new Error(body.error || "AI processing request could not be completed.");
      if(controller.signal.aborted)return;
      setTurns(old=>old.map(t=>t.id===currentId?{...t,response:body.result}:t));
    }catch(cause) {
      if(controller.signal.aborted)return;
      const message=cause instanceof Error?cause.message:"AI connection failed.";
      setTurns(old=>old.map(t=>t.id===currentId?{...t,error:message}:t));
      if(/BYOK|NVIDIA|Connect|credential/i.test(message))void refreshStatus();
    }finally {
      if(abort.current===controller)abort.current=null;
      setPending(false);
    }
  }
  const shellStyle:React.CSSProperties = mobile
    ? {inset:0,width:"100vw",height:"100dvh"}
    : geometry.docked
      ? {top:0,right:0,width:Math.min(440,windowWidthFallback()),height:"100dvh"}
      : {top:geometry.y,left:geometry.x,width:geometry.width,height:geometry.minimized?56:geometry.height};

  return <div
    role="dialog" aria-label="AI Processing Copilot" aria-modal={mobile}
    data-testid="stage3-processing-copilot"
    className="fixed z-[80] flex flex-col overflow-hidden rounded-xl border border-amber-600/40 bg-[#12171c] text-stone-100 shadow-2xl max-md:rounded-none"
    style={shellStyle}
  >
    <header
      data-testid="copilot-drag-handle"
      className="flex h-14 shrink-0 touch-none select-none items-center justify-between gap-2 border-b border-stone-700/80 bg-[#1b242b] px-3"
      onPointerDown={event=>begin(event,"move")}
      onPointerMove={move} onPointerUp={end} onPointerCancel={end}
    >
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold tracking-wide text-amber-300">◈ AI PROCESSING COPILOT</p>
        <p className="truncate text-[11px] text-stone-400">{statusIsNvidia(status)?`NVIDIA NIM · ${status.model??"connected"}`:"NVIDIA NIM · disconnected"}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        {!mobile && <button type="button" aria-label={geometry.minimized?"Restore AI Copilot":"Minimize AI Copilot"}
          className="rounded p-2 text-stone-300 hover:bg-stone-700" onClick={toggleMinimized}>{geometry.minimized?"□":"—"}</button>}
        {!mobile && <button type="button" aria-label={geometry.docked?"Undock AI Copilot":"Dock AI Copilot"}
          className="rounded p-2 text-stone-300 hover:bg-stone-700" onClick={toggleDock}>{geometry.docked?"↗":"◧"}</button>}
        <button type="button" aria-label="Close AI Copilot" className="rounded p-2 text-stone-300 hover:bg-stone-700" onClick={onClose}>×</button>
      </div>
    </header>

    {!geometry.minimized || mobile ? <>
      <div className="flex min-h-0 flex-1 flex-col">
        <section className="shrink-0 space-y-2 border-b border-stone-800 p-3 text-xs" aria-label="Copilot context">
          <p className="truncate text-stone-300" title={sourceTitle}>{sourceTitle}</p>
          <label className="block text-stone-400">Context
            <select aria-label="Copilot context" value={kind} onChange={e=>setKind(e.target.value as ContextKind)}
              className="mt-1 w-full rounded border border-stone-700 bg-[#0c1115] p-2 text-stone-100">
              <option value="page">Current page · p.{page}</option>
              <option value="annotation" disabled={!annotations.some(a=>a.text.trim())}>Current annotation</option>
              <option value="pages">Selected pages</option>
              <option value="document" disabled>Entire document — Phase 4</option>
            </select>
          </label>
          {kind==="annotation" && <label className="block text-stone-400">Annotation
            <select aria-label="Selected annotation" value={selectedAnnotation?.id??""}
              onChange={e=>{setSelectedId(e.target.value);onFocusAnnotation(e.target.value);}}
              className="mt-1 w-full rounded border border-stone-700 bg-[#0c1115] p-2 text-stone-100">
              {!selectedAnnotation&&<option value="">Choose an annotation</option>}
              {annotations.filter(a=>a.text.trim()).map(a=><option key={a.id} value={a.id}>
                p.{a.page??"?"} · {a.text.replace(/\s+/g," ").slice(0,52)}
              </option>)}
            </select>
          </label>}
          {kind==="pages" && <div className="flex items-center gap-2">
            <label className="flex-1 text-stone-400">From <input type="number" min={1} max={maxPage} value={start}
              onChange={e=>setStart(Number(e.target.value))} className="mt-1 w-full rounded border border-stone-700 bg-[#0c1115] p-2"/></label>
            <label className="flex-1 text-stone-400">To <input type="number" min={1} max={maxPage} value={finish}
              onChange={e=>setFinish(Number(e.target.value))} className="mt-1 w-full rounded border border-stone-700 bg-[#0c1115] p-2"/></label>
          </div>}
          {!rangeValid&&kind==="pages"&&<p role="alert" className="text-red-300">Choose up to 10 pages, from first to last.</p>}
          <p className="text-[11px] text-stone-500">Only selected document text is shared. Investigation-wide context is not enabled in this phase.</p>
        </section>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" role="log" aria-label="Copilot conversation" aria-live="polite">
          {!turns.length&&<p className="text-sm leading-6 text-stone-400">Choose a page or annotation, then ask about the text. Replies are source-grounded suggestions, not verified CTI assessments.</p>}
          {turns.map(turn=><article key={turn.id} className="space-y-2 rounded-lg border border-stone-700/80 p-3 text-xs">
            <p className="text-[11px] text-stone-500">{turn.contextLabel} · {turn.mode==="analyse"?"ANALYSE":"ASK"}</p>
            <p className="whitespace-pre-wrap font-medium text-stone-200">{turn.question}</p>
            {turn.error?<p role="alert" className="text-red-300">{turn.error}</p>:
              turn.response?<div className="space-y-2">
                {turn.response.summary&&<p className="whitespace-pre-wrap leading-5 text-stone-200">{turn.response.summary}</p>}
                {turn.response.evidence.map((support,i)=><div key={i} className="rounded border-l-2 border-amber-500 bg-stone-950/50 p-2">
                  <p className="leading-5">{support.statement}</p>
                  <blockquote className="mt-1 whitespace-pre-wrap text-stone-400">“{support.quote}”</blockquote>
                  <div className="mt-2 flex gap-2">
                    {support.page!=null&&<button type="button" className="text-amber-300 underline underline-offset-2"
                      onClick={()=>onJumpToPage(support.page!)}>[DOC p.{support.page}]</button>}
                    {support.provenance.annotationId&&<button type="button" className="text-amber-300 underline underline-offset-2"
                      onClick={()=>onFocusAnnotation(support.provenance.annotationId!)}>Annotation</button>}
                  </div>
                </div>)}
                {turn.response.unansweredQuestions.length>0&&<div className="text-stone-400">
                  <strong className="text-stone-300">Open questions</strong>
                  {turn.response.unansweredQuestions.map((q,i)=><p key={i}>• {q}</p>)}
                </div>}
                {turn.response.warnings.map((warning,i)=><p className="text-amber-300" key={i}>{warning}</p>)}
              </div>:<p role="status" className="text-stone-400">NVIDIA is processing the selected source…</p>}
          </article>)}
          <div ref={scrollEnd}/>
        </div>

        <section className="shrink-0 space-y-2 border-t border-stone-800 p-3">
          {!statusIsNvidia(status)&&<div className="space-y-2 rounded-lg border border-amber-500/30 p-2 text-xs">
            <p className="text-amber-200">Connect an NVIDIA NIM BYOK model to ask questions.</p>
            <button type="button" className="text-amber-300 underline" onClick={()=>setConnectOpen(old=>!old)}>
              {connectOpen?"Hide provider connection":"Connect NVIDIA NIM"}
            </button>
            <button type="button" className="ml-3 text-stone-300 underline" onClick={()=>void refreshStatus()}>Refresh status</button>
          </div>}
          {connectOpen && <div className="max-h-64 overflow-y-auto rounded border border-stone-700 p-1">
            <ByokConnectionPanel scope="user" defaultProviderId="nvidia_nim" onStatusChange={setStatus}/>
          </div>}
          {statusIsNvidia(status)&&<button type="button" className="text-xs text-stone-400 underline" onClick={()=>setConnectOpen(old=>!old)}>
            {connectOpen?"Hide connection settings":"Connection settings"}
          </button>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!canSend} onClick={()=>void send("analyse","")}
              className="rounded border border-amber-500/50 px-2 py-1 text-xs text-amber-200 disabled:opacity-40">Analyse selection</button>
            <button type="button" disabled={!canSend} onClick={()=>void send("ask","Explain this passage, defining technical terms while citing the source.")}
              className="rounded border border-stone-600 px-2 py-1 text-xs disabled:opacity-40">Explain passage</button>
            <span className="self-center text-[11px] text-stone-500">Extraction / matching / web research: later phases</span>
          </div>
          <label className="flex items-start gap-2 text-[11px] leading-4 text-stone-400">
            <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}
              aria-label="Consent to send selected source text to NVIDIA" className="mt-0.5"/>
            <span>I agree to send this selected source text to my NVIDIA NIM provider. API usage may be billed.</span>
          </label>
          {error&&<p role="alert" className="text-xs text-red-300">{error}</p>}
          <form onSubmit={e=>{e.preventDefault();void send("ask",question);}} className="flex items-end gap-2">
            <textarea aria-label="Ask Copilot" value={question} onChange={e=>setQuestion(e.target.value)}
              maxLength={1500} rows={2} placeholder="Ask about this page or annotation…"
              className="min-h-12 max-h-28 flex-1 resize-y rounded border border-stone-700 bg-stone-950 p-2 text-sm text-white"
              onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void send("ask",question);}}}/>
            <button type="submit" disabled={!canSend||!question.trim()}
              className="rounded bg-amber-600 px-3 py-2 text-xs font-semibold text-stone-950 disabled:opacity-40">
              {pending?"Working…":"Send"}
            </button>
          </form>
          <p className="text-[11px] text-stone-500">Read-only AI suggestions · not saved · analyst review required</p>
        </section>
      </div>
    </>:null}
    {!mobile&&!geometry.docked&&!geometry.minimized&&<div
      role="separator" aria-label="Resize AI Copilot" data-testid="copilot-resize-handle"
      className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize touch-none border-b-2 border-r-2 border-amber-500/70"
      onPointerDown={event=>begin(event,"resize")} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
    />}
  </div>;
}

function windowWidthFallback() {
  return typeof window === "undefined" ? 440 : window.innerWidth;
}
