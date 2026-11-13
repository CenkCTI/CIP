"use client";

import { useCallback, useEffect, useState } from "react";
import {
  informationCredibilityDescriptions, informationCredibilityGrades,
  informationCredibilityMethodVersion, informationIndependenceLabels,
  informationIndependenceStatuses,
  type AssertionCredibilityResponse, type InformationCredibilityGrade,
  type InformationIndependence,
} from "@/lib/analysis/credibility/schema";

export type CorroborationCandidate = {
  id: string;
  sourceId: string;
  sourceTitle: string;
  stance: string;
};
type Props = {
  projectId: string;
  assertionId: string;
  candidates: CorroborationCandidate[];
};
const dateText = (value: string) => new Date(value).toLocaleString("tr-TR");

/** The collapsed inspector avoids one quality request per assertion on large Claim pages. */
export function AssertionCredibilityPanel({ projectId, assertionId, candidates }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-3 border-t border-stone-800/70 pt-3">
      <button
        type="button"
        className="citem-button-ghost min-h-0 px-3 py-1.5 text-xs"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Close information credibility" : "Information credibility · 1–6 evaluation"}
      </button>
      {open ? (
        <AssertionCredibilityInspector
          projectId={projectId} assertionId={assertionId} candidates={candidates}
        />
      ) : null}
    </section>
  );
}

