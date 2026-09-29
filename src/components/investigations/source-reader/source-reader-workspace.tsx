"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { extractDocxPlainText, isDocxFile } from "@/lib/collection/docx-preview";
import { PdfSourceViewer } from "@/components/investigations/source-reader/pdf/pdf-source-viewer";

import {
  createSourceAnnotation,
  createSourceNote,
  deleteSourceAnnotation,
  deleteSourceNote,
  updateSourceAnnotationContext,
  updateSourceCollectionLinks,
  type SourceCollectionActionState,
} from "@/app/projects/[id]/source-collection-actions";

type Row = Record<string, unknown>;
type Rect = { x: number; y: number; width: number; height: number };
const s = (value: unknown) => String(value ?? "");
const initial: SourceCollectionActionState = {};

function formatDate(value: unknown) {
  if (!value) return "Belirtilmedi";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? "Belirtilmedi" : parsed.toLocaleString();
}

function AnnotationOverlay({
  annotations,
  page,
}: {
  annotations: Row[];
  page: number | null;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {annotations
        .filter((annotation) => {
          const p = annotation.page_number == null ? null : Number(annotation.page_number);
          return p === page;
        })
        .flatMap((annotation) => {
          const rects = Array.isArray(annotation.rects) ? (annotation.rects as Rect[]) : [];
          return rects.map((rect, index) => {
            const type = s(annotation.annotation_type);
            return (
              <div
                key={`${s(annotation.id)}-${index}`}
                title={s(annotation.comment) || s(annotation.selected_text)}
                className={
                  type === "UNDERLINE"
                    ? "absolute border-b-2 border-amber-400"
                    : type === "REGION"
                      ? "absolute border-2 border-amber-500/80 bg-amber-500/5"
                      : "absolute bg-amber-300/25"
                }
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.width * 100}%`,
                  height: `${rect.height * 100}%`,
                }}
              />
            );
          });
        })}
    </div>
  );
}

function RegionCapture({
  active,
  onRect,
}: {
  active: boolean;
  onRect: (rect: Rect) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);

  if (!active) return null;

  const point = (event: React.PointerEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    };
  };

  return (
    <div
      ref={ref}
      className="absolute inset-0 z-20 cursor-crosshair"
      onPointerDown={(event) => {
        const p = point(event);
        if (!p) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setStart(p);
        setDraft({ x: p.x, y: p.y, width: 0.001, height: 0.001 });
      }}
      onPointerMove={(event) => {
        if (!start) return;
        const p = point(event);
        if (!p) return;
        setDraft({
          x: Math.min(start.x, p.x),
          y: Math.min(start.y, p.y),
          width: Math.max(0.001, Math.abs(p.x - start.x)),
          height: Math.max(0.001, Math.abs(p.y - start.y)),
        });
      }}
      onPointerUp={(event) => {
        const p = point(event);
        if (!p || !start) return;
        const rect = {
          x: Math.min(start.x, p.x),
          y: Math.min(start.y, p.y),
          width: Math.max(0.001, Math.abs(p.x - start.x)),
          height: Math.max(0.001, Math.abs(p.y - start.y)),
        };
        setStart(null);
        setDraft(null);
        if (rect.width > 0.005 && rect.height > 0.005) onRect(rect);
      }}
    >
      {draft ? (
        <div
          className="absolute border-2 border-amber-400 bg-amber-300/15"
          style={{
            left: `${draft.x * 100}%`,
            top: `${draft.y * 100}%`,
            width: `${draft.width * 100}%`,
            height: `${draft.height * 100}%`,
          }}
        />
      ) : null}
    </div>
  );
}

function DocxDocument({ url }: { url: string }) {
  const [content, setContent] = useState("DOCX yükleniyor…");
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.arrayBuffer();
      })
      .then(extractDocxPlainText)
      .then((value) => {
        if (!cancelled) setContent(value || "DOCX içinde görüntülenebilir metin bulunamadı.");
      })
      .catch(() => {
        if (!cancelled) setContent("DOCX preview oluşturulamadı. Orijinal dosya korunmaktadır.");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return (
    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-stone-300">
      {content}
    </pre>
  );
}

function DocumentSurface({
  asset,
  signedUrl,
  annotations,
  annotationMode,
  onRect,
}: {
  asset: Row | null;
  signedUrl: string | null;
  annotations: Row[];
  annotationMode: string | null;
  onRect: (rect: Rect) => void;
}) {
  const mime = s(asset?.mime_type).toLowerCase();
  const file = s(asset?.original_filename).toLowerCase();
  const [textContent, setTextContent] = useState<string>("");
  const [textError, setTextError] = useState("");

  const isImage =
    mime.startsWith("image/png") ||
    mime.startsWith("image/jpeg") ||
    ["png", "jpg", "jpeg"].some((ext) => file.endsWith(`.${ext}`));
  const isText =
    mime.startsWith("text/") ||
    mime === "application/json" ||
    [".txt", ".md", ".csv", ".json", ".log"].some((ext) => file.endsWith(ext));
  const isDocx = isDocxFile(mime, file);

  useEffect(() => {
    if (!signedUrl || !isText) return;
    let cancelled = false;
    fetch(signedUrl)
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.text();
      })
      .then((value) => {
        if (!cancelled) setTextContent(value);
      })
      .catch(() => {
        if (!cancelled) setTextError("Metin preview yüklenemedi.");
      });
    return () => {
      cancelled = true;
    };
  }, [isText, signedUrl]);

  if (!asset || !signedUrl) {
    return (
      <div className="flex min-h-[520px] items-center justify-center rounded border border-stone-800 bg-black/20 p-8 text-center text-sm text-stone-500">
        Bu Source için CİTEM içinde görüntülenebilir bir dosya yok. URL kaynağını
        Context panelinden açabilirsiniz.
      </div>
    );
  }

  if (isImage) {
    return (
      <div className="relative overflow-hidden rounded border border-stone-800 bg-black/20">
        {/* Signed private Source assets cannot use Next/Image without widening remote-image policy. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={signedUrl} alt="" className="mx-auto max-h-[76vh] w-auto max-w-full object-contain" />
        <AnnotationOverlay annotations={annotations} page={1} />
        <RegionCapture active={Boolean(annotationMode)} onRect={onRect} />
      </div>
    );
  }

  if (isText) {
    return (
      <div className="relative min-h-[620px] overflow-auto rounded border border-stone-800 bg-black/20 p-5">
        {textError ? <p className="text-red-300">{textError}</p> : null}
        <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6 text-stone-300">
          {textContent || "Metin yükleniyor…"}
        </pre>
      </div>
    );
  }

  if (isDocx) {
    return (
      <div className="relative min-h-[620px] overflow-auto rounded border border-stone-800 bg-black/20 p-5">
        <DocxDocument url={signedUrl} />
      </div>
    );
  }

  return (
    <div className="flex min-h-[520px] flex-col items-center justify-center rounded border border-stone-800 bg-black/20 p-8 text-center">
      <p className="text-stone-300">Bu dosya güvenli inline preview listesinde değil.</p>
      <p className="mt-2 text-sm text-stone-600">
        Orijinal dosya private Storage'da tutuluyor; browser içinde execute edilmiyor.
      </p>
      <a className="citem-button mt-4" href={signedUrl} target="_blank" rel="noreferrer">
        Orijinali aç / indir
      </a>
    </div>
  );
}

function ContextEditor({
  projectId,
  source,
  gaps,
  requirements,
  selectedGapIds,
  selectedRequirementIds,
}: {
  projectId: string;
  source: Row;
  gaps: Row[];
  requirements: Row[];
  selectedGapIds: string[];
  selectedRequirementIds: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<SourceCollectionActionState>({});
  const [gapIds, setGapIds] = useState(selectedGapIds);
  const [requirementIds, setRequirementIds] = useState(selectedRequirementIds);
  const toggle = (items: string[], id: string) =>
    items.includes(id) ? items.filter((value) => value !== id) : [...items, id];

  return (
    <div className="space-y-4">
      <div>
        <p className="citem-label">Neden toplandı?</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-300">
          {s(source.collection_rationale) || "Bu Source için collection rationale kaydedilmemiş."}
        </p>
      </div>
      <fieldset>
        <legend className="citem-label">Bilgi Açıkları</legend>
        <div className="mt-2 max-h-44 space-y-2 overflow-auto">
          {gaps.map((gap) => {
            const id = s(gap.id);
            return (
              <label className="flex items-start gap-2 text-xs text-stone-400" key={id}>
                <input
                  type="checkbox"
                  checked={gapIds.includes(id)}
                  onChange={() => setGapIds((value) => toggle(value, id))}
                />
                <span>{s(gap.description)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="citem-label">Toplama Gereksinimleri</legend>
        <div className="mt-2 max-h-44 space-y-2 overflow-auto">
          {requirements.map((requirement) => {
            const id = s(requirement.id);
            return (
              <label className="flex items-start gap-2 text-xs text-stone-400" key={id}>
                <input
                  type="checkbox"
                  checked={requirementIds.includes(id)}
                  onChange={() => setRequirementIds((value) => toggle(value, id))}
                />
                <span>{s(requirement.requirement)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <button
        className="citem-button-ghost"
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await updateSourceCollectionLinks(projectId, {
              source_id: s(source.id),
              gap_ids: gapIds,
              requirement_ids: requirementIds,
            });
            setMessage(result);
            if (result.success) router.refresh();
          })
        }
      >
        {pending ? "Kaydediliyor…" : "Toplama bağlamını kaydet"}
      </button>
      {message.error ? <p className="text-xs text-red-300">{message.error}</p> : null}
      {message.success ? <p className="text-xs text-emerald-300">{message.success}</p> : null}
    </div>
  );
}

function SourceNotes({
  projectId,
  sourceId,
  notes,
}: {
  projectId: string;
  sourceId: string;
  notes: Row[];
}) {
  const [state, action, pending] = useActionState(
    createSourceNote.bind(null, projectId, sourceId),
    initial,
  );
  const router = useRouter();
  const [deleting, start] = useTransition();
  return (
    <div>
      <form action={action} className="space-y-2">
        <textarea
          className="field min-h-24"
          name="body"
          required
          maxLength={20000}
          placeholder="Kaynakla ilgili çalışma notu..."
        />
        <button className="citem-button-ghost" disabled={pending}>
          {pending ? "Ekleniyor…" : "Not ekle"}
        </button>
        {state.error ? <p className="text-xs text-red-300">{state.error}</p> : null}
      </form>
      <div className="mt-4 space-y-3">
        {notes.map((note) => (
          <article className="rounded border border-stone-800 bg-black/10 p-3" key={s(note.id)}>
            <p className="whitespace-pre-wrap text-sm text-stone-300">{s(note.body)}</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[11px] text-stone-600">{formatDate(note.created_at)}</span>
              <button
                type="button"
                disabled={deleting}
                className="text-xs text-red-400"
                onClick={() =>
                  start(async () => {
                    await deleteSourceNote(projectId, sourceId, s(note.id));
                    router.refresh();
                  })
                }
              >
                Sil
              </button>
            </div>
          </article>
        ))}
        {!notes.length ? <p className="text-xs text-stone-600">Henüz analyst note yok.</p> : null}
      </div>
    </div>
  );
}

function AnnotatedPdfDownloadButton({ projectId, sourceId }: { projectId: string; sourceId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <div>
      <button
        className="citem-button"
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError("");
          try {
            const response = await fetch(`/api/projects/${projectId}/sources/${sourceId}/exports/annotated-pdf`, { method: "POST" });
            if (!response.ok) {
              const body = (await response.json().catch(() => ({}))) as { error?: string };
              throw new Error(body.error || "İşaretli PDF üretilemedi.");
            }
            const blob = await response.blob();
            const disposition = response.headers.get("Content-Disposition") || "";
            const match = disposition.match(/filename="([^"]+)"/);
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = match?.[1] || "CITEM_isaretli_kaynak.pdf";
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "İşaretli PDF üretilemedi.");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "PDF hazırlanıyor…" : "İşaretli PDF'yi indir"}
      </button>
      {error ? <p className="mt-1 max-w-64 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}

export function SourceReaderWorkspace({
  projectId,
  source,
  asset,
  signedUrl,
  gaps,
  requirements,
  sourceGapIds,
  sourceRequirementIds,
  notes,
  annotations,
  annotationFragments,
  annotationGapLinks,
  annotationRequirementLinks,
}: {
  projectId: string;
  source: Row;
  asset: Row | null;
  signedUrl: string | null;
  gaps: Row[];
  requirements: Row[];
  sourceGapIds: string[];
  sourceRequirementIds: string[];
  notes: Row[];
  annotations: Row[];
  annotationFragments: Row[];
  annotationGapLinks: Row[];
  annotationRequirementLinks: Row[];
}) {
  const router = useRouter();
  const isPdf =
    s(asset?.mime_type).toLowerCase() === "application/pdf" ||
    s(asset?.original_filename).toLowerCase().endsWith(".pdf");
  const [mode, setMode] = useState<"HIGHLIGHT" | "UNDERLINE" | "REGION" | null>(null);
  const [draftRect, setDraftRect] = useState<Rect | null>(null);
  const [comment, setComment] = useState("");
  const [gapIds, setGapIds] = useState<string[]>(sourceGapIds);
  const [requirementIds, setRequirementIds] = useState<string[]>(sourceRequirementIds);
  const [saving, startSaving] = useTransition();
  const [message, setMessage] = useState<SourceCollectionActionState>({});
  const [panel, setPanel] = useState<"context" | "notes" | "annotations">("context");
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [focusedAnnotationId, setFocusedAnnotationId] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState("");
  const [editingGapIds, setEditingGapIds] = useState<string[]>([]);
  const [editingRequirementIds, setEditingRequirementIds] = useState<string[]>([]);

  const gapById = useMemo(() => new Map(gaps.map((gap) => [s(gap.id), gap])), [gaps]);
  const requirementById = useMemo(
    () => new Map(requirements.map((requirement) => [s(requirement.id), requirement])),
    [requirements],
  );
  const annGaps = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const link of annotationGapLinks) {
      const id = s(link.annotation_id);
      map.set(id, [...(map.get(id) ?? []), s(link.gap_id)]);
    }
    return map;
  }, [annotationGapLinks]);
  const annReqs = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const link of annotationRequirementLinks) {
      const id = s(link.annotation_id);
      map.set(id, [...(map.get(id) ?? []), s(link.requirement_id)]);
    }
    return map;
  }, [annotationRequirementLinks]);

  useEffect(() => {
    if (panel !== "annotations" || !focusedAnnotationId) return;
    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-annotation-card="${focusedAnnotationId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusedAnnotationId, panel]);

  function beginAnnotationEdit(annotation: Row, linkedGaps: string[], linkedRequirements: string[]) {
    setFocusedAnnotationId(s(annotation.id));
    setEditingAnnotationId(s(annotation.id));
    setEditingComment(s(annotation.comment));
    setEditingGapIds(linkedGaps);
    setEditingRequirementIds(linkedRequirements);
  }

  function saveAnnotationEdit(annotationId: string) {
    startSaving(async () => {
      const result = await updateSourceAnnotationContext(
        projectId,
        s(source.id),
        annotationId,
        {
          comment: editingComment,
          gap_ids: editingGapIds,
          requirement_ids: editingRequirementIds,
        },
      );
      setMessage(result);
      if (result.success) {
        setEditingAnnotationId(null);
        router.refresh();
      }
    });
  }

  function saveAnnotation() {
    if (!asset || !draftRect || !mode) return;
    startSaving(async () => {
      const result = await createSourceAnnotation(projectId, {
        source_id: s(source.id),
        asset_id: s(asset.id),
        annotation_type: mode,
        page_number: 1,
        rects: [draftRect],
        selected_text: null,
        comment,
        gap_ids: gapIds,
        requirement_ids: requirementIds,
      });
      setMessage(result);
      if (result.success) {
        setDraftRect(null);
        setComment("");
        setMode(null);
        router.refresh();
      }
    });
  }

  return (
    <section className="mx-auto max-w-[1600px] space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link className="text-sm text-amber-300" href={`/projects/${projectId}/sources`}>
            ← Kaynaklar
          </Link>
          <p className="citem-label mt-3">Kaynak Okuyucu</p>
          <h1 className="mt-1 text-2xl font-semibold text-stone-100">{s(source.title)}</h1>
          <p className="mt-1 text-sm text-stone-500">
            {s(source.publisher) || "Yayıncı belirtilmedi"} · {s(source.source_type)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {signedUrl ? (
            <a className="citem-button-ghost" href={signedUrl} target="_blank" rel="noreferrer">
              Orijinali aç
            </a>
          ) : source.url ? (
            <a className="citem-button-ghost" href={s(source.url)} target="_blank" rel="noreferrer">
              Kaynak URL'si
            </a>
          ) : null}
          {isPdf && asset ? <AnnotatedPdfDownloadButton projectId={projectId} sourceId={s(source.id)} /> : null}
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="card min-w-0">
          {asset && !isPdf ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="citem-label">İşaretleme</p>
                <p className="mt-1 text-xs text-stone-600">
                  Orijinal dosya değişmez. İşaretlemeler CİTEM overlay katmanında saklanır.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["HIGHLIGHT", "UNDERLINE", "REGION"] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={mode === value ? "citem-button" : "citem-button-ghost"}
                    onClick={() => {
                      setMode(mode === value ? null : value);
                      setDraftRect(null);
                    }}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {isPdf && asset && signedUrl ? (
            <PdfSourceViewer
              projectId={projectId}
              sourceId={s(source.id)}
              assetId={s(asset.id)}
              signedUrl={signedUrl}
              annotations={annotations}
              fragments={annotationFragments}
              gaps={gaps}
              requirements={requirements}
              defaultGapIds={sourceGapIds}
              defaultRequirementIds={sourceRequirementIds}
              focusedAnnotationId={focusedAnnotationId}
              onAnnotationSelect={(annotationId) => {
                setPanel("annotations");
                setFocusedAnnotationId(annotationId);
              }}
            />
          ) : (
            <DocumentSurface
              asset={asset}
              signedUrl={signedUrl}
              annotations={annotations}
              annotationMode={mode}
              onRect={(rect) => {
                setDraftRect(rect);
                setPanel("annotations");
              }}
            />
          )}

          {!isPdf && draftRect && mode ? (
            <div className="mt-4 rounded border border-amber-900/70 bg-amber-950/10 p-4">
              <p className="citem-label">Yeni {mode} işaretleme</p>
              <textarea
                className="field mt-3 min-h-20"
                value={comment}
                onChange={(event) => setComment(event.currentTarget.value)}
                placeholder="Bu işaret neden önemli? (opsiyonel)"
              />
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <fieldset className="rounded border border-stone-800 p-3">
                  <legend className="px-1 text-xs text-stone-500">Bilgi Açıkları</legend>
                  {gaps.map((gap) => {
                    const id = s(gap.id);
                    return (
                      <label key={id} className="mt-2 flex items-start gap-2 text-xs text-stone-400">
                        <input
                          type="checkbox"
                          checked={gapIds.includes(id)}
                          onChange={() =>
                            setGapIds((value) =>
                              value.includes(id)
                                ? value.filter((item) => item !== id)
                                : [...value, id],
                            )
                          }
                        />
                        <span>{s(gap.description)}</span>
                      </label>
                    );
                  })}
                </fieldset>
                <fieldset className="rounded border border-stone-800 p-3">
                  <legend className="px-1 text-xs text-stone-500">Toplama Gereksinimleri</legend>
                  {requirements.map((requirement) => {
                    const id = s(requirement.id);
                    return (
                      <label key={id} className="mt-2 flex items-start gap-2 text-xs text-stone-400">
                        <input
                          type="checkbox"
                          checked={requirementIds.includes(id)}
                          onChange={() =>
                            setRequirementIds((value) =>
                              value.includes(id)
                                ? value.filter((item) => item !== id)
                                : [...value, id],
                            )
                          }
                        />
                        <span>{s(requirement.requirement)}</span>
                      </label>
                    );
                  })}
                </fieldset>
              </div>
              <div className="mt-3 flex gap-2">
                <button className="citem-button" disabled={saving} type="button" onClick={saveAnnotation}>
                  {saving ? "Kaydediliyor…" : "İşaretlemeyi kaydet"}
                </button>
                <button
                  className="citem-button-ghost"
                  type="button"
                  onClick={() => {
                    setDraftRect(null);
                    setMode(null);
                  }}
                >
                  İptal
                </button>
              </div>
              {message.error ? <p className="mt-2 text-sm text-red-300">{message.error}</p> : null}
            </div>
          ) : null}
        </main>

        <aside className="card self-start xl:sticky xl:top-4">
          <div className="flex border-b border-stone-800 text-xs">
            {(["context", "notes", "annotations"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`grow px-2 py-2 uppercase tracking-wide ${
                  panel === value ? "border-b-2 border-amber-400 text-amber-300" : "text-stone-600"
                }`}
                onClick={() => setPanel(value)}
              >
                {value === "context" ? "Bağlam" : value === "notes" ? "Notlar" : "İşaretlemeler"}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {panel === "context" ? (
              <div className="space-y-5">
                <ContextEditor
                  projectId={projectId}
                  source={source}
                  gaps={gaps}
                  requirements={requirements}
                  selectedGapIds={sourceGapIds}
                  selectedRequirementIds={sourceRequirementIds}
                />
                <div className="border-t border-stone-800 pt-4 text-xs text-stone-500">
                  <p><strong className="text-stone-400">Yayın:</strong> {formatDate(source.published_at)}</p>
                  <p className="mt-1"><strong className="text-stone-400">Toplandı:</strong> {formatDate(source.accessed_at)}</p>
                  {asset ? (
                    <>
                      <p className="mt-1"><strong className="text-stone-400">Dosya:</strong> {s(asset.original_filename)}</p>
                      <p className="mt-1 break-all"><strong className="text-stone-400">SHA-256:</strong> {s(asset.sha256) || "yok"}</p>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

            {panel === "notes" ? (
              <SourceNotes projectId={projectId} sourceId={s(source.id)} notes={notes} />
            ) : null}

            {panel === "annotations" ? (
              <div className="space-y-3">
                {annotations.map((annotation) => {
                  const id = s(annotation.id);
                  const linkedGaps = annGaps.get(id) ?? [];
                  const linkedReqs = annReqs.get(id) ?? [];
                  const legacy = Number(annotation.geometry_version ?? 1) !== 2;
                  return (
                    <article
                      className={
                        focusedAnnotationId === id
                          ? "rounded border border-amber-700/70 bg-amber-950/10 p-3"
                          : "rounded border border-stone-800 bg-black/10 p-3"
                      }
                      key={id}
                      data-annotation-card={id}
                      onClick={() => setFocusedAnnotationId(id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="citem-badge">{s(annotation.annotation_type)}</span>
                        <span className="text-[11px] text-stone-600">
                          {annotation.page_number ? `p. ${s(annotation.page_number)}` : "text"}
                        </span>
                      </div>
                      {annotation.selected_text ? (
                        <blockquote className="mt-2 max-h-28 overflow-auto border-l-2 border-amber-700 pl-2 text-xs text-stone-500">
                          {s(annotation.selected_text)}
                        </blockquote>
                      ) : null}
                      {editingAnnotationId === id ? (
                        <div className="mt-3 space-y-3 rounded border border-stone-800 bg-stone-950/40 p-3">
                          <label className="block text-xs text-stone-400">
                            Analist Notu
                            <textarea
                              className="field mt-1 min-h-20"
                              maxLength={10000}
                              value={editingComment}
                              onChange={(event) => setEditingComment(event.currentTarget.value)}
                            />
                          </label>
                          <fieldset>
                            <legend className="citem-label">Bilgi Açıkları</legend>
                            <div className="mt-2 max-h-28 space-y-1 overflow-auto">
                              {gaps.map((gap) => {
                                const gapId = s(gap.id);
                                return (
                                  <label key={gapId} className="flex items-start gap-2 text-xs text-stone-400">
                                    <input
                                      type="checkbox"
                                      checked={editingGapIds.includes(gapId)}
                                      onChange={() =>
                                        setEditingGapIds((current) =>
                                          current.includes(gapId)
                                            ? current.filter((value) => value !== gapId)
                                            : [...current, gapId],
                                        )
                                      }
                                    />
                                    <span>{s(gap.description)}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </fieldset>
                          <fieldset>
                            <legend className="citem-label">Toplama Gereksinimleri</legend>
                            <div className="mt-2 max-h-28 space-y-1 overflow-auto">
                              {requirements.map((requirement) => {
                                const requirementId = s(requirement.id);
                                return (
                                  <label
                                    key={requirementId}
                                    className="flex items-start gap-2 text-xs text-stone-400"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={editingRequirementIds.includes(requirementId)}
                                      onChange={() =>
                                        setEditingRequirementIds((current) =>
                                          current.includes(requirementId)
                                            ? current.filter((value) => value !== requirementId)
                                            : [...current, requirementId],
                                        )
                                      }
                                    />
                                    <span>{s(requirement.requirement)}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </fieldset>
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="citem-button"
                              type="button"
                              disabled={saving}
                              onClick={() => saveAnnotationEdit(id)}
                            >
                              {saving ? "Kaydediliyor…" : "Değişiklikleri kaydet"}
                            </button>
                            <button
                              className="citem-button-ghost"
                              type="button"
                              onClick={() => setEditingAnnotationId(null)}
                            >
                              İptal
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {annotation.comment ? (
                            <p className="mt-2 whitespace-pre-wrap text-sm text-stone-300">
                              {s(annotation.comment)}
                            </p>
                          ) : (
                            <p className="mt-2 text-xs text-stone-600">Bu işaretlemeye analist notu eklenmemiş.</p>
                          )}
                          <div className="mt-2 space-y-1 text-[11px] text-stone-600">
                            {linkedGaps.map((gapId) => (
                              <p key={gapId}>Bilgi Açığı: {s(gapById.get(gapId)?.description)}</p>
                            ))}
                            {linkedReqs.map((requirementId) => (
                              <p key={requirementId}>
                                Toplama Gereksinimi: {s(requirementById.get(requirementId)?.requirement)}
                              </p>
                            ))}
                          </div>
                        </>
                      )}
                      {legacy ? (
                        <p className="mt-2 text-[11px] text-amber-400">
                          Eski ekran-koordinatı işaretlemesi; PDF üzerine otomatik taşınmadı.
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-3">
                        {!legacy && annotation.page_number ? (
                          <button
                            type="button"
                            className="text-xs text-amber-300"
                            onClick={() =>
                              document
                                .querySelector<HTMLElement>(
                                  `[data-pdf-page-number="${s(annotation.page_number)}"]`,
                                )
                                ?.scrollIntoView({ behavior: "smooth", block: "start" })
                            }
                          >
                            PDF'de göster
                          </button>
                        ) : null}
                        {editingAnnotationId !== id ? (
                          <button
                            className="text-xs text-stone-300"
                            type="button"
                            onClick={() => beginAnnotationEdit(annotation, linkedGaps, linkedReqs)}
                          >
                            Düzenle
                          </button>
                        ) : null}
                        <button
                          className="text-xs text-red-400"
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            startSaving(async () => {
                              const result = await deleteSourceAnnotation(projectId, s(source.id), id);
                              setMessage(result);
                              if (result.success) {
                                if (editingAnnotationId === id) setEditingAnnotationId(null);
                                router.refresh();
                              }
                            })
                          }
                        >
                          Sil
                        </button>
                      </div>
                    </article>
                  );
                })}
                {!annotations.length ? (
                  <p className="text-xs text-stone-600">Henüz işaretleme yok.</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
