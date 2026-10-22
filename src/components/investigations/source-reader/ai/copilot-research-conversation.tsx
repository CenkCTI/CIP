"use client";

import {useEffect,useRef,useState} from "react";
import {CopilotChat,type CopilotResult,type CopilotTurn} from "./copilot-chat";
import type {CopilotContext} from "./copilot-context-selector";
import type {ResearchSearchResult} from "@/lib/ai/research/types";

type ResearchStep="planning"|"suggestions"|"searching"|"results"|"analysing"|"complete";
type Response<T>=T&{error?:string;code?:string};
export type ResearchSession={id:number;question:string;context:CopilotContext;sourceId:string;assetId:string};
export function CopilotResearchConversation({projectId,sourceId,assetId,session,
  responseLanguage,useSource,onNavigate}:{
    projectId:string;sourceId:string;assetId:string;session:ResearchSession;
    responseLanguage:"auto"|"tr"|"en";useSource:boolean;
    onNavigate:(page:number,annotationId?:string,quote?:string)=>void;
  }){
  const [step,setStep]=useState<ResearchStep>("planning");
  const [queries,setQueries]=useState<string[]>([]);
  const [approved,setApproved]=useState<Set<number>>(()=>new Set());
  const [results,setResults]=useState<ResearchSearchResult[]>([]);
  const [selected,setSelected]=useState<Set<number>>(()=>new Set());
  const [result,setResult]=useState<CopilotResult|null>(null);
  const [error,setError]=useState("");
  const mounted=useRef(true);
  const base="/api/projects/"+projectId+"/";
  async function post<T>(route:string,input:object,signal?:AbortSignal):Promise<T>{
    const response=await fetch(base+route,{method:"POST",
      headers:{"content-type":"application/json"},body:JSON.stringify(input),
      cache:"no-store",signal});
    const payload=await response.json() as Response<T>;
    if(!response.ok)throw new Error(payload.error||payload.code||"Research request failed.");
    return payload;
  }
  useEffect(()=>{
    mounted.current=true;
    const controller=new AbortController();
    void (async()=>{
      try{
        // A planning call is allowed by selecting Research mode and submitting a
        // question, but it NEVER searches the web. Search requires a button press.
        const out=await post<{queries:string[]}>("ai/processing/research/plan",{
          sourceId,assetId,context:session.context,
          question:session.question.slice(0,300),byokConsent:true,
        },controller.signal);
        if(!mounted.current||controller.signal.aborted)return;
        setQueries(out.queries.slice(0,3));
        setApproved(new Set(out.queries.slice(0,3).map((_,index)=>index)));
      }catch(cause){
        if(!controller.signal.aborted&&mounted.current)
          setError(cause instanceof Error?cause.message:"Could not prepare search suggestions.");
      }finally{
        if(!controller.signal.aborted&&mounted.current)setStep("suggestions");
      }
    })();
    return()=>{mounted.current=false;controller.abort();};
  },[projectId,sourceId,assetId,session.id,session.question,session.context]);
  async function search(){
    if(step==="searching"||step==="analysing"||!approved.size)return;
    setError("");setStep("searching");
    try{
      const out=await post<{results:ResearchSearchResult[]}>("research/search",{
        queries:queries.filter((_,index)=>approved.has(index)),
      });
      if(!mounted.current)return;
      setResults(out.results);
      setSelected(new Set(out.results.slice(0,2).map((_,index)=>index)));
      setStep("results");
    }catch(cause){
      if(mounted.current){
        setError(cause instanceof Error?cause.message:"Search unavailable.");
        setStep("suggestions");
      }
    }
  }
  async function assess(){
    if(step!=="results"||!selected.size)return;
    setError("");setStep("analysing");
    try{
      const urls=results.filter((_,index)=>selected.has(index)).map(item=>item.url);
      const out=await post<{result:CopilotResult;saved:boolean}>("ai/processing/analyst-chat",{
        sourceId,assetId,context:session.context,question:session.question,
        responseLanguage,useSource,webResearch:true,selectedUrls:urls,byokConsent:true,
      });
      if(!mounted.current)return;
      setResult(out.result);
      setStep("complete");
    }catch(cause){
      if(mounted.current){
        setError(cause instanceof Error?cause.message:"Could not analyse selected sources.");
        setStep("results");
      }
    }
  }
  return <article className="mx-auto w-full max-w-3xl space-y-4 px-5 py-5 sm:px-7"
    data-testid="copilot-research-conversation">
    <div className="ml-auto max-w-[90%] rounded-2xl border border-[var(--line-neutral)] bg-[var(--surface-raised)] px-4 py-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--amber-soft)]">Web research · analyst question</p>
      <p className="whitespace-pre-wrap break-words text-sm">{session.question}</p>
    </div>
    <div className="space-y-3 rounded-2xl border border-[var(--line-neutral)] bg-[var(--surface-panel)] p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-[var(--amber-soft)]">CİTEM · Research</h3>
        <span className="text-[10px] text-[var(--muted)]">Unverified external leads</span>
      </div>
      {step==="planning"?<p role="status" className="text-xs text-[var(--muted-strong)]">Preparing suggested searches…</p>:null}
      {queries.length>0 && (step==="suggestions"||step==="searching") ? <div className="space-y-3"
        data-testid="copilot-inline-search-suggestions">
        <p className="text-xs text-[var(--muted-strong)]">Suggested search queries. Nothing is searched until you approve.</p>
        {queries.map((query,index)=><label key={index} className="flex items-start gap-2 text-xs">
          <input type="checkbox" checked={approved.has(index)} aria-label={"Search query "+(index+1)}
            disabled={step==="searching"}
            onChange={e=>setApproved(previous=>{
              const next=new Set(previous);if(e.target.checked)next.add(index);else next.delete(index);
              return next;
            })}/>
          <span className="break-words">{query}</span>
        </label>)}
        <button type="button" disabled={!approved.size||step==="searching"} onClick={()=>void search()}
          className="rounded-lg bg-[var(--amber-strong)] px-4 py-2 text-xs font-semibold text-[#171106] disabled:opacity-40">
          {step==="searching"?"Searching…":"Search selected"}
        </button>
      </div>:null}
      {step==="suggestions"&&!queries.length?<div className="space-y-2">
        <p className="text-xs text-[var(--muted)]">Query suggestions were unavailable. You can still approve a short search based on your question.</p>
        <button type="button" onClick={()=>{
          const q=session.question.trim().slice(0,180);
          setQueries([q.length>=5?q:q+" research"]);setApproved(new Set([0]));setError("");
        }} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs">
          Use my question as a search query
        </button>
      </div>:null}
      {results.length>0 && ["results","analysing","complete"].includes(step)?
        <section className="space-y-3" data-testid="copilot-inline-search-results">
          <p className="text-xs font-semibold text-[var(--foreground)]">Search results · select up to two for AI analysis</p>
          <div className="space-y-2">
            {results.slice(0,8).map((item,index)=><div key={item.url}
              className="rounded-lg border border-[var(--line-neutral)] bg-[var(--surface-input)] p-3">
              <label className="flex items-start gap-2">
                <input type="checkbox" aria-label={"Select web source: "+item.title}
                  checked={selected.has(index)} disabled={step!=="results"||(!selected.has(index)&&selected.size>=2)}
                  onChange={e=>setSelected(current=>{
                    const next=new Set(current);if(e.target.checked&&next.size<2)next.add(index);
                    else if(!e.target.checked)next.delete(index);return next;
                  })}/>
                <span className="min-w-0 flex-1">
                  <a href={item.url} target="_blank" rel="noopener noreferrer"
                    className="break-words text-xs font-semibold text-[var(--amber-soft)] underline">{item.title} ↗</a>
                  <span className="mt-1 block text-[10px] text-[var(--muted)]">{item.domain} · Search lead, not evidence</span>
                  <span className="mt-1 block text-xs leading-relaxed text-[var(--muted-strong)]">{item.snippet}</span>
                </span>
              </label>
            </div>)}
          </div>
          {step!=="complete"?<button type="button" disabled={!selected.size||step==="analysing"}
            onClick={()=>void assess()}
            className="rounded-lg border border-[var(--amber-dark)] bg-[var(--amber-tint)] px-4 py-2 text-xs font-semibold text-[var(--amber-soft)] disabled:opacity-40">
            {step==="analysing"?"Reading & analysing selected sources…":
              "Read & analyse selected ("+selected.size+")"}
          </button>:null}
        </section>:null}
      {step==="results"&&!results.length?<p className="text-xs text-[var(--muted)]">No search results returned. Refine your question.</p>:null}
      {error?<p role="alert" className="text-xs text-[var(--danger)]">{error}</p>:null}
      {result?<div data-testid="copilot-inline-research-analysis" className="-mx-4 border-t border-[var(--line-neutral)]">
        <CopilotChat turns={[{id:session.id,mode:"research",prompt:session.question,
          context:session.context,result} satisfies CopilotTurn]} onNavigate={onNavigate}/>
      </div>:null}
      <p className="text-[10px] leading-relaxed text-[var(--muted)]">
        Search requests send only approved queries to Brave. PDF and memory are sent to NVIDIA only
        for the selected-source analysis. AI hypotheses remain provisional.
      </p>
    </div>
  </article>;
}
