"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { evidenceRoles, hypothesisStatuses,
  type HypothesisVersion, type EvidenceReview, type EvidenceCandidate,
  type EvidenceRole, type HypothesisStatus } from "@/lib/analysis/hypotheses/schema";

type HypothesisDetailResponse = {
  hypothesis: HypothesisVersion;
  history: HypothesisVersion[];
  evidence: EvidenceReview[];
  evidenceHistory: EvidenceReview[];
  candidates: EvidenceCandidate[];
  candidatesTruncated: boolean;
  evidenceTruncated: boolean;
};
type Props = { projectId: string };
const fmt = (value: string) => new Date(value).toLocaleString("tr-TR");
const msg = async (response: Response) => {
  if (response.status === 409) return "Başka sekmede değişiklik var. Kayıtları yenileyip tekrar incele.";
  if (response.status === 404) return "Kayıt veya erişim bulunamadı.";
  if (response.status === 400) return "Girdi ya da kaynak bağlantısı geçersiz.";
  return "İşlem tamamlanamadı. Bağlantı ve veritabanını kontrol et.";
};

export function HypothesisDirectory({ projectId }: Props) {
  const endpoint = `/api/projects/${projectId}/analysis/hypotheses`;
  const [items, setItems] = useState<HypothesisVersion[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [title, setTitle] = useState("");
  const [proposition, setProposition] = useState("");
  const [test, setTest] = useState("");
  const [rationale, setRationale] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Hypotheses unavailable");
        return response.json() as Promise<{ items: HypothesisVersion[]; truncated: boolean }>;
      }).then((data) => {
        if (!controller.signal.aborted) { setItems(data.items); setTruncated(data.truncated); }
      }).catch(() => { if (!controller.signal.aborted) setMessage("Hipotez listesi alınamadı."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          hypothesisId: null, title: title.trim(), proposition: proposition.trim(),
          disconfirmationTest: test.trim(), status: "OPEN", rationale: rationale.trim(),
          expectedCurrentVersionId: null, requestId: crypto.randomUUID(),
        }) });
      if (!response.ok) { setMessage(await msg(response)); return; }
      const value = await response.json() as { hypothesisId: string };
      window.location.assign(`/projects/${projectId}/analysis/hypotheses/${value.hypothesisId}`);
    } catch { setMessage("Ağ hatası: hipotez kaydedilemedi."); }
    finally { setSaving(false); }
  }
  return <main className="mx-auto max-w-6xl space-y-6 px-4 pb-12">
    <header className="space-y-2 rounded-lg border border-stone-800 bg-[#111819] p-5">
      <p className="citem-label">Stage 4.2 · M2A · Analysis</p>
      <h1 className="text-2xl font-bold text-stone-100">Working Hypotheses</h1>
      <p className="max-w-3xl text-sm leading-6 text-stone-400">
        A hypothesis is a falsifiable analyst proposition. It is NOT a Source Claim, a confirmed fact,
        an attribution judgment, or a calibrated confidence score. AI never saves hypotheses automatically.
      </p>
    </header>
    <section className="rounded-lg border border-amber-900/40 bg-[#121715] p-5">
      <h2 className="mb-3 text-lg font-semibold text-amber-200">Create a working hypothesis</h2>
      <form onSubmit={create} className="grid gap-3">
        <label className="grid gap-1 text-xs text-stone-300">Title
          <input className="field" required minLength={8} maxLength={160} value={title}
            onChange={(event) => setTitle(event.target.value)} placeholder="H1 — Shared infrastructure indicates operational coordination" />
        </label>
        <label className="grid gap-1 text-xs text-stone-300">Proposition — what might explain the observations?
          <textarea className="field min-h-24" required minLength={20} maxLength={4000}
            value={proposition} onChange={(event) => setProposition(event.target.value)} />
        </label>
        <label className="grid gap-1 text-xs text-stone-300">What observation would falsify this hypothesis?
          <textarea className="field min-h-20" required minLength={20} maxLength={2000}
            value={test} onChange={(event) => setTest(event.target.value)} />
        </label>
        <label className="grid gap-1 text-xs text-stone-300">Analyst rationale (not a conclusion)
          <textarea className="field min-h-20" required minLength={10} maxLength={3000}
            value={rationale} onChange={(event) => setRationale(event.target.value)} />
        </label>
        <button className="citem-button w-fit" type="submit" disabled={saving}>{saving ? "Creating…" : "Create working hypothesis"}</button>
      </form>
    </section>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-stone-200">Investigation hypotheses</h2>
      {loading && <p className="text-sm text-stone-400">Loading…</p>}
      {truncated && <p className="text-xs text-amber-300">Showing first 100 hypotheses.</p>}
      {!loading && !items.length && <p className="text-sm text-stone-500">No working hypotheses yet.</p>}
      <div className="grid gap-3">{items.map((item) => <Link key={item.hypothesis_id}
        href={`/projects/${projectId}/analysis/hypotheses/${item.hypothesis_id}`}
        className="rounded-lg border border-stone-800 bg-[#111819] p-4 hover:border-amber-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-amber-200">{item.title}</strong>
          <span className="text-xs text-stone-400">{item.status} · rev {item.revision}</span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-stone-300">{item.proposition}</p>
      </Link>)}</div>
    </section>
    {message && <p role="alert" className="text-sm text-amber-300">{message}</p>}
  </main>;
}

