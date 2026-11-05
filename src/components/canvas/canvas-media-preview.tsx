"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CanvasAssetPreview = {
  assetId: string;
  sourceId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  kind: "PDF" | "IMAGE" | "UNSUPPORTED";
  signedUrl: string | null;
  expiresInSeconds: number;
  href: string;
};

type PdfPage = {
  getViewport: (options: { scale: number }) => {
    width: number; height: number;
  };
  render: (options: {
    canvas: HTMLCanvasElement;
    viewport: { width: number; height: number };
    transform?: number[];
  }) => { promise: Promise<void>; cancel: () => void };
};
type PdfDocument = { numPages: number; getPage: (page: number) => Promise<PdfPage>;
  destroy: () => Promise<void> };
type PdfLoader = { promise: Promise<PdfDocument>; destroy: () => void };
type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: Record<string, unknown>) => PdfLoader;
};

function PdfPagePreview({
  url, page, onCount,
}: {
  url: string; page: number; onCount: (count: number) => void;
}) {
  const shell = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("Preparing PDF page…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loader: PdfLoader | null = null;
    let document: PdfDocument | null = null;
    let renderTask: ReturnType<PdfPage["render"]> | null = null;
    const execute = async () => {
      try {
        const pdf = await import("pdfjs-dist/build/pdf.mjs") as unknown as PdfJs;
        if (cancelled) return;
        pdf.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
        loader = pdf.getDocument({
          url, cMapUrl: "/vendor/pdfjs/cmaps/", cMapPacked: true,
          standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
          isEvalSupported: false,
        });
        document = await loader.promise;
        if (cancelled) return;
        onCount(document.numPages);
        if (page > document.numPages) {
          setStatus("Selected page is outside this PDF.");
          setFailed(true);
          return;
        }
        const pdfPage = await document.getPage(page);
        if (cancelled || !canvas.current) return;
        const initial = pdfPage.getViewport({ scale: 1 });
        const available = Math.max(180, shell.current?.clientWidth ?? 420);
        const scale = Math.max(0.2, Math.min(2, available / initial.width));
        const viewport = pdfPage.getViewport({ scale });
        const pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const surface = canvas.current;
        surface.width = Math.floor(viewport.width * pixelRatio);
        surface.height = Math.floor(viewport.height * pixelRatio);
        surface.style.width = `${viewport.width}px`;
        surface.style.height = `${viewport.height}px`;
        renderTask = pdfPage.render({
          canvas: surface, viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        await renderTask.promise;
        if (!cancelled) { setStatus(""); setFailed(false); }
      } catch {
        if (!cancelled) {
          setStatus("PDF preview unavailable. Use Open source.");
          setFailed(true);
        }
      }
    };
    void execute();
    return () => {
      cancelled = true;
      try { renderTask?.cancel(); } catch { /* already stopped */ }
      if (document) void document.destroy().catch(() => {});
      else { try { loader?.destroy(); } catch { /* already stopped */ } }
    };
  }, [url, page, onCount]);

  return (
    <div ref={shell} className="nowheel nodrag nopan flex min-h-0 flex-1 flex-col overflow-auto rounded border border-stone-700 bg-[#101317]"
      aria-label={`PDF preview, page ${page}`}>
      {status && <p role="status" className={`p-3 text-xs ${failed ? "text-amber-300" : "text-stone-400"}`}>
        {status}
      </p>}
      <canvas ref={canvas} className="mx-auto block max-w-full" aria-hidden="true" />
    </div>
  );
}

/**
 * An ephemeral preview of the private canonical Source Asset. Neither image nor
 * PDF bytes, Storage path or signed link are persisted to the Canvas database.
 * Unsupported types and missing files fall back to the original Source Reader.
 */
export function CanvasMediaPreview({
  projectId, assetId, page, onPageChange,
}: {
  projectId: string;
  assetId: string;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const [asset, setAsset] = useState<CanvasAssetPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState("");
  const [reload, setReload] = useState(0);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const onCount = useCallback((count: number) => setPageCount(count), []);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setUnavailable("");
      setAsset(null);
      setPageCount(null);
      try {
        const response = await fetch(`/api/projects/${projectId}/canvases/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetIds: [assetId] }),
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Private asset lookup failed.");
        const body = await response.json() as { items: CanvasAssetPreview[]; missing: string[] };
        if (!controller.signal.aborted) {
          const match = body.items.find((item) => item.assetId === assetId);
          if (!match) setUnavailable("Source asset deleted or inaccessible.");
          else setAsset(match);
        }
      } catch {
        if (!controller.signal.aborted) setUnavailable("Media unavailable. Refresh or open its original source.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [assetId, projectId, reload]);

  return <div className="nodrag nopan flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
    {loading && <p className="p-2 text-xs text-stone-400" role="status">Loading private source preview…</p>}
    {!loading && unavailable && <p className="rounded border border-amber-900/60 p-2 text-xs text-amber-300" role="alert">
      {unavailable} The reference remains on the Canvas.
    </p>}
    {asset && <>
      <p className="truncate text-[11px] text-stone-300" title={asset.fileName}>{asset.fileName}</p>
      {asset.kind === "PDF" && asset.signedUrl ? <>
        <PdfPagePreview url={asset.signedUrl} page={page} onCount={onCount} />
        <div className="flex items-center justify-between gap-1 text-xs text-stone-300">
          <button type="button" className="rounded border border-stone-700 px-2 py-1 disabled:opacity-30"
            disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
          <span>Page {page}{pageCount != null ? ` / ${pageCount}` : ""}</span>
          <button type="button" className="rounded border border-stone-700 px-2 py-1 disabled:opacity-30"
            disabled={pageCount == null || page >= pageCount}
            onClick={() => onPageChange(page + 1)}>Next</button>
        </div>
      </> : asset.kind === "IMAGE" && asset.signedUrl ? (
        // Private signed Storage URLs must not require a Next/Image host allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.signedUrl} alt={`Original source asset: ${asset.fileName}`}
          className="nowheel min-h-0 w-full flex-1 rounded border border-stone-700 bg-[#101317] object-contain" />
      ) : (
        <p className="flex-1 rounded border border-stone-700 p-3 text-xs text-stone-400">
          This file is not supported for safe inline preview, is too large, or has no accessible original.
          Open the Source Reader instead. No document code is executed in Canvas.
        </p>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-stone-700/60 pt-1.5">
        <a className="text-xs text-amber-300 underline" href={asset.href}
          target="_blank" rel="noopener noreferrer">Open source</a>
        <button type="button" className="text-xs text-stone-400 underline hover:text-stone-200"
          onClick={() => setReload((old) => old + 1)}>Refresh preview</button>
      </div>
    </>}
    {!asset && !loading && <button type="button" className="self-start text-xs text-amber-300 underline"
      onClick={() => setReload((old) => old + 1)}>Retry preview</button>}
  </div>;
}
