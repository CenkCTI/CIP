"use client";
import type {ClaimComparisonOutcome} from "@/lib/ai/research/claim-comparison";
import type {SkippedComparisonSource} from "@/lib/ai/research/comparison-fetch";

export function ClaimComparisonReview({result,onNavigate}:{
  result:ClaimComparisonOutcome;onNavigate?:(page:number,annotationId?:string)=>void;
}){
  const statusNames={unavailable:"Site unavailable or access denied",timeout:"Fetch timed out",
    unsupported:"Unsupported content type",too_large:"Content exceeds size limit",
    no_text:"No readable text found"} as const;
  function SkippedSources({sources}:{sources:SkippedComparisonSource[]}){
    return <div data-testid="unreadable-comparison-sources" className="space-y-2">
      <p className="font-semibold">Selected sources that could not be read</p>
      {sources.map(item=><div key={item.url} className="rounded border border-[var(--line-neutral)] p-2">
        <a href={item.url} rel="noopener noreferrer" target="_blank"
          className="break-all text-[var(--amber-soft)]">{item.url} ↗</a>
        <p className="mt-1 text-[var(--muted-strong)]">{statusNames[item.reason]}</p>
      </div>)}
      <p>Unreadable sources were excluded, not counted as evidence for or against the claim.
        Choose another public HTML source or retry a different report.</p>
    </div>;
  }
  if(result.status==="sources_unavailable"){
    return <section data-testid="claim-comparison-review" aria-label="Claim comparison review"
      className="space-y-3 rounded border border-[var(--amber-dark)] p-3 text-xs">
      <p className="font-semibold text-[var(--amber-soft)]">No web pages could be read</p>
      <p>Comparison was not performed. No evidence or intelligence record was created.</p>
      <SkippedSources sources={result.skippedSources}/>
    </section>;
  }
  const labels={supports:"Potential support",contradicts:"Potential contradiction",
    qualifies:"Qualification / narrower claim",insufficient_evidence:"No direct evidence"};
  return <section aria-label="Claim comparison review" data-testid="claim-comparison-review"
    className="space-y-3 rounded border border-[var(--amber-dark)] p-3 text-xs">
    <div>
      <p className="font-semibold text-[var(--amber-soft)]">Claim comparison · AI suggestion · Not saved</p>
      <p className="mt-1">Review the exact PDF and WEB excerpts before drawing conclusions.</p>
    </div>
    <div className="rounded border border-[var(--line-neutral)] p-3">
      <p className="font-semibold">Proposition referenced in the original PDF</p>
      {result.pdfClaim.originKind==="attributed_or_question"?
        <p className="mt-1 font-semibold text-[var(--amber-soft)]">
          Question / attributed claim — not an established fact
        </p>:null}
      <p className="mt-1">{result.pdfClaim.paraphrase}</p>
      <blockquote className="mt-2 border-l-2 border-[var(--amber-dark)] pl-2">{result.pdfClaim.quote}</blockquote>
      <div className="mt-2 flex items-center gap-2 text-[var(--muted-strong)]">
        <span>{result.pdfClaim.sourceToken} · PDF {result.pdfClaim.page==null?"annotation":"p."+result.pdfClaim.page}</span>
        {result.pdfClaim.page!=null&&onNavigate?
          <button type="button" className="underline" onClick={()=>
            onNavigate(result.pdfClaim.page!,result.pdfClaim.annotationId)}>
            Go to PDF evidence
          </button>:null}
      </div>
    </div>
    <div className="space-y-2">
      <p className="font-semibold">External source comparison</p>
      {result.rows.map(row=><article key={row.sourceToken}
        className="rounded border border-[var(--line-neutral)] p-3">
        <p className="font-semibold">{row.sourceToken} · {row.verifiedQuote?
          labels[row.relationship]:"Comparison not verified"}</p>
        <a href={row.url} target="_blank" rel="noopener noreferrer"
          className="mt-1 block break-all text-[var(--amber-soft)]">{row.title} · {row.domain} ↗</a>
        <p className="mt-1 text-[var(--muted)]">Retrieved {row.retrievedAt}</p>
        {row.verifiedQuote&&row.quote?
          <blockquote className="mt-2 border-l-2 border-[var(--amber-dark)] pl-2">{row.quote}</blockquote>:
          <p className="mt-2">{row.evidenceStatus==="rejected_quote"?
            "An AI-proposed web quotation could not be verified against the fetched page.":
            "The AI did not provide a direct quotation for this source."}
            {" "}This does not establish whether the page contains relevant evidence.
          </p>}
        <p className="mt-2">{row.explanation}</p>
        {row.limitation?<p className="mt-1 text-[var(--muted)]">Limitation: {row.limitation}</p>:null}
      </article>)}
    </div>
    {result.skippedSources.length>0?<SkippedSources sources={result.skippedSources}/>:null}
    {result.discarded>0?<p>{result.discarded} unsupported web excerpt(s) discarded.</p>:null}
    {result.openQuestions.length>0?<div>
      <p className="font-semibold">Outstanding questions</p>
      {result.openQuestions.map((q,i)=><p key={i} className="mt-1">• {q}</p>)}
    </div>:null}
    {result.warnings.map((warning,i)=>
      <p key={i} className="text-[var(--amber-soft)]">{warning}</p>)}
    <p className="font-semibold">Analyst review required · No intelligence records created.</p>
  </section>;
}
