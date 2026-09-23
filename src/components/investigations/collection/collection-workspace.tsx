"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";

import {
  createCollectionRequirement,
  deleteCollectionRequirement,
  setCollectionRequirementStatus,
  updateCollectionRequirement,
  type CollectionActionState,
} from "@/app/projects/[id]/collection-actions";
import {
  collectionPriorities,
  collectionRequirementStatuses,
} from "@/lib/collection/schema";

type Row = Record<string, unknown>;
const s = (value: unknown) => String(value ?? "");
const initial: CollectionActionState = {};

type Props = {
  projectId: string;
  project: Row;
  questions: Row[];
  gaps: Row[];
  requirements: Row[];
  requirementGapLinks: Row[];
  sources: Row[];
  sourceGapLinks: Row[];
  sourceRequirementLinks: Row[];
};

function GapBadge({ status }: { status: string }) {
  return (
    <span className="citem-badge" data-tone={status === "RESOLVED" ? undefined : "attention"}>
      {status}
    </span>
  );
}

function StateMessage({ state }: { state: CollectionActionState }) {
  if (state.error) return <p className="mt-2 text-sm text-red-300">{state.error}</p>;
  if (state.success)
    return <p className="mt-2 text-sm text-emerald-300">{state.success}</p>;
  return null;
}

