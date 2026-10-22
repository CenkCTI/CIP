"use client";

import type { Stage3Candidate, Stage3CandidateResponse } from "@/lib/ai/stage3/candidates";

function title(candidate:Stage3Candidate){
  switch(candidate.kind){
    case "SOURCE_CLAIM": return candidate.claim;
    case "INDICATOR": return candidate.value;
    case "TIMELINE": return candidate.eventName;
    case "MALWARE":case "THREAT_ACTOR":case "CAMPAIGN": return candidate.name;
    case "CVE":return candidate.cveId;
    case "MITRE":return candidate.techniqueId;
    case "ATTRIBUTION_CLAIM":return candidate.attributionText;
    case "UNANSWERED_QUESTION":return candidate.question;
  }
}
const kindLabel:Record<Stage3Candidate["kind"],string>={
  SOURCE_CLAIM:"Source Claim",INDICATOR:"Indicator",TIMELINE:"Timeline",
  MALWARE:"Malware",CVE:"CVE",MITRE:"MITRE ATT&CK",THREAT_ACTOR:"Threat Actor",
  CAMPAIGN:"Campaign",ATTRIBUTION_CLAIM:"Attribution Claim",
  UNANSWERED_QUESTION:"Unanswered Question",
};

export function CopilotCandidates({result,dismissed,onDismiss,onReview,onNavigate}:{
  result:Stage3CandidateResponse;
  dismissed:Set<string>;
  onDismiss:(id:string)=>void;
  onReview:(candidate:Stage3Candidate)=>void;
  onNavigate:(page:number,annotationId?:string,quote?:string)=>void;
}){
  const active=result.candidates.filter((candidate)=>!dismissed.has(candidate.candidateId));
  return <section aria-label="AI candidate suggestions" className="mx-auto w-full max-w-3xl space-y-3 p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold tracking-wide text-[var(--amber-soft)]">Processing suggestions</h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted-strong)]">
          {active.length} source-supported candidate{active.length===1?"":"s"} · AI suggestions only · Not saved
        </p>
      </div>
      <span className="rounded border border-[var(--line)] px-2 py-1 text-[10px] text-[var(--muted-strong)]">ANALYST REVIEW REQUIRED</span>
    </div>
    {active.map((candidate)=><article key={candidate.candidateId} data-testid="stage3-candidate"
      className="space-y-3 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold uppercase tracking-[.12em] text-[var(--amber-soft)]">{kindLabel[candidate.kind]}</span>
        <span className="text-[var(--muted-strong)]">{candidate.derivation} · NOT SAVED</span>
      </div>
      <p className="break-words text-sm leading-6 text-[var(--foreground)]">{title(candidate)}</p>
      {candidate.kind==="SOURCE_CLAIM" ? <p className="text-xs text-[var(--muted-strong)]">
        {candidate.claimType} · {candidate.stance}{candidate.sourceQualifier? ` · ${candidate.sourceQualifier}`:""}
      </p>:null}
      {candidate.kind==="TIMELINE" ? <p className="text-xs text-[var(--muted-strong)]">
        Source time: {candidate.sourceTimeExpression || "Not specified"} · {candidate.temporalPrecision}
      </p>:null}
      {candidate.caveats.length ? <ul className="list-inside list-disc text-xs leading-5 text-[var(--muted-strong)]">
        {candidate.caveats.map((caveat,index)=><li key={index}>{caveat}</li>)}
      </ul>:null}
      {candidate.existingMatches?.length ? <div className="rounded border border-[var(--line)] bg-[var(--amber-tint)] p-2.5 text-xs text-[var(--amber-soft)]">
        <p className="font-medium">{candidate.existingMatches.length} existing Investigation record(s) may match</p>
        <ul className="mt-1 space-y-1">
          {candidate.existingMatches.map((existing)=><li key={existing.id}>
            {existing.matchType==="POSSIBLE"?"Possible similar claim":"Exact field match"} · {existing.label}
          </li>)}
        </ul>
        <p className="mt-1 text-[var(--muted-strong)]">Review whether to link instead of creating a duplicate. No automatic merge.</p>
      </div>:null}
      {candidate.matchStatus==="UNAVAILABLE" ? <p className="text-xs text-[var(--amber-soft)]">
        Existing-record comparison unavailable. Check manually before saving.
      </p>:null}
      <details className="rounded border border-[var(--line-neutral)] bg-[var(--surface-input)] p-2.5">
        <summary className="cursor-pointer text-xs text-[var(--amber-soft)]">Verified source support · {candidate.verifiedSupport.length}</summary>
        <div className="mt-2 space-y-3">
          {candidate.verifiedSupport.map((evidence,index)=><div key={index} className="space-y-2 border-t border-[var(--line-neutral)] pt-2">
            <blockquote className="border-l-2 border-[var(--amber)] pl-2 text-xs leading-5 text-[var(--foreground)]">{evidence.quote}</blockquote>
            {evidence.page ? <button type="button"
              className="text-xs text-[var(--amber-soft)] underline underline-offset-2"
              onClick={()=>onNavigate(evidence.page!,evidence.provenance.annotationId,evidence.quote)}>
              PDF page {evidence.page} ↗
            </button>:null}
          </div>)}
        </div>
      </details>
      <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--line-neutral)] pt-3">
        <button type="button" className="rounded border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted-strong)] hover:text-[var(--foreground)]"
          onClick={()=>onDismiss(candidate.candidateId)}>Dismiss</button>
        {candidate.kind==="UNANSWERED_QUESTION"
          ? <button type="button" className="rounded border border-[var(--amber-dark)] px-3 py-1.5 text-xs text-[var(--amber-soft)]"
              onClick={()=>{const evidence=candidate.verifiedSupport[0];if(evidence?.page)
                onNavigate(evidence.page,evidence.provenance.annotationId,evidence.quote);}}>
              View source
            </button>
          : <button type="button" className="rounded border border-[var(--amber-dark)] bg-[var(--amber-tint)] px-3 py-1.5 text-xs font-semibold text-[var(--amber-soft)] hover:bg-[var(--amber-glow)]"
              onClick={()=>onReview(candidate)}>Review in Process</button>}
      </div>
    </article>)}
    {result.discarded>0?<p role="note" className="text-xs text-[var(--amber-soft)]">
      {result.discarded} unsupported suggestion(s) discarded. No unverifiable candidate was shown.
    </p>:null}
    {result.warnings.map((warning,index)=><p key={index} role="note" className="text-xs text-[var(--muted-strong)]">{warning}</p>)}
  </section>;
}
