"use client";
import {useState} from "react";
import {ClaimComparisonReview} from "./claim-comparison-review";
import {EvidenceTextFocus} from "./evidence-text-focus";
import type {ClaimComparisonOutcome} from "@/lib/ai/research/claim-comparison";
import type {CopilotContext} from "./copilot-context-selector";
import type {ResearchSearchResult,ResearchEvidence} from "@/lib/ai/research/types";

type Synthesis={
  summary:string; evidence:ResearchEvidence[];discarded:number;
  differences:string[];unansweredQuestions:string[];warnings:string[];
};
type ErrorPayload={code?:string;error?:string};
export function ControlledWebResearch({projectId,sourceId,assetId,context,connected,onNavigate}:{
  projectId:string;sourceId:string;assetId:string;context:CopilotContext;connected:boolean;
  onNavigate?:(page:number,annotationId?:string,quote?:string)=>void;
}){
  const [open,setOpen]=useState(false);
  const [question,setQuestion]=useState("");
  const [queries,setQueries]=useState<string[]>([]);
  const [approved,setApproved]=useState<Set<number>>(()=>new Set());
  const [results,setResults]=useState<ResearchSearchResult[]>([]);
  const [synthesis,setSynthesis]=useState<Synthesis|null>(null);
  const [compareSelection,setCompareSelection]=useState<Set<number>>(()=>new Set());
  const [comparison,setComparison]=useState<ClaimComparisonOutcome|null>(null);
  const [comparisonContext,setComparisonContext]=useState("");
  const [busy,setBusy]=useState<"plan"|"search"|"read"|"compare"|null>(null);
  const contextKey=JSON.stringify({sourceId,assetId,context});
  const [error,setError]=useState("");
  const base="/api/projects/"+projectId+"/";
  async function post<T>(url:string,data:unknown):Promise<T>{
    const response=await fetch(base+url,{method:"POST",
      headers:{"content-type":"application/json"},body:JSON.stringify(data),cache:"no-store"});
    const body=await response.json() as T&ErrorPayload;
    if(!response.ok)throw new Error((body.error??body.code??"Research request failed.").slice(0,280));
    return body;
  }
  async function runPlan(){
    if(busy||context.kind==="document"||!connected)return;
    setBusy("plan");setError("");setSynthesis(null);setComparison(null);
    setCompareSelection(new Set());setResults([]);
    try{
      const out=await post<{queries:string[]}>("ai/processing/research/plan",{
        sourceId,assetId,context,question:question.trim(),byokConsent:true,
      });
      setQueries(out.queries);setApproved(new Set(out.queries.map((_,i)=>i)));
    }catch(e){setError(e instanceof Error?e.message:"Unable to suggest queries.");}
    finally{setBusy(null);}
  }
  async function runSearch(){
    if(busy||!approved.size)return;
    setBusy("search");setError("");setResults([]);setSynthesis(null);
    setComparison(null);setCompareSelection(new Set());
    try{
      const selection=queries.filter((_,i)=>approved.has(i));
      const out=await post<{results:ResearchSearchResult[]}>("research/search",{queries:selection});
      setResults(out.results);
    }catch(e){setError(e instanceof Error?e.message:"Search failed.");}
    finally{setBusy(null);}
  }
  async function runRead(result:ResearchSearchResult){
    if(busy||!connected)return;
    setBusy("read");setError("");setSynthesis(null);
    try{
      const out=await post<{result:Synthesis}>("ai/processing/research/synthesize",{
        urls:[result.url],question:question.trim()||
          "Compare this external reporting to the currently investigated topic.",
        byokConsent:true,
      });
      setSynthesis(out.result);
    }catch(e){setError(e instanceof Error?e.message:"Cannot read this public page.");}
    finally{setBusy(null);}
  }
  async function runCompare(){
    if(busy||!connected||context.kind==="document"||!compareSelection.size)return;
    const selection=results.filter((_,i)=>compareSelection.has(i)).slice(0,3);
    const requestContext=contextKey;
    setBusy("compare");setError("");setComparison(null);
    try{
      const out=await post<{result:ClaimComparisonOutcome}>("ai/processing/research/compare",{
        sourceId,assetId,context,question:question.trim()||
          "Assess the selected PDF claim against these outside sources.",
        urls:selection.map(item=>item.url),byokConsent:true,
      });
      setComparison(out.result);setComparisonContext(requestContext);
    }catch(e){setError(e instanceof Error?e.message:"Claim comparison could not be verified.");}
    finally{setBusy(null);}
  }
  const prefill=(result:ResearchSearchResult)=>{
    const params=new URLSearchParams({
      research_url:result.url,research_title:result.title,
      research_publisher:result.publisher,
      research_rationale:"Analyst-selected external web research lead. Verify relevance and source reliability.",
    });
    return "/projects/"+projectId+"/sources?"+params.toString();
  };
  return <section className="border-b border-[var(--line-neutral)] px-4 py-3"
    aria-label="Controlled Web Research" data-testid="controlled-web-research">
    <button type="button" onClick={()=>setOpen(o=>!o)}
      aria-expanded={open} aria-controls="controlled-web-research-content"
      className="flex min-h-9 w-full items-center justify-between rounded border border-[var(--amber-dark)] bg-[var(--amber-tint)] px-3 py-2 text-left text-xs font-semibold text-[var(--amber-soft)] hover:bg-[var(--amber-glow)]">
      <span>{open?"▾":"▸"} Controlled Web Research</span>
      <span className="font-normal">AI Faz 5</span>
    </button>
    {open?<div id="controlled-web-research-content" className="mt-3 space-y-3">
      <p className="text-xs text-[var(--muted)]">
        AI proposes searches, but only your Search selected action contacts the search provider.
        External web text is untrusted and never saves a Source automatically.
      </p>
      <label className="block text-xs text-[var(--muted-strong)]">
        Research question
        <input value={question} onChange={e=>setQuestion(e.target.value)}
          maxLength={300} placeholder="What should external reporting help verify?"
          className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--surface-input)] px-2 py-2"/>
      </label>
      <button type="button" disabled={busy!==null||!connected||context.kind==="document"}
        onClick={()=>void runPlan()}
        className="rounded border border-[var(--line)] px-3 py-1.5 text-xs disabled:opacity-50">
        {busy==="plan"?"Preparing suggestions…":"Suggest searches"}
      </button>
      {context.kind==="document"?<p className="text-xs text-[var(--amber-soft)]">
        Select a PDF page, page range or annotation before planning web research.
      </p>:null}
      {queries.length>0?<div className="space-y-2" data-testid="web-search-suggestions">
        <p className="text-xs font-semibold">Suggested searches · not searched yet</p>
        {queries.map((q,i)=><label key={i} className="flex gap-2 text-xs">
          <input type="checkbox" checked={approved.has(i)}
            onChange={e=>setApproved(prev=>{
              const n=new Set(prev);if(e.target.checked)n.add(i);else n.delete(i);return n;
            })}/>
          <span>{q}</span>
        </label>)}
        <button type="button" onClick={()=>void runSearch()} disabled={busy!==null||!approved.size}
          className="rounded border border-[var(--amber-dark)] bg-[var(--amber-tint)] px-3 py-2 text-xs font-semibold text-[var(--amber-soft)] disabled:opacity-50">
          {busy==="search"?"Searching…":"Search selected"}
        </button>
      </div>:null}
      {results.length>0?<div className="space-y-2" data-testid="web-research-results">
        <div className="rounded border border-[var(--line-neutral)] p-3">
          <p className="font-semibold">AI Faz 6 · Claim-centric comparison</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Select up to 3 external sources below, then explicitly compare them
            against the current PDF page or annotation. For stronger comparison, choose
            2–3 reports using different methods, rather than only an encyclopedia entry.
            A missing quotation means not verified, not necessarily unsupported.
            No automatic verdict or Source writes.
          </p>
          <button type="button" onClick={()=>void runCompare()}
            disabled={busy!==null||!connected||context.kind==="document"||!compareSelection.size}
            className="mt-2 rounded border border-[var(--amber-dark)] bg-[var(--amber-tint)] px-3 py-2 text-xs font-semibold text-[var(--amber-soft)] disabled:opacity-50">
            {busy==="compare"?"Comparing selected sources…":
              "Compare selected with PDF ("+compareSelection.size+"/3)"}
          </button>
        </div>
        <p className="text-xs font-semibold">Search results · external leads, not evidence</p>
        {results.map((r,i)=><article key={r.url+"-"+i}
          className="rounded border border-[var(--line-neutral)] p-3 text-xs">
          <label className="mb-2 flex items-center gap-2 font-medium">
            <input type="checkbox" aria-label={"Compare: "+r.title}
              checked={compareSelection.has(i)}
              disabled={!compareSelection.has(i)&&compareSelection.size>=3}
              onChange={e=>setCompareSelection(current=>{
                const next=new Set(current);
                if(e.target.checked&&next.size<3)next.add(i);
                if(!e.target.checked)next.delete(i);
                return next;
              })}/>
            Include in PDF comparison
          </label>
          <p className="font-semibold">{r.title}</p>
          <p className="mt-1 break-all text-[var(--muted)]">{r.domain}</p>
          <EvidenceTextFocus kind="lead" label={"Focus search lead "+(i+1)}>
            <p className="mt-1">{r.snippet}</p>
            <p className="mt-1 text-[10px] text-[var(--muted)]">Brave search snippet · not verified evidence</p>
          </EvidenceTextFocus>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[var(--amber-soft)]">
            <a href={r.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center rounded border border-[var(--line)] px-3 py-2 font-medium hover:border-[var(--amber-dark)]">
              Open ↗
            </a>
            <button type="button" aria-label={"Read with AI: "+r.title}
              disabled={busy!==null||!connected}
              data-testid="web-read-with-ai"
              className="inline-flex min-h-9 items-center rounded border border-[var(--amber-dark)] bg-[var(--amber-tint)] px-3 py-2 font-semibold text-[var(--amber-soft)] hover:bg-[var(--amber-glow)] disabled:opacity-50"
              onClick={()=>void runRead(r)}>
              {busy==="read"?"Reading…":"Read with AI"}
            </button>
            <a href={prefill(r)} target="_blank" rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center rounded border border-[var(--line)] px-3 py-2 font-medium hover:border-[var(--amber-dark)]">
              Add to Collection ↗
            </a>
          </div>
        </article>)}
      </div>:null}
      {comparison&&comparisonContext===contextKey?
        <ClaimComparisonReview result={comparison} onNavigate={onNavigate}/>:null}
      {synthesis?<section className="rounded border border-[var(--line-neutral)] p-3 text-xs"
        data-testid="web-research-synthesis">
        <p className="mb-2 font-semibold">External reporting · analyst review required</p>
        <p className="whitespace-pre-wrap">{synthesis.summary}</p>
        {synthesis.evidence.map((e,i)=><div className="mt-3" key={e.sourceToken+"-"+i}>
          <p>{e.statement}</p>
          <EvidenceTextFocus label={"Focus "+e.sourceToken+" excerpt"}>
            <blockquote className="mt-1 border-l-2 border-[var(--amber-dark)] pl-2">{e.quote}</blockquote>
          </EvidenceTextFocus>
          <a href={e.url} target="_blank" rel="noopener noreferrer"
            className="mt-1 block break-all text-[var(--amber-soft)]">
            {e.sourceToken} · {e.domain} · retrieved {e.retrievedAt} ↗
          </a>
        </div>)}
        {synthesis.discarded?<p className="mt-2">
          {synthesis.discarded} unsupported web quote(s) discarded.
        </p>:null}
        {synthesis.differences.map((x,i)=><p className="mt-2" key={"d"+i}>Difference: {x}</p>)}
        {synthesis.unansweredQuestions.map((x,i)=><p className="mt-2" key={"q"+i}>Open question: {x}</p>)}
        {synthesis.warnings.map((x,i)=><p className="mt-2 text-[var(--amber-soft)]" key={"w"+i}>{x}</p>)}
      </section>:null}
      {error?<p role="alert" className="text-xs text-[var(--danger)]">{error}</p>:null}
      <p className="text-[11px] text-[var(--muted)]">
        Add to Collection opens the normal Source form with editable suggestions.
        The analyst must explicitly submit Add URL Source. No domain records are created here.
      </p>
    </div>:null}
  </section>;
}
