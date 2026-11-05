"use client";

import { useEffect, useRef, useState } from "react";
import {
  canvasEntityLabel, canvasEntityTypes,
  type CanvasEntitySummary, type CanvasEntityType,
} from "@/lib/canvas/entity-registry";

export function CanvasEntityPicker({
  projectId, onAdd, onClose,
}: {
  projectId: string;
  onAdd: (entity: CanvasEntitySummary) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQuery] = useState("");
  const [type, setType] = useState<CanvasEntityType | "">("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CanvasEntitySummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const p = new URLSearchParams({ q, page: String(page) });
      if (type) p.set("type", type);
      try {
        const response = await fetch(
          `/api/projects/${projectId}/canvases/entities?${p.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error("Investigation inventory search unavailable.");
        const payload = await response.json() as {
          items: CanvasEntitySummary[];
          hasMore: boolean;
        };
        if (!controller.signal.aborted) {
          setItems(payload.items);
          setHasMore(payload.hasMore);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Search failed.");
          setItems([]);
          setHasMore(false);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [projectId, q, type, page]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 px-3 py-[min(8vh,70px)]"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="Add Investigation record"
        className="w-full max-w-2xl rounded-lg border border-stone-700 bg-[#11171a] p-4 shadow-2xl sm:p-6">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="citem-label">Canonical record browser</p>
            <h2 className="text-xl font-semibold text-stone-100">Add Investigation record</h2>
            <p className="mt-1 text-sm text-stone-400">
              Live references only. The original Source, Claim or Evidence is not copied or modified.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close entity search"
            className="citem-button-ghost">Close</button>
        </header>
        <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
          <label className="text-xs text-stone-400">Search record titles
            <input ref={inputRef} value={q} maxLength={120}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }}
              placeholder="CVE, IOC, actor, claim, source…"
              className="field mt-1" aria-label="Search Investigation records" />
          </label>
          <label className="text-xs text-stone-400">Record type
            <select value={type} className="field mt-1"
              aria-label="Filter record type"
              onChange={(event) => { setType(event.target.value as CanvasEntityType | ""); setPage(1); }}>
              <option value="">All 18 types</option>
              {canvasEntityTypes.map((kind) =>
                <option key={kind} value={kind}>{canvasEntityLabel(kind)}</option>)}
            </select>
          </label>
        </div>
        {error && <p role="alert" className="mt-3 rounded border border-red-900/70 p-3 text-xs text-red-300">{error}</p>}
        <div aria-busy={loading} className="mt-4 max-h-[52vh] min-h-28 divide-y divide-stone-800 overflow-y-auto rounded border border-stone-800">
          {loading ? <p className="p-5 text-sm text-stone-400">Searching Investigation…</p> :
            items.length === 0 ? <p className="p-5 text-sm text-stone-400">
              No matching accessible records. Try another search or add records to the Investigation first.
            </p> :
            items.map((item) => <div key={item.recordType + item.recordId}
              className="flex items-start justify-between gap-3 p-3 hover:bg-stone-800/30">
              <div className="min-w-0">
                <span className="text-[10px] uppercase tracking-wide text-amber-300">
                  {canvasEntityLabel(item.recordType)}
                </span>
                <p className="break-words text-sm font-medium text-stone-100">{item.title}</p>
                <p className="mt-1 line-clamp-2 break-words text-xs text-stone-400">{item.summary || item.originKind}</p>
              </div>
              <button type="button" className="citem-button shrink-0" onClick={() => onAdd(item)}>
                Place
              </button>
            </div>)}
        </div>
        <footer className="mt-3 flex items-center justify-between text-xs text-stone-400">
          <span>Page {page} · Results reflect current Investigation permissions</span>
          <div className="flex gap-2">
            <button type="button" className="citem-button-ghost" disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}>Previous</button>
            <button type="button" className="citem-button-ghost" disabled={!hasMore || loading || page >= 50}
              onClick={() => setPage((current) => current + 1)}>Next</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
