"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createCampaignProfile,
  updateCampaignProfile,
  type CampaignActionState,
} from "@/app/projects/[id]/campaign-actions";
import { formatDateInput } from "@/lib/cti-schema";

type Row = Record<string, unknown>;
type Filters = {
  q?: string;
  sort?: string;
  active?: string;
  start?: string;
  end?: string;
};
type CampaignRelations = {
  campaignThreatActors?: Row[] | null;
  campaignMalware?: Row[] | null;
  campaignIndicators?: Row[] | null;
  campaignMitre?: Row[] | null;
};

const text = (value: unknown) => String(value ?? "");
const list = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function CampaignFields({ campaign }: { campaign?: Row }) {
  return (
    <>
      <label className="grid gap-1">
        <span className="citem-label">Campaign name</span>
        <input
          className="field"
          name="name"
          required
          maxLength={180}
          defaultValue={text(campaign?.name)}
          placeholder="Operation Example"
        />
      </label>

      <label className="grid gap-1">
        <span className="citem-label">Description</span>
        <textarea
          className="field min-h-28"
          name="description"
          maxLength={20000}
          defaultValue={text(campaign?.description)}
          placeholder="Short factual description of the tracked activity."
        />
      </label>

      <details className="rounded border border-stone-800 bg-black/15 p-3">
        <summary className="cursor-pointer text-sm font-medium text-amber-300">Additional context</summary>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1">
            <span className="citem-label">Start date</span>
            <input className="field" name="start_date" type="date" defaultValue={formatDateInput(campaign?.start_date)} />
          </label>
          <label className="grid gap-1">
            <span className="citem-label">End date</span>
            <input className="field" name="end_date" type="date" defaultValue={formatDateInput(campaign?.end_date)} />
          </label>
          <label className="grid gap-1 md:col-span-2">
            <span className="citem-label">Targets / affected context</span>
            <input
              className="field"
              name="targets"
              defaultValue={list(campaign?.targets).join(", ")}
              placeholder="Government, energy sector, Poland"
            />
            <span className="text-xs text-stone-600">Comma-separated descriptive context. This does not assert actor attribution.</span>
          </label>
        </div>
      </details>
    </>
  );
}

