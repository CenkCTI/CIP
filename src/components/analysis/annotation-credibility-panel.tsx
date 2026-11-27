"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  annotationGradeOneReason, annotationMethod, annotationReviewSchema,
  type AnnotationQuality, type AnnotationReviewDetail,
} from "@/lib/analysis/annotation-credibility/schema";
import { informationCredibilityDescriptions, informationCredibilityGrades } from "@/lib/analysis/credibility/schema";

export function AnnotationCredibilitySummary({ assessment }: { assessment?: AnnotationQuality }) {
  if (!assessment) return <span>Information credibility unavailable</span>;
  const { credibility, stale, subject_status } = assessment;
  return (
    <span>
      Information credibility · {credibility === null
        ? subject_status === "ACTIVE" ? "Not evaluated" : "Passage unavailable for review"
        : `${credibility} · ${informationCredibilityDescriptions[credibility]}`}
      {stale && <strong className="block text-amber-300">Re-evaluation required</strong>}
    </span>
  );
}

const time = (value: string) => new Date(value).toLocaleString();

async function fetchAssessment(url: string, page: number, signal?: AbortSignal): Promise<AnnotationReviewDetail> {
  const response = await fetch(`${url}?page=${page}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Annotation credibility unavailable.");
  return response.json();
}

export function AnnotationCredibilityPanel({ projectId, annotationId, onSaved }: { projectId: string; annotationId: string; onSaved?: () => void }) {
  const router = useRouter();
  const url = `/api/projects/${projectId}/analysis/quality/annotations/${annotationId}`;
  const [data, setData] = useState<AnnotationReviewDetail>();
  const [grade, setGrade] = useState("");
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const retry = useRef<{ input: string; requestId: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetchAssessment(url, 1, controller.signal).then((result) => {
      if (!controller.signal.aborted) setData(result);
    }).catch(() => {
      if (!controller.signal.aborted) setError("Annotation credibility unavailable.");
    });
    return () => controller.abort();
  }, [url]);

  async function refresh(page: number) {
    setPending(true);
    setError("");
    try { setData(await fetchAssessment(url, page)); }
    catch { setError("Annotation credibility unavailable."); }
    finally { setPending(false); }
  }

  const subject = data?.subject;
  return (
    <section className="mt-3 space-y-2 rounded border border-stone-800 bg-black/20 p-3 text-xs text-stone-300">
      <h3 className="font-semibold text-stone-100">Annotation Information Credibility</h3>
      {error && <p className="text-amber-300" role="alert">{error} <button type="button" className="underline" disabled={pending} onClick={() => void refresh(1)}>Reload</button></p>}
      {!data && !error && <p role="status">Loading assessment…</p>}
      {data && <>
        <p>{subject ? <AnnotationCredibilitySummary assessment={subject} /> : "Passage unavailable. Review history is preserved."}</p>
        {subject && <p>Source reliability A–F · {subject.source_reliability ?? "Not evaluated"}{subject.source_reliability_stale && " · Re-evaluation required"}</p>}
        {data.current && <p>Last reviewed {time(data.current.reviewed_at)} · {data.current.rationale}</p>}
        {subject?.subject_status === "ACTIVE" && <form className="space-y-2" onSubmit={async (event) => {
          event.preventDefault();
          const fields = { credibility: Number(grade), rationale: rationale.trim(), methodVersion: annotationMethod,
            expectedReviewId: subject.review_id, provenance: subject.provenance };
          const input = JSON.stringify(fields);
          if (retry.current?.input !== input) retry.current = { input, requestId: crypto.randomUUID() };
          const parsed = annotationReviewSchema.safeParse({ ...fields, requestId: retry.current.requestId });
          if (!parsed.success) { setError("Choose a grade and enter at least 10 characters of rationale."); return; }
          setPending(true);
          setError("");
          try {
            const response = await fetch(`${url}/reviews`, { method: "POST",
              headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
            if (!response.ok) {
              const failure = await response.json().catch(() => null);
              throw new Error(failure?.error ?? "Assessment could not be saved.");
            }
            retry.current = null;
            setGrade("");
            setRationale("");
            router.refresh();
            onSaved?.();
            try { setData(await fetchAssessment(url, 1)); }
            catch { setData(undefined); throw new Error("Assessment saved. Reload to see the current revision."); }
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Assessment could not be saved.");
          } finally { setPending(false); }
        }}>
          <label className="block">Credibility grade
            <select className="field mt-1" required value={grade} onChange={(event) => setGrade(event.target.value)}>
              <option value="">Select a grade</option>
              {informationCredibilityGrades.map((value) => (
                <option key={value} value={value} disabled={value === 1}>{value} · {informationCredibilityDescriptions[value]}</option>
              ))}
            </select>
          </label>
          <p className="text-stone-400">{annotationGradeOneReason}</p>
          <label className="block">Assessment rationale
            <textarea className="field mt-1" required minLength={10} maxLength={4000} value={rationale} onChange={(event) => setRationale(event.target.value)} />
          </label>
          <button className="citem-button" type="submit" disabled={pending}>Save assessment</button>
        </form>}
        {data.history.length > 0 && <div className="space-y-2 border-t border-stone-800 pt-2">
          <h4 className="font-medium">Assessment history</h4>
          <ol className="space-y-2">{data.history.map((review) => (
            <li key={review.id}>
              <p>Revision {review.revision} · Grade {review.credibility} · {time(review.reviewed_at)}</p>
              <p className="whitespace-pre-wrap break-words text-stone-400">{review.rationale}</p>
            </li>
          ))}</ol>
        </div>}
        {(data.hasMore || data.page > 1) && <div className="flex gap-3">
          <button type="button" className="underline" disabled={pending || data.page === 1} onClick={() => void refresh(data.page - 1)}>Newer</button>
          <button type="button" className="underline" disabled={pending || !data.hasMore} onClick={() => void refresh(data.page + 1)}>Older</button>
        </div>}
      </>}
    </section>
  );
}