function RequirementCreate({
  projectId,
  gaps,
  selectedGapId,
}: {
  projectId: string;
  gaps: Row[];
  selectedGapId: string | null;
}) {
  const [state, action, pending] = useActionState(
    createCollectionRequirement.bind(null, projectId),
    initial,
  );
  return (
    <form action={action} className="card space-y-3">
      <div>
        <p className="citem-label">Yeni Collection Requirement</p>
        <p className="mt-2 text-sm text-stone-500">
          Information Gap neyi bilmediğimizi söyler. Burada o boşluğu kapatmak için
          hangi materyalin toplanması gerektiğini tanımlayın.
        </p>
      </div>
      <label className="block text-sm text-stone-300">
        Ne toplanmalı?
        <textarea
          className="field mt-1 min-h-24"
          name="requirement"
          maxLength={4000}
          required
          placeholder="Örn. APT28'in kurumsal bağlantısını destekleyen resmi attribution ve bağımsız teknik raporları topla."
        />
      </label>
      <label className="block text-sm text-stone-300">
        Bu neden gerekli?
        <textarea
          className="field mt-1 min-h-20"
          name="rationale"
          maxLength={4000}
          placeholder="Bu requirement hangi soruyu veya boşluğu kapatmaya yardım edecek?"
        />
      </label>
      <label className="block text-sm text-stone-300">
        Öncelik
        <select className="field mt-1" name="priority" defaultValue="MEDIUM">
          {collectionPriorities.map((priority) => (
            <option key={priority}>{priority}</option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className="text-sm text-stone-300">Bağlı Information Gap'ler</legend>
        <div className="mt-2 max-h-44 space-y-2 overflow-auto rounded border border-stone-800 p-3">
          {gaps.map((gap) => (
            <label className="flex items-start gap-2 text-sm text-stone-400" key={s(gap.id)}>
              <input
                type="checkbox"
                name="gap_ids"
                value={s(gap.id)}
                defaultChecked={selectedGapId === s(gap.id)}
              />
              <span>{s(gap.description)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <button className="citem-button" disabled={pending}>
        {pending ? "Oluşturuluyor…" : "Collection requirement oluştur"}
      </button>
      <StateMessage state={state} />
    </form>
  );
}

function RequirementEditor({
  projectId,
  requirement,
  gaps,
  linkedGapIds,
}: {
  projectId: string;
  requirement: Row;
  gaps: Row[];
  linkedGapIds: string[];
}) {
  const [state, action, pending] = useActionState(
    updateCollectionRequirement.bind(null, projectId, s(requirement.id)),
    initial,
  );
  return (
    <form action={action} className="mt-4 space-y-3 border-t border-stone-800 pt-4">
      <textarea
        className="field min-h-24"
        name="requirement"
        defaultValue={s(requirement.requirement)}
        required
        maxLength={4000}
      />
      <textarea
        className="field min-h-20"
        name="rationale"
        defaultValue={s(requirement.rationale)}
        maxLength={4000}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <select className="field" name="priority" defaultValue={s(requirement.priority)}>
          {collectionPriorities.map((priority) => (
            <option key={priority}>{priority}</option>
          ))}
        </select>
        <select className="field" name="status" defaultValue={s(requirement.status)}>
          {collectionRequirementStatuses.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
      </div>
      <fieldset className="max-h-40 overflow-auto rounded border border-stone-800 p-3">
        <legend className="px-1 text-xs text-stone-500">Information Gap bağlantıları</legend>
        {gaps.map((gap) => (
          <label className="mt-2 flex items-start gap-2 text-sm text-stone-400" key={s(gap.id)}>
            <input
              type="checkbox"
              name="gap_ids"
              value={s(gap.id)}
              defaultChecked={linkedGapIds.includes(s(gap.id))}
            />
            <span>{s(gap.description)}</span>
          </label>
        ))}
      </fieldset>
      <button className="citem-button" disabled={pending}>
        {pending ? "Kaydediliyor…" : "Kaydet"}
      </button>
      <StateMessage state={state} />
    </form>
  );
}

function RequirementActions({
  projectId,
  requirement,
}: {
  projectId: string;
  requirement: Row;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<CollectionActionState>({});
  const id = s(requirement.id);
  const status = s(requirement.status);
  const run = (work: () => Promise<CollectionActionState>) =>
    start(() => void work().then(setMessage));
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {status !== "COLLECTING" ? (
        <button
          className="citem-button-ghost"
          disabled={pending}
          onClick={() => run(() => setCollectionRequirementStatus(projectId, id, "COLLECTING"))}
          type="button"
        >
          Toplamaya başla
        </button>
      ) : null}
      {status !== "SATISFIED" ? (
        <button
          className="citem-button-ghost"
          disabled={pending}
          onClick={() => run(() => setCollectionRequirementStatus(projectId, id, "SATISFIED"))}
          type="button"
          title="Bu yalnızca analistin mevcut collection ihtiyacını yeterli gördüğünü belirtir."
        >
          Analistçe yeterli
        </button>
      ) : null}
      <button
        className="rounded border border-red-900/70 px-3 py-2 text-xs text-red-300"
        disabled={pending}
        type="button"
        onClick={() => run(() => deleteCollectionRequirement(projectId, id))}
      >
        Sil
      </button>
      <StateMessage state={message} />
    </div>
  );
}

export function CollectionWorkspace({
  projectId,
  project,
  questions,
  gaps,
  requirements,
  requirementGapLinks,
  sources,
  sourceGapLinks,
  sourceRequirementLinks,
}: Props) {
  const [selectedGapId, setSelectedGapId] = useState<string | null>(
    gaps.find((gap) => s(gap.status) !== "RESOLVED") ? s(gaps.find((gap) => s(gap.status) !== "RESOLVED")?.id) : null,
  );

  const gapLinksByRequirement = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const link of requirementGapLinks) {
      const id = s(link.requirement_id);
      map.set(id, [...(map.get(id) ?? []), s(link.gap_id)]);
    }
    return map;
  }, [requirementGapLinks]);

  const sourceCountByGap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of sourceGapLinks) {
      const gapId = s(link.gap_id);
      const set = map.get(gapId) ?? new Set<string>();
      set.add(s(link.source_id));
      map.set(gapId, set);
    }
    return map;
  }, [sourceGapLinks]);

  const sourceCountByRequirement = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of sourceRequirementLinks) {
      const requirementId = s(link.requirement_id);
      const set = map.get(requirementId) ?? new Set<string>();
      set.add(s(link.source_id));
      map.set(requirementId, set);
    }
    return map;
  }, [sourceRequirementLinks]);

  const requirementCountByGap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of requirementGapLinks) {
      const gapId = s(link.gap_id);
      const set = map.get(gapId) ?? new Set<string>();
      set.add(s(link.requirement_id));
      map.set(gapId, set);
    }
    return map;
  }, [requirementGapLinks]);

  const visibleRequirements = selectedGapId
    ? requirements.filter((requirement) =>
        (gapLinksByRequirement.get(s(requirement.id)) ?? []).includes(selectedGapId),
      )
    : requirements;

  const sourceById = new Map(sources.map((source) => [s(source.id), source]));

  return (
    <section className="mx-auto max-w-7xl space-y-5">
      <header className="card">
        <p className="citem-label">Investigation / Collection</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-stone-100">{s(project.name)}</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-stone-300">
              <span className="font-medium text-amber-300">Ana soru:</span>{" "}
              {s(project.research_question) || "Tanımlanmamış"}
            </p>
          </div>
          <Link className="citem-button-ghost" href={`/projects/${projectId}/sources`}>
            Kaynaklara git
          </Link>
        </div>
        {questions.length ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-stone-400">
              Supporting Intelligence Questions ({questions.length})
            </summary>
            <ul className="mt-2 space-y-2 text-sm text-stone-500">
              {questions.map((question) => (
                <li key={s(question.id)}>• {s(question.question)}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </header>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="card self-start">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="citem-label">Information Gaps</p>
              <p className="mt-1 text-xs text-stone-500">
                Kaynak sayısı gap'in çözüldüğü anlamına gelmez.
              </p>
            </div>
            <button
              className="text-xs text-amber-300"
              type="button"
              onClick={() => setSelectedGapId(null)}
            >
              Tümü
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {gaps.map((gap) => {
              const id = s(gap.id);
              const selected = selectedGapId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedGapId(id)}
                  className={`w-full rounded border p-3 text-left transition ${
                    selected
                      ? "border-amber-700 bg-amber-950/20"
                      : "border-stone-800 bg-black/10 hover:border-stone-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <GapBadge status={s(gap.status)} />
                    <span className="text-[11px] text-stone-600">
                      {requirementCountByGap.get(id)?.size ?? 0} req ·{" "}
                      {sourceCountByGap.get(id)?.size ?? 0} source
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-stone-300">
                    {s(gap.description)}
                  </p>
                </button>
              );
            })}
            {!gaps.length ? (
              <p className="text-sm text-stone-500">
                Stage 1'de henüz Information Gap oluşturulmamış.
              </p>
            ) : null}
          </div>
        </aside>

        <main className="space-y-5">
          <RequirementCreate
            projectId={projectId}
            gaps={gaps}
            selectedGapId={selectedGapId}
          />

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="citem-label">Collection Requirements</p>
                <h2 className="mt-1 text-xl font-semibold text-stone-100">
                  {selectedGapId ? "Seçili gap için toplama ihtiyacı" : "Tüm toplama ihtiyaçları"}
                </h2>
              </div>
              <span className="text-xs text-stone-600">{visibleRequirements.length} kayıt</span>
            </div>

            {visibleRequirements.map((requirement) => {
              const id = s(requirement.id);
              const linkedSourceIds = [...(sourceCountByRequirement.get(id) ?? new Set<string>())];
              return (
                <article className="card" key={id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="max-w-3xl">
                      <div className="flex flex-wrap gap-2">
                        <span className="citem-badge">{s(requirement.status)}</span>
                        <span className="citem-badge">{s(requirement.priority)}</span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-stone-100">
                        {s(requirement.requirement)}
                      </h3>
                      {requirement.rationale ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-stone-400">
                          {s(requirement.rationale)}
                        </p>
                      ) : null}
                    </div>
                    <span className="text-xs text-stone-600">
                      {linkedSourceIds.length} source
                    </span>
                  </div>

                  {linkedSourceIds.length ? (
                    <div className="mt-4 rounded border border-stone-800 bg-black/10 p-3">
                      <p className="citem-label">Toplanan kaynaklar</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {linkedSourceIds.map((sourceId) => {
                          const source = sourceById.get(sourceId);
                          return source ? (
                            <Link
                              className="rounded border border-stone-700 px-2 py-1 text-xs text-amber-300 hover:border-amber-700"
                              href={`/projects/${projectId}/sources/${sourceId}`}
                              key={sourceId}
                            >
                              {s(source.title)}
                            </Link>
                          ) : null;
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-stone-600">
                      Bu requirement için henüz source bağlanmamış.
                    </p>
                  )}

                  <RequirementActions projectId={projectId} requirement={requirement} />
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm text-amber-300">
                      Requirement'ı düzenle
                    </summary>
                    <RequirementEditor
                      projectId={projectId}
                      requirement={requirement}
                      gaps={gaps}
                      linkedGapIds={gapLinksByRequirement.get(id) ?? []}
                    />
                  </details>
                </article>
              );
            })}

            {!visibleRequirements.length ? (
              <div className="card text-sm text-stone-500">
                Bu görünümde Collection Requirement yok. Information Gap'i seçip
                yukarıdaki formdan analyst-directed collection ihtiyacını tanımlayın.
              </div>
            ) : null}
          </section>
        </main>
      </div>
    </section>
  );
}