function CampaignModal({
  projectId,
  campaign,
  triggerLabel,
}: {
  projectId: string;
  campaign?: Row;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const editing = Boolean(campaign?.id);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<CampaignActionState>({});

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
        {triggerLabel ?? (editing ? "Edit campaign" : "+ Add campaign")}
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
            aria-label={editing ? "Edit Campaign" : "Add Campaign"}
          >
            <header className="flex items-start justify-between gap-4 border-b border-stone-800 px-5 py-4">
              <div>
                <p className="citem-label">Operational activity</p>
                <h2 className="mt-1 text-xl font-semibold text-stone-100">
                  {editing ? "Edit Campaign" : "Add Campaign"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-stone-500">
                  Record Campaign identity and factual context first. Event membership and attribution remain separate analyst judgements.
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
                    ? await updateCampaignProfile(projectId, text(campaign?.id), formData)
                    : await createCampaignProfile(projectId, formData);
                  setState(result);
                  if (result.success) {
                    setOpen(false);
                    router.refresh();
                  }
                });
              }}
            >
              <CampaignFields campaign={campaign} />
              {state.error ? <p className="text-sm text-red-300">{state.error}</p> : null}
              <div className="flex justify-end gap-2 border-t border-stone-800 pt-4">
                <button className="citem-button-ghost" type="button" onClick={close}>Cancel</button>
                <button className="citem-button" type="submit" disabled={pending}>
                  {pending ? "Saving…" : editing ? "Save campaign" : "Add campaign"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

function countRelation(rows: Row[] | null | undefined, campaignId: string) {
  return (rows ?? []).filter((row) => text(row.campaign_id) === campaignId).length;
}

function eventCount(events: Row[], campaignId: string) {
  return events.filter((event) => {
    const memberships = Array.isArray(event.campaign_timeline_events)
      ? (event.campaign_timeline_events as Row[])
      : [];
    return memberships.some(
      (membership) =>
        text(membership.campaign_id) === campaignId &&
        ["POSSIBLE", "CONFIRMED"].includes(text(membership.status)),
    );
  }).length;
}

function campaignRange(campaign: Row) {
  const start = formatDateInput(campaign.start_date);
  const end = formatDateInput(campaign.end_date);
  if (start && end) return `${start} — ${end}`;
  if (start) return `${start} — ongoing / unknown end`;
  if (end) return `Unknown start — ${end}`;
  return "Timeframe not recorded";
}

export function CampaignDirectory({
  projectId,
  rows,
  events,
  reconstructions,
  relations,
  filters,
}: {
  projectId: string;
  rows: Row[];
  events: Row[];
  reconstructions: Row[];
  relations: CampaignRelations;
  filters: Filters;
}) {
  const reconstructionByCampaign = useMemo(
    () => new Map(reconstructions.map((row) => [text(row.campaign_id), row])),
    [reconstructions],
  );

  return (
    <div className="mt-5 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-stone-800/80 bg-[#0f1417] p-4">
        <div>
          <p className="citem-label">Operational activity</p>
          <h2 className="mt-1 text-xl font-semibold text-stone-100">Campaigns</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-500">
            Track named or analyst-defined activity without forcing attribution or reconstruction decisions.
          </p>
        </div>
        <CampaignModal projectId={projectId} />
      </header>

      <form className="rounded-lg border border-stone-800/80 bg-[#0f1417] p-3">
        <input type="hidden" name="tab" value="campaigns" />
        <div className="flex flex-wrap gap-2">
          <input
            className="field min-w-64 flex-1"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Search Campaigns…"
          />
          <select className="field w-auto min-w-40" name="sort" defaultValue={filters.sort ?? ""}>
            <option value="">Name</option>
            <option value="created">Newest</option>
            <option value="id">ID tie-break</option>
          </select>
          <button className="citem-button-ghost" type="submit">Apply</button>
          <Link className="citem-button-ghost" href={`/projects/${projectId}?tab=campaigns`}>Clear</Link>
        </div>

        <details className="mt-3 rounded border border-stone-800/70 bg-black/10 p-3">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-[0.14em] text-stone-500">
            Advanced filters
          </summary>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <select className="field" name="active" defaultValue={filters.active ?? ""}>
              <option value="">Any recorded timeframe</option>
              <option value="true">Active by recorded dates</option>
            </select>
            <input className="field" name="start" type="date" aria-label="Campaign start after" defaultValue={filters.start ?? ""} />
            <input className="field" name="end" type="date" aria-label="Campaign end before" defaultValue={filters.end ?? ""} />
          </div>
        </details>
      </form>

      {rows.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((campaign) => {
            const campaignId = text(campaign.id);
            const targets = list(campaign.targets);
            const reconstruction = reconstructionByCampaign.get(campaignId);
            const activityStatus = text(reconstruction?.activity_status);
            const eventsCount = eventCount(events, campaignId);
            const techniqueCount = countRelation(relations.campaignMitre, campaignId);
            const malwareCount = countRelation(relations.campaignMalware, campaignId);
            const indicatorCount = countRelation(relations.campaignIndicators, campaignId);

            return (
              <article
                key={campaignId}
                className="group rounded-lg border border-stone-800/80 bg-[#0f1417] p-4 transition hover:border-amber-900/60 hover:bg-[#12191c]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="citem-label">Campaign</p>
                    <h3 className="mt-1 truncate text-xl font-semibold text-stone-100">{text(campaign.name)}</h3>
                    <p className="mt-1 font-mono text-xs text-stone-600">{campaignRange(campaign)}</p>
                  </div>
                  {activityStatus && activityStatus !== "UNKNOWN" ? (
                    <span className="citem-badge" data-tone="attention">{activityStatus}</span>
                  ) : null}
                </div>

                <p className="mt-4 line-clamp-3 text-sm leading-6 text-stone-400">
                  {text(campaign.description) || "No Campaign description recorded."}
                </p>

                {targets.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {targets.slice(0, 4).map((target) => (
                      <span className="citem-badge" key={target}>{target}</span>
                    ))}
                    {targets.length > 4 ? <span className="text-xs text-stone-600">+{targets.length - 4} more</span> : null}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-stone-800/80 pt-3 text-xs text-stone-500">
                  <span>{eventsCount} events</span>
                  <span>{techniqueCount} techniques</span>
                  <span>{malwareCount} malware</span>
                  <span>{indicatorCount} indicators</span>
                </div>

                <div className="mt-4 flex justify-end">
                  <Link
                    className="text-sm font-medium text-amber-300 hover:text-amber-200"
                    href={`/projects/${projectId}/campaigns/${campaignId}`}
                  >
                    Open Campaign →
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-stone-800/80 bg-[#0f1417] p-6 text-sm text-stone-500">
          No Campaigns match this view.
        </div>
      )}
    </div>
  );
}

export function CampaignProfileHeader({
  projectId,
  campaign,
}: {
  projectId: string;
  campaign: Row;
}) {
  const targets = list(campaign.targets);
  return (
    <article className="rounded-lg border border-stone-800/80 bg-[#0f1417] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="citem-label">Operational Campaign</p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-100">{text(campaign.name)}</h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-amber-300">{campaignRange(campaign)}</p>
        </div>
        <CampaignModal projectId={projectId} campaign={campaign} triggerLabel="Edit campaign" />
      </div>

      <p className="mt-5 max-w-4xl whitespace-pre-wrap text-sm leading-7 text-stone-300">
        {text(campaign.description) || "No Campaign description recorded."}
      </p>

      <div className="mt-5 border-t border-stone-800/80 pt-4">
        <p className="citem-label">Targets / affected context</p>
        {targets.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {targets.map((target) => <span className="citem-badge" key={target}>{target}</span>)}
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-600">No target context recorded.</p>
        )}
      </div>
    </article>
  );
}

export function CampaignTechnicalContext({
  projectId,
  actors,
  malware,
  indicators,
  techniques,
}: {
  projectId: string;
  actors: Row[];
  malware: Row[];
  indicators: Row[];
  techniques: Row[];
}) {
  return (
    <section className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-stone-800/80 bg-[#0f1417] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="citem-label">Tradecraft</p>
              <h2 className="mt-1 text-lg font-semibold text-stone-100">MITRE Techniques</h2>
            </div>
            <span className="text-xs text-stone-600">{techniques.length} linked</span>
          </div>
          {techniques.length ? (
            <div className="mt-3 grid gap-2">
              {techniques.map((item) => (
                <Link
                  key={text(item.id)}
                  className="rounded border border-stone-800 bg-black/15 px-3 py-2 text-sm text-stone-300 hover:border-amber-900/60 hover:text-amber-200"
                  href={`/projects/${projectId}/mitre/${text(item.id)}`}
                >
                  <span className="font-mono text-amber-300">{text(item.technique_id)}</span>
                  {" · "}
                  {text(item.technique_name)}
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-stone-600">No MITRE Techniques linked.</p>
          )}
        </div>

        <div className="rounded-lg border border-stone-800/80 bg-[#0f1417] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="citem-label">Technical context</p>
              <h2 className="mt-1 text-lg font-semibold text-stone-100">Malware</h2>
            </div>
            <span className="text-xs text-stone-600">{malware.length} linked</span>
          </div>
          {malware.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {malware.map((item) => (
                <Link
                  key={text(item.id)}
                  className="rounded border border-stone-800 bg-black/15 px-2.5 py-1.5 text-xs text-stone-300 hover:border-amber-900/60 hover:text-amber-200"
                  href={`/projects/${projectId}/malware/${text(item.id)}`}
                >
                  {text(item.name)}
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-stone-600">No Malware linked.</p>
          )}
        </div>
      </div>

      <details className="rounded-lg border border-stone-800/80 bg-[#0f1417]">
        <summary className="cursor-pointer px-4 py-4 text-sm font-medium text-stone-300">
          Linked indicators <span className="ml-2 text-xs text-stone-600">({indicators.length})</span>
        </summary>
        <div className="max-h-72 overflow-y-auto border-t border-stone-800 p-4">
          {indicators.length ? (
            <div className="grid gap-2">
              {indicators.map((item) => (
                <Link
                  key={text(item.id)}
                  className="break-all rounded border border-stone-800 bg-black/15 px-3 py-2 font-mono text-xs text-stone-400 hover:text-amber-200"
                  href={`/projects/${projectId}/indicators/${text(item.id)}`}
                >
                  {text(item.value)}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-600">No Indicators linked.</p>
          )}
        </div>
      </details>

      <details className="rounded-lg border border-stone-800/70 bg-black/10">
        <summary className="cursor-pointer px-4 py-3 text-xs uppercase tracking-[0.12em] text-stone-600">
          Recorded actor relationships <span className="ml-2">({actors.length})</span>
        </summary>
        <div className="border-t border-stone-800 p-4">
          <p className="text-xs leading-5 text-stone-600">
            These are existing direct Campaign relationship records. They do not replace the dedicated Attribution Analysis assessment.
          </p>
          {actors.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {actors.map((item) => (
                <Link
                  key={text(item.id)}
                  className="rounded border border-stone-800 bg-black/15 px-3 py-2 text-sm text-stone-300 hover:border-amber-900/60 hover:text-amber-200"
                  href={`/projects/${projectId}/actors/${text(item.id)}`}
                >
                  {text(item.name)}
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-stone-600">No direct actor relationships recorded.</p>
          )}
        </div>
      </details>
    </section>
  );
}
