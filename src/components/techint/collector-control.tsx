"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  configureTechnicalCollector,
  type TechnicalCollectorActionState,
} from "@/app/techint/sources/actions";

export type TechnicalCollectorAgentView = {
  id: string;
  label: string;
  enabled: boolean;
  poll_interval_seconds: number;
  next_tick_at: string | null;
  last_heartbeat_at: string | null;
  last_tick_started_at: string | null;
  last_tick_completed_at: string | null;
  last_tick_status: string;
  last_claimed_count: number;
  last_succeeded_count: number;
  last_failed_count: number;
  last_error_code: string | null;
};

function time(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function heartbeatState(agent: TechnicalCollectorAgentView | null) {
  if (!agent?.enabled) return "PAUSED";
  if (!agent.last_heartbeat_at) return "WAITING FOR DESKTOP COLLECTOR";
  const age = Date.now() - new Date(agent.last_heartbeat_at).getTime();
  const tolerance = Math.max(120_000, agent.poll_interval_seconds * 3_000);
  return age <= tolerance ? "ONLINE" : "OFFLINE / CATCH-UP PENDING";
}

export function CollectorControl({ agent }: { agent: TechnicalCollectorAgentView | null }) {
  const [state, action, pending] = useActionState<TechnicalCollectorActionState, FormData>(configureTechnicalCollector, {});
  const poll = agent?.poll_interval_seconds ?? 60;
  const status = heartbeatState(agent);
  const command = state.token
    ? `CITEM_COLLECTOR_URL="<PREVIEW_URL>" CITEM_COLLECTOR_TOKEN="${state.token}" npm run techint:collector`
    : null;

  return (
    <section className="card panel-corners space-y-4 border-l-2 border-l-amber-500/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="citem-eyebrow">Phase 2.3F-A/B / Continuous collection &amp; history</p>
          <h2 className="citem-section-title mt-1">Desktop collector</h2>
          <p className="mt-2 max-w-3xl text-sm text-stone-400">
            The desktop companion owns the long-running collection loop even when the browser is closed. It claims one due source and drains it through bounded server work units, then requests rate-gated historical activity/coverage maintenance. Provider API keys and the Supabase service role remain server-side.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link className="citem-button-ghost" href="/techint/sources/history">History diagnostics</Link>
          <span className="rounded border border-stone-700 px-2 py-1 text-xs font-semibold text-stone-300">{status}</span>
        </div>
      </div>

      <dl className="grid gap-2 text-xs text-stone-400 sm:grid-cols-2 lg:grid-cols-4">
        <div><dt>Mode</dt><dd className="text-stone-200">{agent?.enabled ? "CONTINUOUS" : "MANUAL"}</dd></div>
        <div><dt>Collector poll</dt><dd className="text-stone-200">{poll}s</dd></div>
        <div><dt>Last heartbeat</dt><dd className="text-stone-200">{time(agent?.last_heartbeat_at ?? null)}</dd></div>
        <div><dt>Last tick</dt><dd className="text-stone-200">{agent?.last_tick_status ?? "—"}</dd></div>
        <div><dt>Last tick started</dt><dd className="text-stone-200">{time(agent?.last_tick_started_at ?? null)}</dd></div>
        <div><dt>Last tick completed</dt><dd className="text-stone-200">{time(agent?.last_tick_completed_at ?? null)}</dd></div>
        <div><dt>Last result</dt><dd className="text-stone-200">{agent ? `${agent.last_succeeded_count}/${agent.last_claimed_count} succeeded` : "—"}</dd></div>
        <div><dt>Last safe error</dt><dd className="text-stone-200">{agent?.last_error_code ?? "—"}</dd></div>
      </dl>

      <div className="grid gap-3 lg:grid-cols-2">
        <form action={action} className="space-y-2 rounded border border-stone-800 p-3">
          <input type="hidden" name="operation" value="ENABLE" />
          <label className="block text-xs text-stone-400" htmlFor="collector-poll">Scheduler poll seconds</label>
          <input className="field" id="collector-poll" name="poll_interval_seconds" type="number" min="30" max="3600" defaultValue={poll} />
          <p className="text-xs text-stone-500">This controls how often the desktop companion checks for due work. It does not force every upstream provider to synchronize at that frequency; each Technical Source keeps its own safe interval.</p>
          <button className="citem-button" type="submit" disabled={pending}>{pending ? "Saving…" : agent?.enabled ? "Save / keep continuous" : "Enable continuous collection"}</button>
        </form>

        <div className="space-y-2 rounded border border-stone-800 p-3">
          <p className="text-xs text-stone-400">Collector credential</p>
          <p className="text-xs text-stone-500">The owner-bound bearer capability is shown only when first created or rotated. Rotation immediately invalidates the previous local collector token.</p>
          <form action={action} className="inline-block">
            <input type="hidden" name="operation" value="ROTATE" />
            <input type="hidden" name="poll_interval_seconds" value={poll} />
            <button className="citem-button-ghost" type="submit" disabled={pending}>{agent ? "Rotate collector token" : "Create collector token"}</button>
          </form>
          {agent?.enabled ? (
            <form action={action} className="ml-2 inline-block">
              <input type="hidden" name="operation" value="PAUSE" />
              <input type="hidden" name="poll_interval_seconds" value={poll} />
              <button className="citem-button-ghost" type="submit" disabled={pending}>Pause continuous collection</button>
            </form>
          ) : null}
        </div>
      </div>

      {state.error ? <p className="text-sm text-red-300" role="alert">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-300" role="status">{state.success}</p> : null}

      {command ? (
        <div className="space-y-2 rounded border border-amber-800/70 bg-amber-950/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">One-time collector token</p>
          <p className="text-xs text-stone-400">Replace &lt;PREVIEW_URL&gt; with the current CİTEM Preview URL. Run this from a local checkout of CİTEM. Do not share the token or commit it to a file.</p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-stone-200">{command}</pre>
          <p className="text-xs text-stone-500">
            Protected Vercel Previews require an automation bypass secret for non-browser processes. When Preview Deployment Protection is enabled, add <code>CITEM_VERCEL_BYPASS_SECRET=&quot;&lt;secret&gt;&quot;</code> to the local command; the bypass secret is never sent to upstream intelligence providers.
          </p>
        </div>
      ) : null}

      <p className="text-xs text-stone-500">
        Catch-up is source-dependent: cursor/window sources can recover bounded offline gaps; snapshot-only sources recover current state but cannot reconstruct every intermediate state that the upstream provider no longer exposes. Intermediate bounded work never advances the authoritative source cursor. Historical rollups are derived and recomputable; collection coverage is tracked separately so a missing collection period is never presented as zero activity.
      </p>
    </section>
  );
}
