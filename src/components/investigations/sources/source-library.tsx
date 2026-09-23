"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  cancelCollectionFileSource,
  createCollectionUrlSource,
  finalizeCollectionFileSource,
  prepareCollectionFileSource,
  type SourceCollectionActionState,
} from "@/app/projects/[id]/source-collection-actions";
import { createClient } from "@/lib/supabase/browser";
import { sourceTypes } from "@/lib/sources/schema";

type Row = Record<string, unknown>;
const s = (value: unknown) => String(value ?? "");
const initial: SourceCollectionActionState = {};

type Props = {
  projectId: string;
  sources: Row[];
  gaps: Row[];
  requirements: Row[];
  sourceGapLinks: Row[];
  sourceRequirementLinks: Row[];
  assetCounts: Record<string, number>;
  noteCounts: Record<string, number>;
  annotationCounts: Record<string, number>;
};

function ContextChoices({
  gaps,
  requirements,
}: {
  gaps: Row[];
  requirements: Row[];
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <fieldset className="rounded border border-stone-800 p-3">
        <legend className="px-1 text-xs text-stone-500">Information Gap bağlantıları</legend>
        <div className="max-h-36 space-y-2 overflow-auto">
          {gaps.map((gap) => (
            <label className="flex items-start gap-2 text-sm text-stone-400" key={s(gap.id)}>
              <input type="checkbox" name="gap_ids" value={s(gap.id)} />
              <span>{s(gap.description)}</span>
            </label>
          ))}
          {!gaps.length ? <p className="text-xs text-stone-600">Gap yok.</p> : null}
        </div>
      </fieldset>
      <fieldset className="rounded border border-stone-800 p-3">
        <legend className="px-1 text-xs text-stone-500">Collection Requirement bağlantıları</legend>
        <div className="max-h-36 space-y-2 overflow-auto">
          {requirements.map((requirement) => (
            <label className="flex items-start gap-2 text-sm text-stone-400" key={s(requirement.id)}>
              <input type="checkbox" name="requirement_ids" value={s(requirement.id)} />
              <span>{s(requirement.requirement)}</span>
            </label>
          ))}
          {!requirements.length ? (
            <p className="text-xs text-stone-600">Collection Requirement yok.</p>
          ) : null}
        </div>
      </fieldset>
    </div>
  );
}

function SourceMetadataFields() {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm text-stone-300 md:col-span-2">
          Başlık
          <input className="field mt-1" name="title" required maxLength={240} />
        </label>
        <label className="text-sm text-stone-300">
          Kaynak türü
          <select className="field mt-1" name="source_type" defaultValue="OTHER">
            {sourceTypes.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-stone-300">
          Yayıncı / kurum
          <input className="field mt-1" name="publisher" maxLength={240} />
        </label>
        <label className="text-sm text-stone-300">
          Yayın tarihi
          <input className="field mt-1" name="published_at" type="datetime-local" />
        </label>
        <label className="text-sm text-stone-300 md:col-span-2">
          Neden topluyorum?
          <textarea
            className="field mt-1 min-h-24"
            name="collection_rationale"
            required
            maxLength={4000}
            placeholder="Bu materyalin hangi intelligence question, information gap veya collection requirement için gerekli olduğunu açıklayın."
          />
        </label>
        <label className="text-sm text-stone-300 md:col-span-2">
          Kısa açıklama
          <textarea className="field mt-1 min-h-20" name="description" maxLength={10000} />
        </label>
      </div>
    </>
  );
}