function AssertionCredibilityInspector({ projectId, assertionId, candidates }: Props) {
  const endpoint = `/api/projects/${projectId}/analysis/quality/assertions/${assertionId}`;
  const [quality, setQuality] = useState<AssertionCredibilityResponse | null>(null);
  const [credibility, setCredibility] = useState<InformationCredibilityGrade>(6);
  const [rationale, setRationale] = useState("");
  const [independenceStatus, setIndependenceStatus] = useState<InformationIndependence>("UNKNOWN");
  const [independenceRationale, setIndependenceRationale] = useState("");
  const [verificationAssertionId, setVerificationAssertionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);

  const refresh = useCallback(async (nextPage: number, signal?: AbortSignal) => {
    const response = await fetch(`${endpoint}?page=${nextPage}`, {
      credentials: "same-origin", cache: "no-store", signal,
    });
    if (!response.ok) throw new Error("Unable to retrieve credibility reviews.");
    const value = await response.json() as AssertionCredibilityResponse;
    if (!signal?.aborted) { setQuality(value); setPage(nextPage); }
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${endpoint}?page=1`, {
      credentials: "same-origin", cache: "no-store", signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Credibility unavailable");
        return response.json() as Promise<AssertionCredibilityResponse>;
      })
      .then((value) => {
        if (!controller.signal.aborted) { setQuality(value); setPage(1); }
      })
      .catch(() => {
        if (!controller.signal.aborted) setMessage("Bilgi değerlendirmesi yüklenemedi.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint]);

  const verified = independenceStatus === "ANALYST_VERIFIED_INDEPENDENT";
  const canSave = !loading && !busy && Boolean(quality?.provenance) &&
    quality?.assertionStatus === "ACTIVE" &&
    (credibility !== 1 || (verified && candidates.length > 0));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || !quality) return;
    if (verified && (!verificationAssertionId || independenceRationale.trim().length < 40)) {
      setMessage("Farklı bir kaynak assertion'ı ve en az 40 karakter bağımsızlık gerekçesi gerekli.");
      return;
    }
    if (credibility === 1 && (rationale.trim().length < 60 || !verified)) {
      setMessage("1 için bağımsız doğrulama ve en az 60 karakter bilgi gerekçesi gerekli.");
      return;
    }
    if (rationale.trim().length < 10 || rationale.trim().length > 4000) {
      setMessage("Değerlendirme gerekçesi 10–4000 karakter olmalı.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${endpoint}/reviews`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credibility, rationale: rationale.trim(), independenceStatus,
          independenceRationale: verified ? independenceRationale.trim() : "",
          verificationAssertionId: verified ? verificationAssertionId : null,
          methodVersion: informationCredibilityMethodVersion,
          expectedCurrentReviewId: quality.current?.id ?? null,
          requestId: crypto.randomUUID(),
          expectedProvenance: quality.provenance,
        }),
      });
      if (!response.ok) {
        if (response.status === 409) {
          await refresh(1);
          setMessage("Başka bir sekmede değerlendirme değişti. Güncel sürümü inceleyin.");
          return;
        }
        if (response.status === 400) {
          setMessage("Seçilen doğrulama kaydı geçersiz veya gerekçe yetersiz.");
          return;
        }
        throw new Error("Could not save review.");
      }
      await refresh(1);
      setRationale("");
      setIndependenceRationale("");
      setVerificationAssertionId("");
      setCredibility(6);
      setIndependenceStatus("UNKNOWN");
      setMessage("Yeni değerlendirme sürümü kaydedildi; önceki sürüm korunuyor.");
    } catch {
      setMessage("Değerlendirme kaydedilemedi. Ağ ve yetki durumunu kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded border border-amber-900/30 bg-[#101715] p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-400">
        <span className="font-semibold text-amber-300">Quality · Information credibility</span>
        {loading ? <span>Loading…</span> : quality ? (
          <>
            <span className="rounded border border-stone-700 px-2 py-1">
              Source {quality.sourceReliability ?? "not evaluated"}
              {quality.sourceReliabilityStale ? " · stale" : ""}
            </span>
            <span className="rounded border border-stone-700 px-2 py-1">
              Information {quality.current?.credibility ?? "not evaluated"}
            </span>
          </>
        ) : <span>Unavailable</span>}
      </div>
      <p className="text-xs leading-5 text-stone-500">
        A–F measures the Source, 1–6 measures this Source Assertion, not the entire
        canonical Claim. Neither is analyst confidence. A1 does not happen automatically.
        6 means cannot judge; no saved review means not evaluated.
      </p>
      {quality?.currentIsStale ? (
        <p role="status" className="rounded border border-amber-800/60 p-2 text-xs text-amber-200">
          Source / claim / annotation / assertion changed since the assessment;
          review its original evidence before re-evaluation.
        </p>
      ) : null}
      {quality && quality.assertionStatus !== "ACTIVE" ? (
        <p className="text-xs text-amber-300">
          {quality.assertionStatus === "ARCHIVED"
            ? "The Source is archived. Old reviews are readable; new reviews are disabled."
            : "Original assertion or provenance is no longer available. History is retained; new reviews are disabled."}
        </p>
      ) : null}
      <form onSubmit={submit} className="grid gap-3">
        <label className="grid gap-1 text-xs text-stone-400">
          Information credibility (1–6)
          <select className="field" disabled={busy || loading || quality?.assertionStatus !== "ACTIVE"}
            value={credibility}
            onChange={(event) => setCredibility(Number(event.currentTarget.value) as InformationCredibilityGrade)}>
            {informationCredibilityGrades.map((value) => (
              <option key={value} value={value}>{value} — {informationCredibilityDescriptions[value]}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-stone-400">
          Analyst rationale
          <textarea className="field min-h-24" maxLength={4000} minLength={credibility === 1 ? 60 : 10}
            required value={rationale} onChange={(event) => setRationale(event.currentTarget.value)}
            placeholder="Explain supporting and contradictory evidence, uncertainty, and original provenance." />
        </label>
        <label className="grid gap-1 text-xs text-stone-400">
          Reporting origin / independence assessment
          <select className="field" value={independenceStatus}
            onChange={(event) => {
              setIndependenceStatus(event.currentTarget.value as InformationIndependence);
              setVerificationAssertionId("");
              setIndependenceRationale("");
            }}>
            {informationIndependenceStatuses.map((value) => (
              <option key={value} value={value}>{informationIndependenceLabels[value]}</option>
            ))}
          </select>
        </label>
        {verified ? (
          <div className="grid gap-3 rounded border border-stone-800 p-3">
            <p className="text-xs text-stone-500">
              Select another independently obtained Source Assertion of the same
              proposition and stance, from a different Source. Same URL / copied
              article is not independent evidence; this is a human attestation,
              not automated verification.
            </p>
            <label className="grid gap-1 text-xs text-stone-400">
              Corroborating assertion
              <select className="field" required value={verificationAssertionId}
                onChange={(event) => setVerificationAssertionId(event.currentTarget.value)}>
                <option value="">Select a different source assertion…</option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.sourceTitle} · {candidate.stance} · {candidate.id.slice(0, 8)}…
                  </option>
                ))}
              </select>
            </label>
            {!candidates.length ? <p className="text-xs text-amber-200">
              No eligible corroborating assertion. Do not select 1; obtain another
              independently sourced assertion first.
            </p> : null}
            <label className="grid gap-1 text-xs text-stone-400">
              Why are the reports independent? (at least 40 characters)
              <textarea className="field min-h-24" maxLength={2000} minLength={40}
                value={independenceRationale} required
                onChange={(event) => setIndependenceRationale(event.currentTarget.value)} />
            </label>
          </div>
        ) : null}
        <button type="submit" disabled={!canSave} className="citem-button w-fit">
          {busy ? "Saving…" : quality?.current ? "Save new assessment revision" : "Record assessment"}
        </button>
      </form>
      {message ? <p role="status" className="text-xs text-amber-300">{message}</p> : null}
      {quality?.current ? (
        <div className="grid gap-2 border-t border-stone-800 pt-3">
          <p className="text-xs font-semibold text-stone-300">Review history (immutable)</p>
          {quality.history.map((review) => (
            <div key={review.id} className="rounded border border-stone-800 p-2 text-xs text-stone-400">
              <p className="font-medium text-stone-200">
                Revision {review.revision} · Information {review.credibility} · {dateText(review.assessed_at)}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{review.rationale}</p>
              <p className="mt-1 text-stone-500">
                {informationIndependenceLabels[review.independence_status]}
                {review.verification_assertion_id ? ` · witness ${review.verification_assertion_id.slice(0, 8)}…` : ""}
              </p>
              {review.independence_rationale ? <p className="mt-1">{review.independence_rationale}</p> : null}
            </div>
          ))}
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <button type="button" className="citem-button-ghost text-xs"
                onClick={() => void refresh(page - 1).catch(() => setMessage("History unavailable"))}>
                Newer
              </button>
            ) : null}
            <span className="text-xs text-stone-600">Page {page}</span>
            {quality.hasMore ? (
              <button type="button" className="citem-button-ghost text-xs"
                onClick={() => void refresh(page + 1).catch(() => setMessage("History unavailable"))}>
                Older
              </button>
            ) : null}
          </div>
        </div>
      ) : !loading && quality ? <p className="text-xs text-stone-500">Not evaluated yet.</p> : null}
    </div>
  );
}
