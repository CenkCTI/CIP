import Link from "next/link";
import {
  setTechnicalProfileMatchLifecycle,
  unsnoozeTechnicalProfileMatch,
} from "@/app/techint/matches/actions";
import { profileMatchReasonLabel } from "@/lib/techint/matching/engine";
import { globalPriorityReasonLabel } from "@/lib/techint/priority/engine";
import type { ProfileFeedItem } from "@/lib/techint/intelligence/queries";
import type { IntelProfileItem } from "@/lib/techint/schema";

type Action = (formData: FormData) => void | Promise<void>;
const asFormAction = (action: unknown) => action as Action;

export function IntelProfileSignalFeed({
  items,
  matches,
  total,
  page,
  pageSize,
  baseHref,
}: {
  items: IntelProfileItem[];
  matches: ProfileFeedItem[];
  total: number;
  page: number;
  pageSize: number;
  baseHref: string;
}) {
  const itemLabels = new Map(items.map((item) => [item.id, item.display_value]));
  const newCount = matches.filter((match) => match.lifecycle === "NEW").length;
  const criticalCount = matches.filter((match) => match.globalPriority?.priority === "CRITICAL").length;
  const highCount = matches.filter((match) => match.relevance === "HIGH").length;
  const pendingCount = matches.filter((match) => match.pending_identity_count > 0).length;
  const hasNext = (page + 1) * pageSize < total;

  return (
    <section className="space-y-4">
      <div className="card panel-corners border-l-2 border-l-amber-500/60">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="citem-eyebrow">Live intelligence feed</p>
            <h2 className="citem-section-title mt-1">Matched Technical Signals</h2>
            <p className="mt-2 max-w-3xl text-sm text-stone-400">
              Entity normalization improves match quality but does not gate visibility. Source-backed provisional matches remain visible until identity resolution catches up.
            </p>
          </div>
          <span className="rounded border border-stone-800 px-3 py-2 text-xs text-stone-400">{total} active match(es)</span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="New on this page" value={newCount} />
          <Metric label="Critical global priority" value={criticalCount} />
          <Metric label="High relevance" value={highCount} />
          <Metric label="Identity pending" value={pendingCount} />
        </div>
      </div>

      {!matches.length ? (
        <div className="card">
          <p className="text-sm text-stone-500">No active Technical Signal matches are currently projected for this profile.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((match) => (
            <article key={match.id} className="card panel-corners">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.13em]">
                    <span className="rounded border border-amber-900/60 px-2 py-1 text-amber-300">{match.globalPriority?.priority ?? "UNRANKED"} global</span>
                    <span className="rounded border border-stone-700 px-2 py-1 text-stone-300">{match.relevance} relevance</span>
                    <span className="rounded border border-stone-700 px-2 py-1 text-stone-400">{match.match_quality}</span>
                    <span className="rounded border border-stone-800 px-2 py-1 text-stone-500">{match.lifecycle}</span>
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-stone-100">{match.signal.title}</h3>
                  <p className="mt-1 text-xs text-stone-500">
                    {match.signal.signal_type} · last seen {new Date(match.signal.last_seen_at).toLocaleString()}
                  </p>
                </div>
                {match.pending_identity_count > 0 && (
                  <span className="rounded border border-yellow-900/60 bg-yellow-950/10 px-2.5 py-1.5 text-xs text-yellow-200">
                    {match.pending_identity_count} identity pending
                  </span>
                )}
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="citem-eyebrow">Why this matched</p>
                  <ul className="mt-2 space-y-1 text-sm text-stone-300">
                    {match.reason_codes.map((reason) => <li key={reason}>• {profileMatchReasonLabel(reason, itemLabels)}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="citem-eyebrow">Global technical context</p>
                  <ul className="mt-2 space-y-1 text-sm text-stone-400">
                    {(match.globalPriority?.reason_codes ?? []).slice(0, 6).map((reason) => <li key={reason}>• {globalPriorityReasonLabel(reason)}</li>)}
                    {!match.globalPriority && <li>Priority projection is not available yet.</li>}
                  </ul>
                </div>
              </div>

              {match.pending_identity_count > 0 && (
                <div className="mt-4 rounded border border-stone-800 bg-stone-950/20 p-3">
                  <p className="citem-eyebrow">Identity pending</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-300">
                    {match.pendingIdentities.slice(0, 6).map((identity) => (
                      <span key={identity.id} className="rounded border border-stone-800 px-2 py-1">
                        {identity.entityKind} · {identity.displayValue}
                      </span>
                    ))}
                    {match.pendingIdentities.length === 0 && <span>{match.pending_identity_count} unresolved identity assertion(s).</span>}
                  </div>
                </div>
              )}

              <MatchActions match={match} />
            </article>
          ))}
        </div>
      )}

      {(page > 0 || hasNext) && (
        <div className="flex items-center justify-between gap-3 text-sm">
          {page > 0 ? <Link className="citem-button-ghost" href={`${baseHref}?matchPage=${page - 1}`}>Previous matches</Link> : <span />}
          <span className="text-stone-500">Page {page + 1}</span>
          {hasNext ? <Link className="citem-button-ghost" href={`${baseHref}?matchPage=${page + 1}`}>Next matches</Link> : <span />}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-stone-800 bg-stone-950/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.13em] text-stone-600">{label}</p>
      <p className="mt-1 text-lg font-semibold text-stone-200">{value}</p>
    </div>
  );
}

function MatchActions({ match }: { match: ProfileFeedItem }) {
  if (match.lifecycle === "SNOOZED") {
    return (
      <div className="mt-4 border-t border-stone-800 pt-3">
        <form action={asFormAction(unsnoozeTechnicalProfileMatch.bind(null, match.id))}>
          <button className="citem-button-ghost">Unsnooze</button>
        </form>
      </div>
    );
  }

  const actions: Array<{ label: string; lifecycle: "REVIEWED" | "ACCEPTED" | "DISMISSED" | "NOT_RELEVANT" }> = [];
  if (match.lifecycle === "NEW") actions.push({ label: "Mark reviewed", lifecycle: "REVIEWED" });
  if (["NEW", "REVIEWED", "DISMISSED", "NOT_RELEVANT"].includes(match.lifecycle)) actions.push({ label: "Accept", lifecycle: "ACCEPTED" });
  if (["NEW", "REVIEWED", "ACCEPTED"].includes(match.lifecycle)) {
    actions.push({ label: "Not relevant", lifecycle: "NOT_RELEVANT" });
    actions.push({ label: "Dismiss", lifecycle: "DISMISSED" });
  }
  if (["DISMISSED", "NOT_RELEVANT", "ACCEPTED"].includes(match.lifecycle)) actions.push({ label: "Review again", lifecycle: "REVIEWED" });

  return (
    <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-800 pt-3">
      {actions.map((action) => (
        <form key={action.lifecycle} action={asFormAction(setTechnicalProfileMatchLifecycle.bind(null, match.id, action.lifecycle, null))}>
          <button className="citem-button-ghost">{action.label}</button>
        </form>
      ))}
      <form action={asFormAction(setTechnicalProfileMatchLifecycle.bind(null, match.id, "SNOOZED", 24))}>
        <button className="citem-button-ghost">Snooze 24h</button>
      </form>
    </div>
  );
}
