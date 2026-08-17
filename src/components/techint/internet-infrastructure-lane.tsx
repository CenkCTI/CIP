import { NodeSeriesChart } from "./node-series-chart";
import type { NodeMeasurementSeries } from "@/lib/baykush-node/measurement-schema";
import type { NodeRoutingStatus } from "@/lib/baykush-node/routing-schema";
import {
  acquisitionLabel,
  completeAdditiveTotal,
  formatIntegerString,
  seriesForKey,
} from "@/lib/baykush-node/routing";

function metric(value: number | null) {
  return value === null ? "Unavailable" : value.toLocaleString();
}

function time(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "Unknown";
}

function statusText(value: string | null | undefined) {
  return value ?? "UNKNOWN";
}

function MetricCard({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="card panel-corners"><p className="citem-eyebrow">{label}</p><p className="mt-2 text-2xl font-semibold text-stone-100">{value}</p><p className="mt-2 text-xs leading-5 text-stone-500">{note}</p></article>;
}

function SeriesPanel({ title, series }: { title: string; series?: NodeMeasurementSeries }) {
  return <article className="card panel-corners space-y-3"><div><p className="citem-eyebrow">RIPE RIS / BGP telemetry</p><h3 className="mt-1 text-base font-semibold text-stone-100">{title}</h3></div>{series?<NodeSeriesChart series={series}/>:<p className="text-sm text-stone-500">No validated series returned for this measurement.</p>}</article>;
}

export function InternetInfrastructureLane({
  series,
  status,
  statusUnavailable = false,
}: {
  series: readonly NodeMeasurementSeries[];
  status?: NodeRoutingStatus;
  statusUnavailable?: boolean;
}) {
  const updates=seriesForKey(series,"routing.ripe_ris.update_messages");
  const announcements=seriesForKey(series,"routing.ripe_ris.announcement_prefix_events");
  const withdrawals=seriesForKey(series,"routing.ripe_ris.withdrawal_prefix_events");
  const prefixes=seriesForKey(series,"routing.ripe_ris.distinct_prefixes_observed");
  const origins=seriesForKey(series,"routing.ripe_ris.distinct_origin_asns_observed");
  const latest=status?.latest;

  const updateTotal=completeAdditiveTotal(updates);
  const announcementTotal=completeAdditiveTotal(announcements);
  const withdrawalTotal=completeAdditiveTotal(withdrawals);

  return <section className="space-y-4" aria-labelledby="internet-infrastructure-heading">
    <div>
      <p className="citem-eyebrow">Lane 03</p>
      <h2 id="internet-infrastructure-heading" className="citem-section-title">Internet Infrastructure</h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-stone-500">Internet routing observations collected by BAYKUSH Intelligence Node from RIPE NCC Routing Information Service (RIS). These measurements describe observed BGP activity; they are not attack, outage, hijack, attribution, or global-Internet verdicts.</p>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Routing updates" value={metric(updateTotal)} note="Range total is shown only when every returned materialized bucket is numeric and COMPLETE."/>
      <MetricCard label="Announcements" value={metric(announcementTotal)} note="Observed announcement prefix events; an announcement is not an attack."/>
      <MetricCard label="Withdrawals" value={metric(withdrawalTotal)} note="Observed withdrawal prefix events; a withdrawal is not an outage verdict."/>
      <MetricCard label="Latest observed surface" value={latest?`${latest.distinctPrefixesObserved.toLocaleString()} prefixes`:"Unavailable"} note={latest?`${latest.distinctOriginAsnsObserved.toLocaleString()} origin ASNs in the latest minute head. Distinct counts are never summed across buckets.`:"No current routing head was returned."}/>
    </div>

    <section className="space-y-3">
      <div><p className="citem-eyebrow">Routing activity</p><h3 className="text-sm font-semibold text-stone-200">Materialized activity series</h3></div>
      <div className="grid gap-4 xl:grid-cols-3">
        <SeriesPanel title="BGP UPDATE messages" series={updates}/>
        <SeriesPanel title="Announcement prefix events" series={announcements}/>
        <SeriesPanel title="Withdrawal prefix events" series={withdrawals}/>
      </div>
    </section>

    <section className="space-y-3">
      <div><p className="citem-eyebrow">Observed routing surface</p><h3 className="text-sm font-semibold text-stone-200">Collector-visible population</h3></div>
      <div className="grid gap-4 xl:grid-cols-2">
        <SeriesPanel title="Distinct prefixes observed" series={prefixes}/>
        <SeriesPanel title="Distinct origin ASNs observed" series={origins}/>
      </div>
    </section>

    <section className="card panel-corners space-y-4" aria-label="Routing collection integrity">
      <div><p className="citem-eyebrow">Collection integrity</p><h3 className="citem-section-title">Coverage & provenance</h3><p className="mt-1 text-xs text-stone-500">Worker freshness, live collection coverage, current data availability and acquisition basis are separate facts.</p></div>
      {statusUnavailable?<p className="rounded border border-stone-800 px-3 py-2 text-sm text-stone-500">Routing operational status is temporarily unavailable. Materialized routing measurements above remain independently usable where present.</p>:null}
      {status?<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded border border-stone-800 p-3 text-sm"><p className="text-xs uppercase tracking-wide text-stone-500">Stream worker</p><p className="mt-2 font-semibold text-stone-200">{status.stream.heartbeatFreshness}</p><p className="mt-1 text-xs text-stone-500">Session: {statusText(status.stream.latestSessionStatus)}</p><p className="mt-1 text-xs text-stone-500">Last source observation: {time(status.stream.latestSourceObservedAt)}</p></div>
        <div className="rounded border border-stone-800 p-3 text-sm"><p className="text-xs uppercase tracking-wide text-stone-500">Data availability</p><p className="mt-2 font-semibold text-stone-200">{statusText(latest?.dataAvailability)}</p><p className="mt-1 text-xs text-stone-500">Coverage: {statusText(latest?.coverageStatus)}</p><p className="mt-1 text-xs text-stone-500">Latest bucket: {time(latest?.bucketStart)}</p></div>
        <div className="rounded border border-stone-800 p-3 text-sm"><p className="text-xs uppercase tracking-wide text-stone-500">Live collection</p><p className="mt-2 font-semibold text-stone-200">{statusText(latest?.liveCollectionCoverage)}</p><p className="mt-1 text-xs text-stone-500">Acquisition: {acquisitionLabel(latest?.acquisitionBasis)}</p><p className="mt-1 text-xs text-stone-500">Channel: {latest?.acquisitionChannel??"Unknown"}</p></div>
        <div className="rounded border border-stone-800 p-3 text-sm"><p className="text-xs uppercase tracking-wide text-stone-500">Capture population</p><p className="mt-2 font-semibold text-stone-200">{latest?.rrcCount.toLocaleString()??"Unknown"} RRCs observed</p><p className="mt-1 text-xs text-stone-500">Profile: {latest?.captureProfileKey??"Unknown"} {latest?.captureProfileVersion?`/ ${latest.captureProfileVersion}`:""}</p><p className="mt-1 text-xs text-stone-500">Configured profile RRCs: {latest?.captureProfileRrcCount?.toLocaleString()??"Unknown"}</p></div>
      </div>:null}
      {status?<div className="grid gap-3 md:grid-cols-2 text-xs text-stone-500"><div className="rounded border border-stone-800 p-3"><p className="font-medium text-stone-300">Recovery worker</p><p className="mt-1">Heartbeat: {status.recovery.heartbeatFreshness} · latest request: {statusText(status.recovery.latestRequestStatus)}</p><p className="mt-1">Last request completed: {time(status.recovery.latestRequestCompletedAt)}</p></div><div className="rounded border border-stone-800 p-3"><p className="font-medium text-stone-300">Latest minute counts</p><p className="mt-1">Updates {formatIntegerString(latest?.updateMessages)} · announcements {formatIntegerString(latest?.announcementPrefixEvents)} · withdrawals {formatIntegerString(latest?.withdrawalPrefixEvents)}</p></div></div>:null}
    </section>

    <details className="card panel-corners text-sm text-stone-400">
      <summary className="cursor-pointer font-medium text-stone-200">Telemetry semantics & attribution</summary>
      <div className="mt-3 space-y-2 text-xs leading-5"><p><strong className="text-stone-300">Upstream:</strong> RIPE NCC Routing Information Service (RIS). <strong className="text-stone-300">Collection & processing:</strong> BAYKUSH Intelligence Node.</p><p><strong className="text-stone-300">Represents:</strong> {status?.represents??"BGP routing activity observed by the configured RIPE RIS collector population."}</p><p><strong className="text-stone-300">Does not represent:</strong> {status?.doesNotRepresent??"Global Internet totality, cyberattack count, outage count, BGP hijack verdict, attacker origin, victim identity, business impact, risk, severity, or global cyber threat level."}</p><p>Missing coverage is not numeric zero. MRT-recovered availability does not rewrite historical live collection coverage. Observer-population changes must remain visible through capture-profile semantics.</p></div>
    </details>
  </section>;
}
