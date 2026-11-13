"use client";

import { useCallback, useEffect, useState } from "react";
import {
  sourceReliabilityDescriptions,
  sourceReliabilityGrades,
  sourceReliabilityMethodVersion,
  type SourceQualityResponse,
  type SourceReliabilityGrade,
} from "@/lib/analysis/quality/schema";

type Props = { projectId: string; sourceId: string };
const dateText = (value: string) => new Date(value).toLocaleString("tr-TR");

export function SourceReliabilityPanel({ projectId, sourceId }: Props) {
  const endpoint = `/api/projects/${projectId}/analysis/quality/sources/${sourceId}`;
  const [quality, setQuality] = useState<SourceQualityResponse | null>(null);
  const [rating, setRating] = useState<SourceReliabilityGrade>("F");
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);

  const refresh = useCallback(async (nextPage: number, signal?: AbortSignal) => {
    const res = await fetch(`${endpoint}?page=${nextPage}`, {
      cache: "no-store", credentials: "same-origin", signal,
    });
    if (!res.ok) throw new Error("Kaynak değerlendirmesi okunamadı.");
    const data = await res.json() as SourceQualityResponse;
    if (!signal?.aborted) { setQuality(data); setPage(nextPage); }
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    refresh(1, controller.signal).catch(() => {
      if (!controller.signal.aborted) setMessage("Kaynak değerlendirmesi şu an yüklenemiyor.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || quality?.sourceStatus !== "ACTIVE") return;
    if (rationale.trim().length < 10 || rationale.trim().length > 4000) {
      setMessage("Gerekçe 10–4000 karakter olmalı.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${endpoint}/reviews`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating, rationale: rationale.trim(), methodVersion: sourceReliabilityMethodVersion,
          expectedCurrentReviewId: quality?.current?.id ?? null,
          requestId: crypto.randomUUID(),
        }),
      });
      if (!response.ok) {
        if (response.status === 409) {
          await refresh(1);
          setMessage("Başka bir sekmede değerlendirme değişti. Güncel sürüm yüklendi; tekrar inceleyin.");
          return;
        }
        throw new Error("Değerlendirme kaydedilemedi.");
      }
      await refresh(1);
      setRationale("");
      setMessage("Yeni değerlendirme geçmişe eklendi; eski kayıt değiştirilmedi.");
    } catch { setMessage("Kaydetme başarısız. Veriyi kontrol edip tekrar deneyin."); }
    finally { setBusy(false); }
  }

  return (
    <section className="rounded-xl border border-amber-900/50 bg-stone-950/80 p-4" aria-label="Source reliability review">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-amber-200">Stage 4.1 · Kaynak Güvenilirliği (A–F)</h2>
          <p className="mt-1 text-xs text-stone-400">Kaynağın geçmiş performansını değerlendirir; tekil iddianın 1–6 inandırıcılığı veya analitik güven değildir.</p>
        </div>
        <span className="rounded border border-stone-700 px-2 py-1 text-xs text-stone-300">
          {loading ? "Yükleniyor" : quality?.current ? `${quality.current.rating} · Rev ${quality.current.revision}` : "Değerlendirilmedi"}
        </span>
      </div>
      {quality?.currentIsStale ? (
        <p role="status" className="mt-3 rounded border border-amber-700/60 p-2 text-xs text-amber-200">
          Kaynak, son değerlendirmeden sonra değişmiş. Mevcut derece tarihsel kalır; yeniden inceleyin.
        </p>
      ) : null}
      {quality?.sourceStatus === "ARCHIVED" || quality?.sourceStatus === "UNAVAILABLE" ? (
        <p className="mt-3 text-xs text-amber-200">Kaynak {quality.sourceStatus === "ARCHIVED" ? "arşivlenmiş" : "artık erişilebilir değil"}; yeni değerlendirme kapalı, geçmiş korunuyor.</p>
      ) : null}
      <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 md:grid-cols-[minmax(180px,270px)_1fr_auto] md:items-end">
        <label className="grid gap-1 text-xs text-stone-300">
          Derece
          <select className="field" value={rating} onChange={(event) => setRating(event.target.value as SourceReliabilityGrade)} disabled={busy || loading || quality?.sourceStatus !== "ACTIVE"}>
            {sourceReliabilityGrades.map((grade) => (
              <option key={grade} value={grade}>{grade} — {sourceReliabilityDescriptions[grade]}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-stone-300">
          Analistin gerekçesi
          <textarea className="field min-h-16" value={rationale} maxLength={4000} onChange={(event) => setRationale(event.target.value)} placeholder="Kaynağın önceki doğruluk geçmişi, erişimi ve değerlendirme sınırları…" disabled={busy || loading || quality?.sourceStatus !== "ACTIVE"} />
        </label>
        <button className="citem-button self-end" type="submit" disabled={busy || loading || quality?.sourceStatus !== "ACTIVE" || rationale.trim().length < 10}>
          {busy ? "Kaydediliyor…" : "Yeni değerlendirme kaydet"}
        </button>
      </form>
      {message ? <p role="status" className="mt-3 text-xs text-amber-200">{message}</p> : null}
      {quality?.current ? (
        <div className="mt-4 border-t border-stone-800 pt-3 text-xs text-stone-300">
          <strong>Güncel:</strong> {quality.current.rating} — {sourceReliabilityDescriptions[quality.current.rating]}
          <p className="mt-1 text-stone-400">{quality.current.rationale} · {dateText(quality.current.assessed_at)}</p>
        </div>
      ) : !loading && quality ? <p className="mt-3 text-xs text-stone-500">Henüz değerlendirme yok. Bu durum F derecesi değildir.</p> : null}
      {quality && quality.history.length > 0 ? (
        <details className="mt-3 border-t border-stone-800 pt-3 text-xs text-stone-400">
          <summary className="cursor-pointer text-amber-300">Revizyon geçmişi</summary>
          <ol className="mt-2 space-y-2">
            {quality.history.map((entry) => (
              <li key={entry.id} className="rounded border border-stone-800 p-2">
                <div className="font-medium text-stone-200">Rev {entry.revision} · {entry.rating} · {dateText(entry.assessed_at)}</div>
                <div className="mt-1 whitespace-pre-wrap break-words">{entry.rationale}</div>
              </li>
            ))}
          </ol>
          <div className="mt-2 flex gap-3">
            <button type="button" className="text-amber-300 disabled:opacity-40" disabled={busy || page <= 1} onClick={() => void refresh(page - 1).catch(() => setMessage("Geçmiş yüklenemedi."))}>Önceki sayfa</button>
            <span>Sayfa {page}</span>
            <button type="button" className="text-amber-300 disabled:opacity-40" disabled={busy || !quality.hasMore} onClick={() => void refresh(page + 1).catch(() => setMessage("Geçmiş yüklenemedi."))}>Sonraki sayfa</button>
          </div>
        </details>
      ) : null}
    </section>
  );
}
