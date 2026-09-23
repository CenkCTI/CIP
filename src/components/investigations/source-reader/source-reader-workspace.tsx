"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createSourceAnnotation,
  createSourceNote,
  deleteSourceAnnotation,
  deleteSourceNote,
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

function DocumentSurface({
  asset,
  signedUrl,
  annotations,
  page,
  onPage,
  annotationMode,
  onRect,
}: {
  asset: Row | null;
  signedUrl: string | null;
  annotations: Row[];
  page: number;
  onPage: (page: number) => void;
  annotationMode: string | null;
  onRect: (rect: Rect) => void;
}) {
  const mime = s(asset?.mime_type).toLowerCase();
  const file = s(asset?.original_filename).toLowerCase();
  const [textContent, setTextContent] = useState<string>("");
  const [textError, setTextError] = useState("");

  const isPdf = mime === "application/pdf" || file.endsWith(".pdf");
  const isImage =
    mime.startsWith("image/png") ||
    mime.startsWith("image/jpeg") ||
    ["png", "jpg", "jpeg"].some((ext) => file.endsWith(`.${ext}`));
  const isText =
    mime.startsWith("text/") ||
    mime === "application/json" ||
    [".txt", ".md", ".csv", ".json", ".log"].some((ext) => file.endsWith(ext));

  useEffect(() => {
    if (!signedUrl || !isText) {
      setTextContent("");
      setTextError("");
      return;
    }
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

  if (isPdf) {
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button className="citem-button-ghost" type="button" onClick={() => onPage(Math.max(1, page - 1))}>
            ← Sayfa
          </button>
          <label className="text-xs text-stone-500">
            Sayfa
            <input
              className="ml-2 w-20 rounded border border-stone-800 bg-black px-2 py-1 text-stone-200"
              type="number"
              min={1}
              value={page}
              onChange={(event) => onPage(Math.max(1, Number(event.currentTarget.value) || 1))}
            />
          </label>
          <button className="citem-button-ghost" type="button" onClick={() => onPage(page + 1)}>
            Sonraki →
          </button>
          <span className="text-xs text-stone-600">
            PDF sayfa sayısı browser viewer tarafından yönetilir; geçersiz sayfa girilirse son sayfa gösterilebilir.
          </span>
        </div>
        <div className="relative h-[72vh] min-h-[620px] overflow-hidden rounded border border-stone-800 bg-stone-950">
          <iframe
            key={page}
            title="Source PDF"
            className="h-full w-full"
            src={`${signedUrl}#page=${page}&toolbar=0&navpanes=0&view=FitH`}
          />
          <AnnotationOverlay annotations={annotations} page={page} />
          <RegionCapture active={Boolean(annotationMode)} onRect={onRect} />
        </div>
        <p className="mt-2 text-xs text-stone-600">
          Annotation modu açıkken sayfa üzerinde bir bölge sürükleyin. Orijinal PDF değiştirilmez;
          işaretler ayrı CİTEM annotation kayıtlarıdır.
        </p>
      </div>
    );
  }

  if (isImage) {
    return (
      <div className="relative overflow-hidden rounded border border-stone-800 bg-black/20">
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
        <legend className="citem-label">Information Gaps</legend>
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
        <legend className="citem-label">Collection Requirements</legend>
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
        {pending ? "Kaydediliyor…" : "Collection context'i kaydet"}
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
  annotationGapLinks: Row[];
  annotationRequirementLinks: Row[];
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<"HIGHLIGHT" | "UNDERLINE" | "REGION" | null>(null);
  const [draftRect, setDraftRect] = useState<Rect | null>(null);
  const [comment, setComment] = useState("");
  const [gapIds, setGapIds] = useState<string[]>(sourceGapIds);
  const [requirementIds, setRequirementIds] = useState<string[]>(sourceRequirementIds);
  const [saving, startSaving] = useTransition();
  const [message, setMessage] = useState<SourceCollectionActionState>({});
  const [panel, setPanel] = useState<"context" | "notes" | "annotations">("context");

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

  function saveAnnotation() {
    if (!asset || !draftRect || !mode) return;
    startSaving(async () => {
      const result = await createSourceAnnotation(projectId, {
        source_id: s(source.id),
        asset_id: s(asset.id),
        annotation_type: mode,
        page_number: s(asset.mime_type) === "application/pdf" ? page : 1,
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
            ← Sources
          </Link>
          <p className="citem-label mt-3">Source Reader</p>
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
          <Link
            className="citem-button"
            href={`/projects/${projectId}/sources/${s(source.id)}/print`}
            target="_blank"
          >
            Collection packet
          </Link>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="card min-w-0">
          {asset ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="citem-label">Annotation</p>
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

          <DocumentSurface
            asset={asset}
            signedUrl={signedUrl}
            annotations={annotations}
            page={page}
            onPage={setPage}
            annotationMode={mode}
            onRect={(rect) => {
              setDraftRect(rect);
              setPanel("annotations");
            }}
          />

          {draftRect && mode ? (
            <div className="mt-4 rounded border border-amber-900/70 bg-amber-950/10 p-4">
              <p className="citem-label">Yeni {mode} annotation</p>
              <textarea
                className="field mt-3 min-h-20"
                value={comment}
                onChange={(event) => setComment(event.currentTarget.value)}
                placeholder="Bu işaret neden önemli? (opsiyonel)"
              />
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <fieldset className="rounded border border-stone-800 p-3">
                  <legend className="px-1 text-xs text-stone-500">Information Gaps</legend>
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
                  <legend className="px-1 text-xs text-stone-500">Collection Requirements</legend>
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
                  {saving ? "Kaydediliyor…" : "Annotation'ı kaydet"}
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
                {value}
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
                  return (
                    <article
                      className="rounded border border-stone-800 bg-black/10 p-3"
                      key={id}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="citem-badge">{s(annotation.annotation_type)}</span>
                        <span className="text-[11px] text-stone-600">
                          {annotation.page_number ? `p. ${s(annotation.page_number)}` : "text"}
                        </span>
                      </div>
                      {annotation.comment ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-stone-300">
                          {s(annotation.comment)}
                        </p>
                      ) : null}
                      <div className="mt-2 space-y-1 text-[11px] text-stone-600">
                        {linkedGaps.map((gapId) => (
                          <p key={gapId}>Gap: {s(gapById.get(gapId)?.description)}</p>
                        ))}
                        {linkedReqs.map((requirementId) => (
                          <p key={requirementId}>
                            Req: {s(requirementById.get(requirementId)?.requirement)}
                          </p>
                        ))}
                      </div>
                      <button
                        className="mt-2 text-xs text-red-400"
                        type="button"
                        onClick={() =>
                          startSaving(async () => {
                            await deleteSourceAnnotation(projectId, s(source.id), id);
                            router.refresh();
                          })
                        }
                      >
                        Sil
                      </button>
                    </article>
                  );
                })}
                {!annotations.length ? (
                  <p className="text-xs text-stone-600">Henüz annotation yok.</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
