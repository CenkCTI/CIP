"use client";
import type {ClaimComparisonResult} from "@/lib/ai/research/claim-comparison";

export function ClaimComparisonReview({result,onNavigate}:{
  result:ClaimComparisonResult;onNavigate?:(page:number,annotationId?:string)=>void;
}){
  const labels={supports:"Potential support",contradicts:"Potential contradiction",
    qualifies:"Qualification / narrower claim",insufficient_evidence:"No direct evidence"};
  return <section aria-label="Claim comparison review" data-testid="claim-comparison-review"
    className="space-y-3 rounded border border-[var(--amber-dark)] p-3 text-xs">
    <div>
      <p className="font-semibold text-[var(--amber-soft)]">Claim comparison · AI suggestion · Not saved</p>
      <p className="mt-1">Review the exact PDF and WEB excerpts before drawing conclusions.</p>
    </div>
    <div className="rounded border border-[var(--line-neutral)] p-3">
      <p className="font-semibold">Claim candidate from the original PDF</p>
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
        <p className="font-semibold">{row.sourceToken} · {labels[row.relationship]}</p>
        <a href={row.url} target="_blank" rel="noopener noreferrer"
          className="mt-1 block break-all text-[var(--amber-soft)]">{row.title} · {row.domain} ↗</a>
        <p className="mt-1 text-[var(--muted)]">Retrieved {row.retrievedAt}</p>
        {row.verifiedQuote&&row.quote?
          <blockquote className="mt-2 border-l-2 border-[var(--amber-dark)] pl-2">{row.quote}</blockquote>:
          <p className="mt-2">No verified supporting web excerpt.</p>}
        <p className="mt-2">{row.explanation}</p>
        {row.limitation?<p className="mt-1 text-[var(--muted)]">Limitation: {row.limitation}</p>:null}
      </article>)}
    </div>
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
