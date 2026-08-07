"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/form-status";
import {
  addEvidence,
  saveAssessment,
  saveEvaluation,
  saveHypothesis,
  setHypothesisArchived,
  setEvidenceArchived,
  unlinkEvaluation,
} from "@/app/projects/[id]/attribution-actions";

type R = Record<string, unknown>;
const s = (v: unknown) => String(v ?? "");
const input = "w-full rounded border border-stone-700 bg-stone-950 p-2";

export function AssessmentForm({ projectId, campaignId, row, hypotheses }: { projectId: string; campaignId: string; row: R; hypotheses: R[] }) {
  const [conclusion, setConclusion] = useState(s(row.conclusion_type) || "UNRESOLVED");
  return (
    <ActionForm action={saveAssessment.bind(null, projectId, campaignId)}>
      <div className="grid gap-3 md:grid-cols-3">
        <label>Status<select className={input} name="assessment_status" defaultValue={s(row.assessment_status) || "DRAFT"}><option>DRAFT</option><option>ASSESSED</option></select></label>
        <label>Conclusion<select className={input} name="conclusion_type" defaultValue={s(row.conclusion_type) || "UNRESOLVED"} onChange={(event) => setConclusion(event.target.value)}>{["UNRESOLVED","PREFERRED_HYPOTHESIS","MULTIPLE_PLAUSIBLE","INSUFFICIENT_EVIDENCE","ATTRIBUTION_WITHHELD"].map((x)=><option key={x}>{x}</option>)}</select></label>
        <label>Confidence<select className={input} name="confidence" defaultValue={s(row.confidence) || "MEDIUM"}>{["LOW","MEDIUM","HIGH"].map((x)=><option key={x}>{x}</option>)}</select></label>
      </div>
      {conclusion === "PREFERRED_HYPOTHESIS" ? (
        <label>Preferred hypothesis<select className={input} name="preferred_hypothesis_id" defaultValue={s(row.preferred_hypothesis_id)}><option value="">None</option>{hypotheses.map((h)=><option key={s(h.id)} value={s(h.id)}>{s(h.title)} — {s(h.subject_name)}</option>)}</select></label>
      ) : <input type="hidden" name="preferred_hypothesis_id" value="" />}
      {[["current_judgment","Current judgement"],["alternative_explanations","Alternative explanations"],["key_uncertainties","Key uncertainties"],["discriminating_information_needed","Discriminating information needed"]].map(([n,l])=><label key={n}>{l}<textarea className={input} name={n} defaultValue={s(row[n])} /></label>)}
      <label>Assessed at<input className={input} name="assessed_at" type="datetime-local" defaultValue={s(row.assessed_at).slice(0,16)} /></label>
      <SubmitButton>Save explicit judgement</SubmitButton>
    </ActionForm>
  );
}

export function HypothesisForm({ projectId, campaignId, actors, row = {} }: { projectId: string; campaignId: string; actors: R[]; row?: R }) {
  const [subjectKind, setSubjectKind] = useState(s(row.subject_kind) || "UNKNOWN_ACTOR");
  return (
    <ActionForm action={saveHypothesis.bind(null, projectId, campaignId, s(row.id) || undefined)}>
      <div className="grid gap-3 md:grid-cols-2">
        <label>Title<input className={input} name="title" required defaultValue={s(row.title)} /></label>
        <label>Subject kind<select className={input} name="subject_kind" value={subjectKind} onChange={(event)=>setSubjectKind(event.target.value)}>{["EXISTING_THREAT_ACTOR","ACTOR_CLASS","UNKNOWN_ACTOR","NON_ATTRIBUTION_ALTERNATIVE"].map((x)=><option key={x}>{x}</option>)}</select></label>
        {subjectKind === "EXISTING_THREAT_ACTOR" ? (
          <label>Threat Actor (actor hypotheses only)<select className={input} name="threat_actor_id" defaultValue={s(row.threat_actor_id)}><option value="">None</option>{actors.map((a)=><option key={s(a.id)} value={s(a.id)}>{s(a.name)}</option>)}</select></label>
        ) : <input type="hidden" name="threat_actor_id" value="" />}
        {subjectKind !== "EXISTING_THREAT_ACTOR" ? <label>Subject label<input className={input} name="subject_label" defaultValue={s(row.subject_label)} /></label> : <input type="hidden" name="subject_label" value="" />}
        <label>Status<select className={input} name="status" defaultValue={s(row.status) || "DRAFT"}>{["DRAFT","ACTIVE","DISFAVORED","REJECTED"].map((x)=><option key={x}>{x}</option>)}</select></label>
        <label>Confidence<select className={input} name="confidence" defaultValue={s(row.confidence) || "MEDIUM"}>{["LOW","MEDIUM","HIGH"].map((x)=><option key={x}>{x}</option>)}</select></label>
      </div>
      {[["proposition","Proposition"],["analytic_rationale","Analytic rationale"],["key_assumptions","Key assumptions"],["known_weaknesses","Known weaknesses"],["information_gaps","Information gaps"],["status_rationale","Status rationale"]].map(([n,l])=><label key={n}>{l}<textarea className={input} name={n} required={n === "proposition"} defaultValue={s(row[n])} /></label>)}
      <SubmitButton>Save hypothesis</SubmitButton>
    </ActionForm>
  );
}

