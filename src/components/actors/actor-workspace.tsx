"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createActorProfile,
  linkActorRelationship,
  unlinkActorRelationship,
  updateActorProfile,
  type ActorRelationshipType,
  type ActorActionState,
} from "@/app/projects/[id]/actor-actions";

type Row = Record<string, unknown>;
type RelationRows = {
  campaignThreatActors?: Row[] | null;
  threatActorMalware?: Row[] | null;
  threatActorIndicators?: Row[] | null;
  threatActorMitre?: Row[] | null;
  actorHypotheses?: Row[] | null;
};
type Filters = {
  q?: string;
  country?: string;
  motivation?: string;
  sort?: string;
};

const text = (value: unknown) => String(value ?? "");
const list = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function ActorProfileFields({ actor }: { actor?: Row }) {
  return (
    <>
      <label className="grid gap-1">
        <span className="citem-label">Name</span>
        <input
          className="field"
          name="name"
          required
          maxLength={180}
          defaultValue={text(actor?.name)}
          placeholder="APT28"
        />
      </label>

      <label className="grid gap-1">
        <span className="citem-label">Aliases</span>
        <input
          className="field"
          name="aliases"
          defaultValue={list(actor?.aliases).join(", ")}
          placeholder="Fancy Bear, Forest Blizzard, Sofacy"
        />
        <span className="text-xs text-stone-600">Comma-separated names used by reporting or vendors.</span>
      </label>

      <label className="grid gap-1">
        <span className="citem-label">Profile description</span>
        <textarea
          className="field min-h-28"
          name="description"
          maxLength={20000}
          defaultValue={text(actor?.description)}
          placeholder="Short factual profile. Keep attribution judgement in the Attribution workspace."
        />
      </label>

      <details className="rounded border border-stone-800 bg-black/15 p-3">
        <summary className="cursor-pointer text-sm font-medium text-amber-300">Advanced profile context</summary>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1">
            <span className="citem-label">Reported association</span>
            <input
              className="field"
              name="country"
              defaultValue={text(actor?.country)}
              placeholder="Russia"
            />
            <span className="text-xs leading-5 text-stone-600">
              Profile context only; this is not an independent CITEM attribution assessment.
            </span>
          </label>
          <label className="grid gap-1">
            <span className="citem-label">Reported motivations</span>
            <input
              className="field"
              name="motivations"
              defaultValue={list(actor?.motivations).join(", ")}
              placeholder="Espionage, intelligence collection"
            />
            <span className="text-xs leading-5 text-stone-600">Comma-separated contextual labels.</span>
          </label>
        </div>
      </details>
    </>
  );
}

