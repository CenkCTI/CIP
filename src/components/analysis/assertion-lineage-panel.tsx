"use client";

import { useCallback, useEffect, useState } from "react";
import {
  assertionLineageLabels, assertionLineageRelations, contextForPair,
  type AssertionLineageRelation, type AssertionLineageResponse,
} from "@/lib/analysis/lineage/schema";

type Props = { projectId: string; assertionId: string };
const dateText = (iso: string) => new Date(iso).toLocaleString("tr-TR");

/** Collapsed by default: opening a large Source Claim never triggers N requests. */
export function AssertionLineagePanel({ projectId, assertionId }: Props) {
  const [open, setOpen] = useState(false);
  return <section className="mt-3 border-t border-stone-800/70 pt-3">
    <button type="button" className="citem-button-ghost min-h-0 px-3 py-1.5 text-xs"
      aria-expanded={open} onClick={() => setOpen((old) => !old)}>
      {open ? "Close reporting lineage" : "Reporting lineage · independent / derived / cited"}
    </button>
    {open && <LineageInspector projectId={projectId} assertionId={assertionId} />}
  </section>;
}

function LineageInspector({ projectId, assertionId }: Props) {
  const endpoint = `/api/projects/${projectId}/analysis/lineage`;
  const [data, setData] = useState<AssertionLineageResponse | null>(null);
  const [targetId, setTargetId] = useState("");
  const [relation, setRelation] = useState<AssertionLineageRelation>("UNCLEAR");
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<AssertionLineageResponse["links"]>([]);
  const refresh = useCallback(async (otherId = "", signal?: AbortSignal) => {
    const query = new URLSearchParams({ assertionId });
    if (otherId) query.set("otherAssertionId", otherId);
    const response = await fetch(`${endpoint}?${query.toString()}`, {
      credentials: "same-origin", cache: "no-store", signal,
    });
    if (!response.ok) throw new Error("Lineage API unavailable");
    const value = await response.json() as AssertionLineageResponse & { history?: AssertionLineageResponse["links"] };
    if (!signal?.aborted) {
      setData(value);
      setHistory(value.history ?? []);
    }
  }, [endpoint, assertionId]);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ assertionId });
    if (targetId) query.set("otherAssertionId", targetId);
    void fetch(`${endpoint}?${query.toString()}`, {
      credentials: "same-origin", cache: "no-store", signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Lineage unavailable");
      return response.json() as Promise<AssertionLineageResponse & { history?: AssertionLineageResponse["links"] }>;
    }).then((value) => {
      if (!controller.signal.aborted) {
        setData(value);
        setHistory(value.history ?? []);
      }
    }).catch(() => {
      if (!controller.signal.aborted) setMessage("Kaynak ilişkileri yüklenemedi.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, assertionId, targetId]);

  const subject = data?.candidates.find((candidate) => candidate.id === assertionId);
  const target = data?.candidates.find((candidate) => candidate.id === targetId);
  const current = data?.links.find((link) =>
    (link.from_assertion_id === assertionId && link.to_assertion_id === targetId) ||
    (link.from_assertion_id === targetId && link.to_assertion_id === assertionId));
  const validIndependent = subject && target &&
    subject.sourceId !== target.sourceId && subject.stance === target.stance &&
    (subject.stance === "ASSERTS" || subject.stance === "DENIES");
  const canSave = !loading && !busy && !data?.unavailable &&
    subject && target && !subject.archived && !target.archived &&
    Boolean(data?.claimUpdatedAt) && rationale.trim().length >= (relation === "INDEPENDENT_OBSERVATION" ? 60 : 20) &&
    (relation !== "INDEPENDENT_OBSERVATION" || validIndependent);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || !subject || !target || !data?.claimUpdatedAt) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAssertionId: assertionId, toAssertionId: targetId, relation,
          rationale: rationale.trim(), expectedCurrentReviewId: current?.id ?? null,
          requestId: crypto.randomUUID(),
          expectedContext: contextForPair(subject, target, data.claimUpdatedAt),
        }),
      });
      if (!response.ok) {
        if (response.status === 409) {
          await refresh(targetId);
          setMessage("Başka sekmede ilişki veya kaynak değişti. Yeni sürümü inceleyin.");
        } else if (response.status === 400) setMessage("İlişki veya bağımsızlık gerekçesi geçersiz.");
        else setMessage("İlişki kaydedilemedi. Yetki ve ağ durumunu kontrol edin.");
        return;
      }
      await refresh(targetId);
      setRationale("");
      setMessage("Yeni inceleme sürümü kaydedildi; önceki kararlar korundu.");
    } catch {
      setMessage("Kaydetme sırasında bağlantı hatası oluştu.");
    } finally { setBusy(false); }
  }

  return <div className="mt-3 space-y-3 rounded border border-stone-800 bg-[#101715] p-3 text-xs">
    <p className="font-semibold text-amber-300">M1C · Kaynak bağımsızlığı ve raporlama zinciri</p>
    <p className="leading-5 text-stone-400">
      CITES / DERIVED_FROM = bir rapor diğerine dayanıyor. SHARES_PRIMARY_SOURCE = ortak birincil kaynak.
      INDEPENDENT_OBSERVATION analistin gerekçeli kanaatidir, otomatik doğrulama değildir.
      Aynı iddiayı üç sitede görmek üç bağımsız kanıt sayılmaz. İlişki Canvas oku değildir.
    </p>
    {loading && <p className="text-stone-400">İlişkiler yükleniyor…</p>}
    {data?.truncated && <p className="text-amber-300">Kayıt listesi 100 ile sınırlandı; tüm kaynaklar görünmüyor.</p>}
    {data?.unavailable && <p className="text-amber-300">Assertion kaldırılmış; geçmiş bağlantılar salt okunur.</p>}
    <form onSubmit={submit} className="grid gap-3">
      <label className="grid gap-1 text-stone-300">Karşılaştırılacak kaynak assertion&apos;ı
        <select className="field" value={targetId} onChange={(event) => { setTargetId(event.target.value); setMessage(""); }}>
          <option value="">Başka bir assertion seç…</option>
          {data?.candidates.filter((candidate) => candidate.id !== assertionId).map((candidate) =>
            <option key={candidate.id} value={candidate.id}>{candidate.sourceTitle} · {candidate.stance} · {candidate.id.slice(0, 8)}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-stone-300">Raporlama ilişkisi
        <select className="field" value={relation}
          onChange={(event) => setRelation(event.target.value as AssertionLineageRelation)}>
          {assertionLineageRelations.map((value) => <option key={value} value={value}>
            {assertionLineageLabels[value]}
          </option>)}
        </select>
      </label>
      {relation === "INDEPENDENT_OBSERVATION" && !validIndependent && targetId &&
        <p className="text-amber-300">Bağımsız gözlem için farklı Source, aynı Claim ve aynı ASSERTS/DENIES pozisyonu gerekir.</p>}
      <label className="grid gap-1 text-stone-300">Kanıt ve köken gerekçesi
        <textarea className="field min-h-24" maxLength={4000} minLength={relation === "INDEPENDENT_OBSERVATION" ? 60 : 20}
          required value={rationale} onChange={(event) => setRationale(event.target.value)}
          placeholder="Hangi özgün veri, yazı, gözlem veya atıf bu ilişkiyi gösteriyor?" />
      </label>
      <button type="submit" className="citem-button w-fit" disabled={!canSave || !targetId}>
        {busy ? "Kaydediliyor…" : current ? "Yeni ilişki revizyonu kaydet" : "İlişki incelemesini kaydet"}
      </button>
    </form>
    {message && <p role="status" className="text-amber-200">{message}</p>}
    {(data?.links.length ?? 0) > 0 && <div className="space-y-2 border-t border-stone-800 pt-2">
      <p className="font-semibold text-stone-300">Aktif ilişki kararları</p>
      {data?.links.map((link) => <article key={link.id} className="rounded border border-stone-800 p-2">
        <p className="text-stone-200">Rev {link.revision} · {assertionLineageLabels[link.relation]} · {dateText(link.reviewed_at)}</p>
        <p className="mt-1 text-stone-500">{link.identity_snapshot.fromSourceTitle} → {link.identity_snapshot.toSourceTitle}</p>
        <p className="mt-1 whitespace-pre-wrap text-stone-400">{link.rationale}</p>
      </article>)}
    </div>}
    {targetId && history.length > 0 && <details className="border-t border-stone-800 pt-2">
      <summary className="cursor-pointer text-amber-300">Bu çift için inceleme geçmişi ({history.length} gösteriliyor)</summary>
      <ol className="mt-2 space-y-2">{history.map((link) => <li key={link.id} className="rounded border border-stone-800 p-2">
        Rev {link.revision} · {assertionLineageLabels[link.relation]} · {dateText(link.reviewed_at)}
        <p className="mt-1 whitespace-pre-wrap">{link.rationale}</p>
      </li>)}</ol>
    </details>}
  </div>;
}