export function HypothesisDetail({ projectId, hypothesisId }: Props & { hypothesisId: string }) {
  const root = `/api/projects/${projectId}/analysis/hypotheses`;
  const endpoint = `${root}/${hypothesisId}`;
  const [data, setData] = useState<HypothesisDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [proposition, setProposition] = useState("");
  const [test, setTest] = useState("");
  const [rationale, setRationale] = useState("");
  const [status, setStatus] = useState<HypothesisStatus>("OPEN");
  const [assertionId, setAssertionId] = useState("");
  const [role, setRole] = useState<EvidenceRole>("CONTEXT");
  const [evidenceRationale, setEvidenceRationale] = useState("");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(endpoint, { cache: "no-store", credentials: "same-origin", signal });
    if (!response.ok) throw new Error("Cannot load hypothesis detail");
    const payload = await response.json() as HypothesisDetailResponse;
    if (!signal?.aborted) {
      setData(payload);
      setTitle(payload.hypothesis.title);
      setProposition(payload.hypothesis.proposition);
      setTest(payload.hypothesis.disconfirmation_test);
      setRationale(payload.hypothesis.rationale);
      setStatus(payload.hypothesis.status);
    }
  }, [endpoint]);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch(() => {
      if (!controller.signal.aborted) setMessage("Hipotez yüklenemedi; migration henüz uygulanmamış olabilir.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  const current = data?.hypothesis;
  const selected = data?.candidates.find((item) => item.assertionId === assertionId);
  const currentLink = data?.evidence.find((item) => item.assertion_id === assertionId);
  const activeEvidence = data?.evidence.filter((item) => item.role !== "WITHDRAWN") ?? [];
  async function saveRevision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!current) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(root, { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          hypothesisId, title: title.trim(), proposition: proposition.trim(),
          disconfirmationTest: test.trim(), status, rationale: rationale.trim(),
          expectedCurrentVersionId: current.id, requestId: crypto.randomUUID(),
        }) });
      if (!response.ok) { setMessage(await msg(response)); return; }
      await refresh(); setMessage("New immutable hypothesis revision saved.");
    } catch { setMessage("Hypothesis revision could not be saved."); }
    finally { setBusy(false); }
  }
  async function saveEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || !current) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          assertionId, role, rationale: evidenceRationale.trim(),
          expectedCurrentReviewId: currentLink?.id ?? null,
          expectedContext: selected.provenance, requestId: crypto.randomUUID(),
        }) });
      if (!response.ok) { setMessage(await msg(response)); return; }
      await refresh(); setEvidenceRationale("");
      setMessage("Evidence role revision saved; source and previous reviews were not modified.");
    } catch { setMessage("Evidence review could not be saved."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-6xl space-y-5 px-4 pb-12">
    <Link href={`/projects/${projectId}/analysis/hypotheses`} className="text-xs text-amber-300">← Working Hypotheses</Link>
    <header className="rounded-lg border border-stone-800 bg-[#111819] p-5">
      <p className="citem-label">Stage 4.2 · M2A</p>
      <h1 className="text-xl font-semibold text-stone-100">Hypothesis review and evidence roles</h1>
      <p className="mt-2 text-xs leading-5 text-stone-400">Evidence links are analyst working assessments, not proofs or calibrated probabilities. Source reliability A–F and information credibility 1–6 remain separate.</p>
    </header>
    {loading && <p className="text-sm text-stone-400">Loading hypothesis…</p>}
    {message && <p role="status" className="rounded border border-amber-900/60 p-3 text-sm text-amber-300">{message}</p>}
    {current && <>
      <section className="rounded-lg border border-stone-800 bg-[#111819] p-5">
        <div className="mb-4 flex flex-wrap justify-between gap-2"><h2 className="text-lg font-semibold text-amber-200">Analyst hypothesis · rev {current.revision}</h2><span className="text-xs text-stone-500">{fmt(current.authored_at)}</span></div>
        <form onSubmit={saveRevision} className="grid gap-3">
          <label className="grid gap-1 text-xs text-stone-300">Title
            <input className="field" required minLength={8} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="grid gap-1 text-xs text-stone-300">Proposition
            <textarea className="field min-h-24" required minLength={20} maxLength={4000} value={proposition} onChange={(event) => setProposition(event.target.value)} /></label>
          <label className="grid gap-1 text-xs text-stone-300">Falsification / disconfirming observation
            <textarea className="field min-h-20" required minLength={20} maxLength={2000} value={test} onChange={(event) => setTest(event.target.value)} /></label>
          <label className="grid gap-1 text-xs text-stone-300">Working status
            <select className="field" value={status} onChange={(event) => setStatus(event.target.value as HypothesisStatus)}>
              {hypothesisStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select></label>
          <label className="grid gap-1 text-xs text-stone-300">Why this revision?
            <textarea className="field min-h-20" required minLength={10} maxLength={3000} value={rationale} onChange={(event) => setRationale(event.target.value)} /></label>
          <button className="citem-button w-fit" disabled={busy}>Save new hypothesis revision</button>
        </form>
        <details className="mt-4 border-t border-stone-800 pt-3 text-xs text-stone-400"><summary className="cursor-pointer text-amber-300">Immutable hypothesis history ({data?.history.length ?? 0})</summary>
          <ol className="mt-3 grid gap-2">{data?.history.map((item) => <li key={item.id} className="rounded border border-stone-800 p-3">
            <strong>Revision {item.revision} · {item.status}</strong><p className="mt-1">{item.proposition}</p><p className="mt-1">Disconfirm: {item.disconfirmation_test}</p><p className="mt-1 text-stone-500">{item.rationale}</p>
          </li>)}</ol>
        </details>
      </section>
      <section className="rounded-lg border border-amber-900/40 bg-[#121715] p-5">
        <h2 className="text-lg font-semibold text-amber-200">Evidence role review</h2>
        <p className="mt-2 text-xs text-stone-400">Attach a specific source-reported assertion. Different publications are not assumed independent. CON­TRADICTS is valuable evidence, not a problem to hide.</p>
        {data?.candidatesTruncated && <p className="mt-2 text-xs text-amber-300">Showing up to 100 recent candidate assertions; search/pagination comes in M2B.</p>}
        <form onSubmit={saveEvidence} className="mt-3 grid gap-3">
          <label className="grid gap-1 text-xs text-stone-300">Source assertion
            <select className="field" value={assertionId} required onChange={(event) => { setAssertionId(event.target.value); setEvidenceRationale(""); }}>
              <option value="">Select an assertion…</option>
              {data?.candidates.map((item) => <option key={item.assertionId} value={item.assertionId}>
                {item.sourceTitle} · {item.stance} · {item.claimSummary.slice(0, 120)}
              </option>)}
            </select>
          </label>
          {selected && <p className="text-xs text-stone-400">Source: {selected.sourceTitle} · Claim: {selected.claimSummary}</p>}
          <label className="grid gap-1 text-xs text-stone-300">Analyst-assigned role
            <select className="field" value={role} onChange={(event) => setRole(event.target.value as EvidenceRole)}>
              {evidenceRoles.map((item) => <option key={item} value={item}>{item}</option>)}
            </select></label>
          <label className="grid gap-1 text-xs text-stone-300">Evidence reasoning / limitations
            <textarea className="field min-h-24" required minLength={20} maxLength={4000}
              placeholder="Why does this assertion support, contradict, or merely contextualize this hypothesis?"
              value={evidenceRationale} onChange={(event) => setEvidenceRationale(event.target.value)} /></label>
          <button className="citem-button w-fit" disabled={busy || current.status === "RETIRED" || !selected || evidenceRationale.trim().length < 20}>
            {busy ? "Saving…" : currentLink ? "Save evidence review revision" : "Link and review evidence"}
          </button>
          {current.status === "RETIRED" && <p className="text-xs text-amber-300">Retired hypotheses cannot receive new evidence links.</p>}
        </form>
      </section>
      <section className="space-y-3 rounded-lg border border-stone-800 bg-[#111819] p-5">
        <h2 className="text-lg font-semibold text-stone-200">Current evidence roles ({activeEvidence.length})</h2>
        {data?.evidenceTruncated && <p className="text-xs text-amber-300">Showing first 100 links.</p>}
        {!activeEvidence.length && <p className="text-xs text-stone-500">No active evidence assessments yet.</p>}
        {activeEvidence.map((item) => {
          const live = data?.candidates.find((candidate) => candidate.assertionId === item.assertion_id);
          const stale = !live || [
            [live.provenance.assertionUpdatedAt,item.assertion_updated_at],
            [live.provenance.claimUpdatedAt,item.claim_updated_at],
            [live.provenance.annotationUpdatedAt,item.annotation_updated_at],
            [live.provenance.sourceUpdatedAt,item.source_updated_at],
          ].some(([a,b]) => new Date(a).getTime() !== new Date(b).getTime());
          return <article key={item.id} className="rounded border border-stone-700/70 p-3 text-xs text-stone-400">
            <div className="flex flex-wrap justify-between gap-2"><strong className="text-amber-200">{item.role} · rev {item.revision}</strong>{stale && <span className="text-amber-300">Historical / source changed or unavailable</span>}</div>
            <p className="mt-1 text-stone-300">{item.claim_summary_snapshot}</p>
            <p className="mt-1">{item.source_label_snapshot} · {item.stance_snapshot}</p>
            <p className="mt-2 whitespace-pre-wrap">{item.rationale}</p>
            <Link href={`/projects/${projectId}/source-claims/${item.claim_id_snapshot}`} className="mt-2 inline-block text-amber-300">Open original Source Claim</Link>
          </article>;
        })}
        <details className="border-t border-stone-800 pt-3 text-xs text-stone-400"><summary className="cursor-pointer text-amber-300">Evidence revision history ({data?.evidenceHistory.length ?? 0})</summary>
          <ol className="mt-2 grid gap-2">{data?.evidenceHistory.map((item) => <li className="rounded border border-stone-800 p-2" key={item.id}>
            <strong>Rev {item.revision} · {item.role} · {fmt(item.reviewed_at)}</strong><p>{item.rationale}</p>
          </li>)}</ol>
        </details>
      </section>
    </>}
  </main>;
}