function ActorModal({
  projectId,
  actor,
  triggerLabel,
}: {
  projectId: string;
  actor?: Row;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const editing = Boolean(actor?.id);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActorActionState>({});

  function close() {
    if (pending) return;
    setOpen(false);
    setState({});
  }

  return (
    <>
      <button
        className={editing ? "citem-button-ghost" : "citem-button"}
        type="button"
        onClick={() => setOpen(true)}
      >
        {triggerLabel ?? (editing ? "Edit profile" : "+ Add actor")}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) close();
          }}
        >
          <section
            className="w-full max-w-2xl overflow-hidden rounded-lg border border-amber-900/40 bg-[#0f1417] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={editing ? "Edit Threat Actor profile" : "Add Threat Actor"}
          >
            <header className="flex items-start justify-between gap-4 border-b border-stone-800 px-5 py-4">
              <div>
                <p className="citem-label">Threat Actor</p>
                <h2 className="mt-1 text-xl font-semibold text-stone-100">
                  {editing ? "Edit profile" : "Add tracked actor"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-stone-500">
                  Record identity and profile context here. Attribution judgements remain separate.
                </p>
              </div>
              <button className="citem-button-ghost min-h-0 px-3 py-1.5" type="button" onClick={close}>
                Close
              </button>
            </header>

            <form
              className="max-h-[78vh] space-y-4 overflow-y-auto p-5"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                startTransition(async () => {
                  const result = editing
                    ? await updateActorProfile(projectId, text(actor?.id), formData)
                    : await createActorProfile(projectId, formData);
                  setState(result);
                  if (result.success) {
                    setOpen(false);
                    router.refresh();
                  }
                });
              }}
            >
              <ActorProfileFields actor={actor} />

              {state.error ? <p className="text-sm text-red-300">{state.error}</p> : null}

              <div className="flex justify-end gap-2 border-t border-stone-800 pt-4">
                <button className="citem-button-ghost" type="button" onClick={close}>Cancel</button>
                <button className="citem-button" type="submit" disabled={pending}>
                  {pending ? "Saving…" : editing ? "Save profile" : "Add actor"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

function countByActor(rows: Row[] | null | undefined, actorId: string, column = "threat_actor_id") {
  return (rows ?? []).filter((row) => text(row[column]) === actorId).length;
}

export function ActorDirectory({
  projectId,
  rows,
  allRows,
  relations,
  filters,
}: {
  projectId: string;
  rows: Row[];
  allRows: Row[];
  relations: RelationRows;
  filters: Filters;
}) {
  const countries = useMemo(
    () => [...new Set(allRows.map((row) => text(row.country)).filter(Boolean))].sort(),
    [allRows],
  );
  const motivations = useMemo(
    () => [...new Set(allRows.flatMap((row) => list(row.motivations)))].sort(),
    [allRows],
  );

  return (
    <div className="mt-5 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-stone-800/80 bg-[#0f1417] p-4">
        <div>
          <p className="citem-label">Threat intelligence</p>
          <h2 className="mt-1 text-xl font-semibold text-stone-100">Threat Actors</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-500">
            Tracked actor identities and profile context. Attribution assessments remain analyst-controlled and separate.
          </p>
        </div>
        <ActorModal projectId={projectId} />
      </header>

      <form className="rounded-lg border border-stone-800/80 bg-[#0f1417] p-3">
        <input type="hidden" name="tab" value="actors" />
        <div className="flex flex-wrap gap-2">
          <input
            className="field min-w-64 flex-1"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Search name, alias or profile…"
          />
          <select className="field w-auto min-w-40" name="sort" defaultValue={filters.sort ?? ""}>
            <option value="">Name</option>
            <option value="created">Newest</option>
            <option value="id">ID tie-break</option>
          </select>
          <button className="citem-button-ghost" type="submit">Apply</button>
          <Link className="citem-button-ghost" href={`/projects/${projectId}?tab=actors`}>Clear</Link>
        </div>
        <details className="mt-3 rounded border border-stone-800/70 bg-black/10 p-3">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-[0.14em] text-stone-500">
            Advanced filters
          </summary>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <select className="field" name="country" defaultValue={filters.country ?? ""}>
              <option value="">Any reported association</option>
              {countries.map((country) => <option key={country}>{country}</option>)}
            </select>
            <select className="field" name="motivation" defaultValue={filters.motivation ?? ""}>
              <option value="">Any reported motivation</option>
              {motivations.map((motivation) => <option key={motivation}>{motivation}</option>)}
            </select>
          </div>
        </details>
      </form>

      {rows.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((actor) => {
            const actorId = text(actor.id);
            const aliases = list(actor.aliases);
            const campaignCount = countByActor(relations.campaignThreatActors, actorId);
            const malwareCount = countByActor(relations.threatActorMalware, actorId);
            const indicatorCount = countByActor(relations.threatActorIndicators, actorId);
            const techniqueCount = countByActor(relations.threatActorMitre, actorId);
            const hypothesisCount = countByActor(relations.actorHypotheses, actorId);

            return (
              <article
                key={actorId}
                className="group rounded-lg border border-stone-800/80 bg-[#0f1417] p-4 transition hover:border-amber-900/60 hover:bg-[#12191c]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="citem-label">Threat Actor</p>
                    <h3 className="mt-1 truncate text-xl font-semibold text-stone-100">{text(actor.name)}</h3>
                    <p className="mt-1 min-h-5 text-sm text-stone-500">
                      {aliases.length ? aliases.slice(0, 5).join(" · ") : "No aliases recorded"}
                    </p>
                  </div>
                  {actor.country ? (
                    <span className="citem-badge" data-tone="attention">{text(actor.country)}</span>
                  ) : null}
                </div>

                <p className="mt-4 line-clamp-3 text-sm leading-6 text-stone-400">
                  {text(actor.description) || "No profile description recorded."}
                </p>

                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-stone-800/80 pt-3 text-xs text-stone-500">
                  <span>{campaignCount} campaigns</span>
                  <span>{techniqueCount} techniques</span>
                  <span>{malwareCount} malware</span>
                  <span>{indicatorCount} indicators</span>
                  {hypothesisCount ? <span className="text-amber-300">{hypothesisCount} attribution hypotheses</span> : null}
                </div>

                <div className="mt-4 flex justify-end">
                  <Link className="text-sm font-medium text-amber-300 hover:text-amber-200" href={`/projects/${projectId}/actors/${actorId}`}>
                    Open profile →
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-stone-800/80 bg-[#0f1417] p-6 text-sm text-stone-500">
          No Threat Actors match this view.
        </div>
      )}
    </div>
  );
}

export function ActorProfileHeader({
  projectId,
  actor,
  campaignCount,
  techniqueCount,
  malwareCount,
  indicatorCount,
}: {
  projectId: string;
  actor: Row;
  campaignCount: number;
  techniqueCount: number;
  malwareCount: number;
  indicatorCount: number;
}) {
  const aliases = list(actor.aliases);
  return (
    <article className="rounded-lg border border-stone-800/80 bg-[#0f1417] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="citem-label">Threat Actor</p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-100">{text(actor.name)}</h1>
          <p className="mt-2 text-sm text-stone-500">
            {aliases.length ? aliases.join(" · ") : "No aliases recorded"}
          </p>
        </div>
        <ActorModal projectId={projectId} actor={actor} triggerLabel="Edit profile" />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <p className="whitespace-pre-wrap text-sm leading-7 text-stone-300">
            {text(actor.description) || "No profile description recorded."}
          </p>
        </div>
        <aside className="rounded border border-stone-800/80 bg-black/15 p-3">
          <p className="citem-label">Profile context</p>
          <dl className="mt-3 grid gap-3 text-sm">
            <div>
              <dt className="text-xs text-stone-600">Reported association</dt>
              <dd className="mt-1 text-stone-300">{text(actor.country) || "Not recorded"}</dd>
            </div>
            <div>
              <dt className="text-xs text-stone-600">Reported motivations</dt>
              <dd className="mt-1 text-stone-300">
                {list(actor.motivations).length ? list(actor.motivations).join(" · ") : "Not recorded"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] leading-5 text-stone-600">
            Profile context is descriptive. Attribution judgement remains in the Attribution workspace.
          </p>
        </aside>
      </div>

      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-stone-800/80 pt-4 text-xs text-stone-500">
        <span>{campaignCount} campaign relationships</span>
        <span>{techniqueCount} techniques</span>
        <span>{malwareCount} malware</span>
        <span>{indicatorCount} indicators</span>
      </div>
    </article>
  );
}

const relationshipLabels: Record<ActorRelationshipType, string> = {
  malware: "Malware",
  indicator: "Indicator",
  mitre: "MITRE Technique",
};

function recordLabel(type: ActorRelationshipType, row: Row) {
  if (type === "indicator") return `${text(row.value)} · ${text(row.type)}`;
  if (type === "mitre") return `${text(row.technique_id)} · ${text(row.technique_name)}`;
  return text(row.name);
}

export function ActorRelationshipManager({
  projectId,
  actorId,
  linked,
  options,
}: {
  projectId: string;
  actorId: string;
  linked: Record<ActorRelationshipType, Row[]>;
  options: Record<ActorRelationshipType, Row[]>;
}) {
  const router = useRouter();
  const [type, setType] = useState<ActorRelationshipType>("mitre");
  const [selectedId, setSelectedId] = useState("");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActorActionState>({});

  const linkedIds = useMemo(() => new Set(linked[type].map((row) => text(row.id))), [linked, type]);
  const available = useMemo(
    () => options[type].filter((row) => !linkedIds.has(text(row.id))),
    [options, linkedIds, type],
  );

  function linkRecord() {
    if (!selectedId) return;
    startTransition(async () => {
      const result = await linkActorRelationship(projectId, actorId, type, selectedId);
      setState(result);
      if (result.success) {
        setSelectedId("");
        router.refresh();
      }
    });
  }

  function unlinkRecord(relationshipType: ActorRelationshipType, relatedId: string) {
    startTransition(async () => {
      const result = await unlinkActorRelationship(projectId, actorId, relationshipType, relatedId);
      setState(result);
      if (result.success) router.refresh();
    });
  }

  return (
    <details className="rounded-lg border border-stone-800/80 bg-[#0f1417]">
      <summary className="cursor-pointer px-4 py-4 text-sm font-medium text-amber-300">
        Advanced links &amp; context
      </summary>
      <div className="space-y-5 border-t border-stone-800 p-4">
        <div>
          <p className="citem-label">Quick link</p>
          <div className="mt-2 grid gap-2 md:grid-cols-[180px_minmax(0,1fr)_auto]">
            <select
              className="field"
              value={type}
              onChange={(event) => {
                setType(event.currentTarget.value as ActorRelationshipType);
                setSelectedId("");
              }}
            >
              <option value="mitre">MITRE Technique</option>
              <option value="malware">Malware</option>
              <option value="indicator">Indicator</option>
            </select>
            <select className="field" value={selectedId} onChange={(event) => setSelectedId(event.currentTarget.value)}>
              <option value="">Select existing record</option>
              {available.map((row) => (
                <option key={text(row.id)} value={text(row.id)}>{recordLabel(type, row)}</option>
              ))}
            </select>
            <button className="citem-button" type="button" disabled={pending || !selectedId} onClick={linkRecord}>
              {pending ? "Working…" : "Link"}
            </button>
          </div>
          {state.error ? <p className="mt-2 text-xs text-red-300">{state.error}</p> : null}
          {state.success ? <p className="mt-2 text-xs text-emerald-300">{state.success}</p> : null}
        </div>

        {(Object.keys(relationshipLabels) as ActorRelationshipType[]).map((relationshipType) => (
          <section key={relationshipType}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-stone-200">{relationshipLabels[relationshipType]}</h3>
              <span className="text-xs text-stone-600">{linked[relationshipType].length} linked</span>
            </div>
            {linked[relationshipType].length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {linked[relationshipType].map((row) => (
                  <span
                    key={text(row.id)}
                    className="inline-flex max-w-full items-center gap-2 rounded border border-stone-800 bg-black/20 px-2.5 py-1.5 text-xs text-stone-300"
                  >
                    <span className="max-w-[420px] truncate">{recordLabel(relationshipType, row)}</span>
                    <button
                      type="button"
                      className="text-stone-600 hover:text-red-300"
                      disabled={pending}
                      aria-label={`Unlink ${recordLabel(relationshipType, row)}`}
                      onClick={() => unlinkRecord(relationshipType, text(row.id))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-stone-600">No linked records.</p>
            )}
          </section>
        ))}
      </div>
    </details>
  );
}