export function EvidenceForm({ projectId, campaignId, options }: { projectId: string; campaignId: string; options: Record<string,R[]> }) {
  const types = Object.keys(options);
  const [referenceType, setReferenceType] = useState(types[0] ?? "source");
  const records = options[referenceType] ?? [];
  return (
    <ActionForm action={addEvidence.bind(null, projectId, campaignId)}>
      <label>Title<input className={input} name="title" required /></label>
      <label>Relevance note<textarea className={input} name="relevance_note" required /></label>
      <label>Evidence type<select className={input} name="reference_type" value={referenceType} onChange={(event)=>setReferenceType(event.target.value)}>{types.map((x)=><option key={x}>{x}</option>)}</select></label>
      <label>Referenced {referenceType.replaceAll("_"," ")} record<select className={input} name="reference_id" required key={referenceType} defaultValue=""><option value="" disabled>Select a {referenceType.replaceAll("_"," ")} record</option>{records.map((r)=><option key={s(r.id)} value={s(r.id)}>{s(r.label)}</option>)}</select></label>
      <p className="text-xs text-stone-500">Choose the matching type and record. Source URLs are never visited.</p>
      <SubmitButton>Add to shared inventory</SubmitButton>
    </ActionForm>
  );
}

export function EvidenceArchiveForm({ projectId, campaignId, id, archived }: { projectId: string; campaignId: string; id: string; archived: boolean }) {
  return <ActionForm action={setEvidenceArchived.bind(null, projectId, campaignId, id, !archived)}><SubmitButton>{archived ? "Restore evidence" : "Archive evidence"}</SubmitButton></ActionForm>;
}

function EvaluationFields({ initial }: { initial: R }) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <label>Impact<select className={input} name="impact" defaultValue={s(initial.impact) || "NEUTRAL"}><option value="SUPPORTS">Supports (+)</option><option value="CONTRADICTS">Contradicts (−)</option><option value="NEUTRAL">Neutral (~)</option></select></label>
        <label>Diagnostic value<select className={input} name="diagnostic_value" defaultValue={s(initial.diagnostic_value) || "MEDIUM"}>{["LOW","MEDIUM","HIGH"].map((x)=><option key={x}>{x}</option>)}</select></label>
      </div>
      <label>Why does this evidence matter?<textarea className={input} required name="rationale" defaultValue={s(initial.rationale)} placeholder="Briefly explain how this evidence supports, contradicts, or remains neutral." /></label>
    </>
  );
}

export function EvaluationForm({ projectId, campaignId, hypotheses, evidence, initial = {} }: { projectId: string; campaignId: string; hypotheses: R[]; evidence: R[]; initial?: R }) {
  const initialHypothesisId = s(initial.hypothesis_id) || s(hypotheses[0]?.id);
  const [hypothesisId, setHypothesisId] = useState(initialHypothesisId);
  const singleHypothesis = hypotheses.length === 1;
  const singleEvidence = evidence.length === 1;

  if (!hypotheses.length) return <p className="text-sm text-stone-500">Create a hypothesis before evaluating evidence.</p>;
  if (!evidence.length) return <p className="text-sm text-stone-500">Add evidence before evaluating hypotheses.</p>;

  return (
    <div className="space-y-4">
      {!singleHypothesis ? (
        <label>
          Hypothesis to assess
          <select className={input} value={hypothesisId} onChange={(event)=>setHypothesisId(event.target.value)}>
            {hypotheses.map((h)=><option value={s(h.id)} key={s(h.id)}>{s(h.title)}</option>)}
          </select>
        </label>
      ) : (
        <p className="rounded border border-stone-800 bg-black/10 px-3 py-2 text-sm text-stone-300"><span className="text-stone-500">Hypothesis:</span> {s(hypotheses[0].title)}</p>
      )}
      <p className="text-xs leading-5 text-stone-500">One hypothesis can be evaluated against multiple evidence items. Each evidence relationship is saved independently.</p>
      <div className="grid gap-3">
        {evidence.map((item) => {
          const selectedInitial = s(initial.evidence_item_id) === s(item.id) ? initial : {};
          const selectedHypothesis = singleHypothesis ? s(hypotheses[0].id) : hypothesisId;
          return (
            <article className="rounded border border-stone-800 bg-black/10 p-3" key={s(item.id)}>
              {!singleEvidence ? <div className="mb-3"><p className="text-xs uppercase tracking-wide text-stone-500">Evidence</p><p className="font-medium text-stone-200">{s(item.title)}</p></div> : null}
              <ActionForm action={saveEvaluation.bind(null, projectId, campaignId)}>
                <input type="hidden" name="hypothesis_id" value={selectedHypothesis} />
                <input type="hidden" name="evidence_item_id" value={s(item.id)} />
                <EvaluationFields initial={selectedInitial} />
                <SubmitButton>{s(selectedInitial.id) ? "Update evidence link" : "Link evidence"}</SubmitButton>
              </ActionForm>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function ArchiveForm({ projectId, campaignId, id, archived }: { projectId: string; campaignId: string; id: string; archived: boolean }) {
  return <ActionForm action={setHypothesisArchived.bind(null, projectId, campaignId, id, !archived)}><SubmitButton>{archived ? "Restore" : "Archive"}</SubmitButton></ActionForm>;
}

export function UnlinkEvaluation({ projectId, campaignId, id }: { projectId: string; campaignId: string; id: string }) {
  return <ActionForm action={unlinkEvaluation.bind(null, projectId, campaignId, id)}><SubmitButton>Unlink evaluation</SubmitButton></ActionForm>;
}