function UrlSourceForm({
  projectId,
  gaps,
  requirements,
}: {
  projectId: string;
  gaps: Row[];
  requirements: Row[];
}) {
  const [state, action, pending] = useActionState(
    createCollectionUrlSource.bind(null, projectId),
    initial,
  );
  return (
    <form action={action} className="space-y-4">
      <SourceMetadataFields />
      <label className="block text-sm text-stone-300">
        URL
        <input
          className="field mt-1"
          name="url"
          type="url"
          required
          maxLength={2048}
          placeholder="https://..."
        />
      </label>
      <ContextChoices gaps={gaps} requirements={requirements} />
      <button className="citem-button" disabled={pending}>
        {pending ? "Kaydediliyor…" : "URL kaynağını ekle"}
      </button>
      {state.error ? <p className="text-sm text-red-300">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-300">{state.success}</p> : null}
    </form>
  );
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function formValues(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    title: data.get("title"),
    source_type: data.get("source_type"),
    publisher: data.get("publisher"),
    published_at: data.get("published_at"),
    collection_rationale: data.get("collection_rationale"),
    description: data.get("description"),
    gap_ids: data.getAll("gap_ids").map(String),
    requirement_ids: data.getAll("requirement_ids").map(String),
  };
}

function FileSourceForm({
  projectId,
  gaps,
  requirements,
}: {
  projectId: string;
  gaps: Row[];
  requirements: Row[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<SourceCollectionActionState>({});
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(0);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setProgress(0);
    setStatus({});
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setPending(false);
      setStatus({ error: "Bir dosya seçin." });
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setPending(false);
      setStatus({ error: "Kaynak dosyası 50 MB sınırını aşıyor." });
      return;
    }

    let hash: string;
    try {
      setProgress(10);
      hash = await sha256(file);
    } catch {
      setPending(false);
      setStatus({ error: "Dosya SHA-256 değeri hesaplanamadı." });
      return;
    }

    const prepared = await prepareCollectionFileSource(projectId, {
      ...formValues(form),
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
      sha256: hash,
    });
    if (!prepared.path || !prepared.token || !prepared.sourceId || !prepared.assetId) {
      setPending(false);
      setStatus({ error: prepared.error ?? "Dosya upload hazırlığı başarısız." });
      return;
    }

    setProgress(35);
    const upload = await createClient()
      .storage.from("source-assets")
      .uploadToSignedUrl(prepared.path, prepared.token, file);

    if (upload.error) {
      await cancelCollectionFileSource(projectId, {
        source_id: prepared.sourceId,
        asset_id: prepared.assetId,
        storage_path: prepared.path,
      });
      setPending(false);
      setProgress(0);
      setStatus({ error: `Dosya yüklenemedi: ${upload.error.message}` });
      return;
    }

    setProgress(85);
    const final = await finalizeCollectionFileSource(projectId, {
      source_id: prepared.sourceId,
      asset_id: prepared.assetId,
      storage_path: prepared.path,
      sha256: hash,
      file_size: file.size,
      mime_type: file.type,
    });
    setPending(false);
    if (final.error) {
      await cancelCollectionFileSource(projectId, {
        source_id: prepared.sourceId,
        asset_id: prepared.assetId,
        storage_path: prepared.path,
      });
      setProgress(0);
      setStatus({ error: final.error });
      return;
    }
    setProgress(100);
    setStatus(final);
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <SourceMetadataFields />
      <label className="block text-sm text-stone-300">
        Dosya
        <input className="field mt-1" name="file" type="file" required />
        <span className="mt-1 block text-xs text-stone-600">
          CİTEM dosyayı private Storage'da tutar. PDF, görsel ve metin dosyaları
          CİTEM içinde görüntülenebilir; diğer dosyalar güvenli biçimde saklanır ancak
          inline preview açılmaz. Maksimum 50 MB.
        </span>
      </label>
      <ContextChoices gaps={gaps} requirements={requirements} />
      {pending ? (
        <progress className="w-full" max={100} value={progress}>
          {progress}%
        </progress>
      ) : null}
      <button className="citem-button" disabled={pending}>
        {pending ? "Toplanıyor…" : "Dosya kaynağını ekle"}
      </button>
      {status.error ? <p className="text-sm text-red-300">{status.error}</p> : null}
      {status.success ? <p className="text-sm text-emerald-300">{status.success}</p> : null}
    </form>
  );
}

export function SourceLibrary({
  projectId,
  sources,
  gaps,
  requirements,
  sourceGapLinks,
  sourceRequirementLinks,
  assetCounts,
  noteCounts,
  annotationCounts,
}: Props) {
  const [mode, setMode] = useState<"url" | "file">("file");
  const [query, setQuery] = useState("");
  const [linkFilter, setLinkFilter] = useState<"all" | "linked" | "unlinked">("all");

  const gapIdsBySource = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const link of sourceGapLinks) {
      const id = s(link.source_id);
      map.set(id, [...(map.get(id) ?? []), s(link.gap_id)]);
    }
    return map;
  }, [sourceGapLinks]);
  const requirementIdsBySource = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const link of sourceRequirementLinks) {
      const id = s(link.source_id);
      map.set(id, [...(map.get(id) ?? []), s(link.requirement_id)]);
    }
    return map;
  }, [sourceRequirementLinks]);

  const visible = sources.filter((source) => {
    const id = s(source.id);
    const linked =
      (gapIdsBySource.get(id)?.length ?? 0) + (requirementIdsBySource.get(id)?.length ?? 0) > 0;
    if (linkFilter === "linked" && !linked) return false;
    if (linkFilter === "unlinked" && linked) return false;
    const haystack = [source.title, source.publisher, source.collection_rationale, source.url]
      .map(s)
      .join(" ")
      .toLowerCase();
    return !query || haystack.includes(query.toLowerCase());
  });

  return (
    <div className="space-y-5">
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="citem-label">Yeni Kaynak</p>
            <h2 className="mt-1 text-xl font-semibold text-stone-100">
              Collection materyalini Investigation'a al
            </h2>
          </div>
          <div className="flex rounded border border-stone-800 p-1 text-sm">
            <button
              type="button"
              className={`rounded px-3 py-1.5 ${mode === "file" ? "bg-stone-800 text-amber-300" : "text-stone-500"}`}
              onClick={() => setMode("file")}
            >
              Dosya
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1.5 ${mode === "url" ? "bg-stone-800 text-amber-300" : "text-stone-500"}`}
              onClick={() => setMode("url")}
            >
              URL
            </button>
          </div>
        </div>
        <div className="mt-5">
          {mode === "file" ? (
            <FileSourceForm projectId={projectId} gaps={gaps} requirements={requirements} />
          ) : (
            <UrlSourceForm projectId={projectId} gaps={gaps} requirements={requirements} />
          )}
        </div>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grow text-sm text-stone-300">
            Kaynaklarda ara
            <input
              className="field mt-1"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Başlık, kurum, neden toplandı..."
            />
          </label>
          <label className="text-sm text-stone-300">
            Collection context
            <select
              className="field mt-1"
              value={linkFilter}
              onChange={(event) => setLinkFilter(event.currentTarget.value as typeof linkFilter)}
            >
              <option value="all">Tümü</option>
              <option value="linked">Gap/requirement bağlı</option>
              <option value="unlinked">Bağlantısız</option>
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded border border-stone-800 bg-black/10">
        <div className="hidden grid-cols-[minmax(0,1fr)_120px_120px_120px] gap-3 border-b border-stone-800 px-4 py-2 text-xs uppercase tracking-wider text-stone-600 md:grid">
          <span>Kaynak</span>
          <span>Collection</span>
          <span>Çalışma</span>
          <span></span>
        </div>
        {visible.map((source) => {
          const id = s(source.id);
          const gapsCount = gapIdsBySource.get(id)?.length ?? 0;
          const reqCount = requirementIdsBySource.get(id)?.length ?? 0;
          const linked = gapsCount + reqCount > 0;
          return (
            <article
              key={id}
              className="grid gap-3 border-b border-stone-900 px-4 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_120px_120px_120px] md:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  <span className="citem-badge">{s(source.source_type)}</span>
                  {source.archived_at ? <span className="citem-badge">ARCHIVED</span> : null}
                  {!linked ? (
                    <span className="rounded border border-amber-900/70 px-2 py-0.5 text-[11px] text-amber-300">
                      CONTEXT YOK
                    </span>
                  ) : null}
                </div>
                <Link
                  className="mt-2 block truncate font-medium text-stone-100 hover:text-amber-300"
                  href={`/projects/${projectId}/sources/${id}`}
                >
                  {s(source.title)}
                </Link>
                <p className="mt-1 truncate text-xs text-stone-500">
                  {s(source.publisher) || "Yayıncı belirtilmedi"}
                </p>
                <p className="mt-2 line-clamp-2 text-sm text-stone-400">
                  {s(source.collection_rationale) || "Neden toplandığı henüz belirtilmemiş."}
                </p>
              </div>
              <div className="text-xs text-stone-500">
                {gapsCount} gap
                <br />
                {reqCount} requirement
              </div>
              <div className="text-xs text-stone-500">
                {assetCounts[id] ?? 0} dosya
                <br />
                {noteCounts[id] ?? 0} not · {annotationCounts[id] ?? 0} annotation
              </div>
              <Link className="citem-button-ghost text-center" href={`/projects/${projectId}/sources/${id}`}>
                Aç
              </Link>
            </article>
          );
        })}
        {!visible.length ? (
          <p className="p-6 text-sm text-stone-500">Bu görünümde kaynak yok.</p>
        ) : null}
      </section>
    </div>
  );
}
