"use client";
import { useMemo,useState } from "react";
import { CopilotCandidates } from "./copilot-candidates";
import type { Stage3Candidate } from "@/lib/ai/stage3/candidates";
import type { DocumentScanView } from "./use-document-extraction";
const candidateKinds=["SOURCE_CLAIM","INDICATOR","TIMELINE","MALWARE","CVE","MITRE",
  "THREAT_ACTOR","CAMPAIGN","ATTRIBUTION_CLAIM","UNANSWERED_QUESTION"] as const;

export function DocumentProcessingReview({view,working,dismissed,onDismiss,onReview,onNavigate,onResume,onCancel}:{
  view:DocumentScanView;working:boolean;dismissed:Set<string>;
  onDismiss:(id:string)=>void;onReview:(candidate:Stage3Candidate)=>void;
  onNavigate:(page:number,annotationId?:string)=>void;
  onResume:(retryFailed:boolean)=>void;onCancel:()=>void;
}){
  const [filter,setFilter]=useState("ALL");
  const counts=useMemo(()=>{
    const totals:Record<string,number>={};
    for(const c of view.result.candidates)if(!dismissed.has(c.candidateId))
      totals[c.kind]=(totals[c.kind]??0)+1;
    return totals;
  },[view.result.candidates,dismissed]);
  const filtered=view.result.candidates.filter(c=>!dismissed.has(c.candidateId) &&
    (filter==="ALL"||c.kind===filter));
  const result={...view.result,candidates:filtered};
  return <section aria-label="Document Processing Review"
    data-testid="document-processing-review" className="border-b border-[var(--line-neutral)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-[var(--amber-soft)]">DOCUMENT PROCESSING REVIEW</h3>
      <span className="text-xs text-[var(--muted)]">AI suggestions · NOT SAVED</span>
    </div>
    <p role="status" className="mt-2 text-xs text-[var(--muted-strong)]">
      {view.completed} / {view.total} chunks verified · {view.empty} empty ·
      {view.failed.length} failed · {view.pending} pending ·
      {view.result.candidates.length} candidate suggestions · {view.status}
    </p>
    {view.total>0?<progress aria-label="Document chunk progress" className="mt-2 w-full"
      value={view.completed} max={view.total}/> :null}
    {view.error?<p role="alert" className="mt-2 text-xs text-[var(--danger)]">{view.error}</p>:null}
    {view.failed.length?<div className="mt-2 text-xs text-[var(--amber-soft)]">
      Unverified chunks: {view.failed.map(x=>"p."+x.pages+" ("+x.code+")").join(", ")}.
      These were NOT counted as processed.
    </div>:null}
    <div className="mt-2 flex flex-wrap gap-2">
      {working?<button type="button" onClick={onCancel}
        className="rounded border border-[var(--line)] px-2 py-1 text-xs">Cancel document scan</button>:null}
      {!working && view.pending>0?<button type="button" onClick={()=>onResume(false)}
        className="rounded border border-[var(--line)] px-2 py-1 text-xs">Continue document scan</button>:null}
      {!working && view.failed.length>0?<button type="button" onClick={()=>onResume(true)}
        className="rounded border border-[var(--line)] px-2 py-1 text-xs">Retry failed chunks</button>:null}
    </div>
    {view.result.candidates.length>0?<div className="mt-3">
      <label className="text-xs text-[var(--muted-strong)]" htmlFor="document-kind-filter">Candidate type</label>
      <select id="document-kind-filter" value={filter} onChange={e=>setFilter(e.target.value)}
        className="ml-2 rounded border border-[var(--line)] bg-[var(--surface-input)] p-1 text-xs">
        <option value="ALL">All ({Object.values(counts).reduce((a,b)=>a+b,0)})</option>
        {candidateKinds.map(kind=><option key={kind} value={kind}>
          {kind.replaceAll("_"," ")} ({counts[kind]??0})
        </option>)}
      </select>
      <CopilotCandidates result={result} dismissed={dismissed} onDismiss={onDismiss}
        onReview={onReview} onNavigate={onNavigate}/>
    </div>:<p className="mt-2 text-xs text-[var(--muted)]">
      No verified candidate suggestions in completed chunks.
    </p>}
    <p className="mt-2 text-[11px] text-[var(--muted)]">
      Source extracts are verified against the original PDF. This does not establish
      analytical truth. Only explicit analyst Create/Link in Process saves domain records.
      Progress is held in this open Copilot session; refresh loses the queue.
    </p>
  </section>;
}
