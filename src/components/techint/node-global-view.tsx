import { NodeSeriesChart } from "./node-series-chart";
import { InternetInfrastructureLane } from "./internet-infrastructure-lane";
import type { NodeMeasurementSeries } from "@/lib/baykush-node/measurement-schema";
import type { NodeRoutingStatus } from "@/lib/baykush-node/routing-schema";
import type { GlobalRange } from "@/lib/baykush-node/range";
import type { NodeComparison } from "@/lib/baykush-node/schemas";

export interface NodeSourceStatusView {
  sourceKey: string;
  displayName: string;
  operationalHealth: string;
  lastSuccessfulCollectionAt: string | null;
  freshness?: string;
  coverage?: string;
  dataAvailability?: string;
  historicalBackfillStatus?: string;
}

const metricLabels: Record<string, string> = {
  "vulnerability.cisa_kev.additions": "CISA KEV additions",
  "vulnerability.nvd.publications": "NVD CVE publications",
  "exploitation.epss.scored_records": "EPSS retained scored records",
  "vulnerability.github_advisory.publications": "GitHub reviewed advisory publications",
  "vulnerability.github_advisory.updates_observed": "GitHub advisory updates observed",
  "vulnerability.cisa_ics.advisory_publications": "CISA ICS advisory publications",
  "vulnerability.cisa_ics.advisory_updates_observed": "CISA ICS advisory updates observed",
  "ioc.threatfox.reporting_volume": "ThreatFox IOC reporting volume",
  "malware.malwarebazaar.sample_reporting": "MalwareBazaar sample reporting",
  "ioc.feodo_tracker.new_records_observed": "Feodo C2 records newly observed",
  "ioc.sslbl.certificate_listings_observed": "SSLBL certificate listings observed",
};

function freshness(value: string | null) {
  return value ? new Date(value).toLocaleString() : "No successful collection reported";
}

function SeriesCard({ series, comparison }: { series: NodeMeasurementSeries; comparison?: NodeComparison }) {
  return (
    <article className="card panel-corners space-y-3">
      <div>
        <p className="citem-eyebrow">{series.measurement.measurementKey}</p>
        <h3 className="mt-1 text-base font-semibold text-stone-100">{metricLabels[series.measurement.measurementKey] ?? series.measurement.measurementKey}</h3>
        <p className="mt-1 text-xs text-stone-500">Unit: {series.measurement.unit}</p>
      </div>
      <NodeSeriesChart series={series} />
      {comparison?.comparisonStatus === "AVAILABLE" ? <div className="rounded border border-stone-800 px-3 py-2 text-xs text-stone-400"><p>Current period: {comparison.current.value ?? "Unavailable"} · Previous period: {comparison.previous.value ?? "Unavailable"}</p><p className="mt-1">Node-computed change: {comparison.absoluteDelta === null ? "Unavailable" : comparison.absoluteDelta} {comparison.percentChange === null ? "" : `(${comparison.percentChange.toFixed(1)}%)`}</p></div>:<div className="rounded border border-stone-800 px-3 py-2 text-xs text-stone-500"><p>Comparison unavailable</p><p>Incomplete or non-comparable coverage</p></div>}
      <details className="rounded border border-stone-800 px-3 py-2 text-xs text-stone-400">
        <summary className="cursor-pointer text-stone-300">Measurement semantics</summary>
        <p className="mt-2"><strong className="text-stone-300">Represents:</strong> {series.measurement.represents}</p>
        <p className="mt-2"><strong className="text-stone-300">Does not represent:</strong> {series.measurement.doesNotRepresent}</p>
        <p className="mt-2">Time axis: {series.measurement.timeAxis} · contract {series.measurement.contractVersion} · calculation {series.measurement.calculationVersion}</p>
      </details>
    </article>
  );
}

export function NodeGlobalView(input: {
  generatedAt: string;
  range: GlobalRange;
  sources: readonly NodeSourceStatusView[];
  vulnerability: readonly NodeMeasurementSeries[];
  malwareIoc: readonly NodeMeasurementSeries[];
  routing: readonly NodeMeasurementSeries[];
  routingStatus?: NodeRoutingStatus;
  routingStatusUnavailable?: boolean;
  comparisons: readonly NodeComparison[];
}) {
  return (
    <section className="space-y-5">
      <header className="citem-page-header">
        <div>
          <p className="citem-eyebrow">CİTEM / TechINT / BAYKUSH Intelligence Node</p>
          <h1 className="citem-title">Global View v2</h1>
          <p className="citem-subtitle">Coverage-aware public technical measurements from the central BAYKUSH Intelligence Node. Vulnerability reporting, malware/IOC reporting, and Internet infrastructure observations remain separate semantic lanes.</p>
          <p className="mt-2 text-xs text-stone-500">Generated {new Date(input.generatedAt).toLocaleString()} · range {input.range.toUpperCase()} · source status {input.sources.length}</p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {input.sources.map((source) => (
          <article className="card panel-corners" key={source.sourceKey}>
            <p className="citem-eyebrow">{source.displayName}</p>
            <p className="mt-2 text-sm font-semibold text-stone-200">{source.operationalHealth}</p>
            <p className="mt-1 text-xs text-stone-500">Last success: {freshness(source.lastSuccessfulCollectionAt)}</p>
            <p className="mt-1 text-xs text-stone-500">Freshness: {source.freshness ?? "UNKNOWN"}</p>
            <p className="mt-1 text-xs text-stone-500">Coverage: {source.coverage ?? "NO_COVERAGE"}</p>
            <p className="mt-1 text-xs text-stone-500">Availability: {source.dataAvailability ?? "UNKNOWN"}</p>
          </article>
        ))}
      </div>

      <section className="space-y-3">
        <div>
          <p className="citem-eyebrow">Lane 01</p>
          <h2 className="citem-section-title">Vulnerability & Exploitation</h2>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {input.vulnerability.map((series) => <SeriesCard key={series.measurement.measurementKey} series={series} comparison={input.comparisons.find(item=>item.measurementKey===series.measurement.measurementKey)} />)}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <p className="citem-eyebrow">Lane 02</p>
          <h2 className="citem-section-title">Malware & IOC</h2>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {input.malwareIoc.map((series) => <SeriesCard key={series.measurement.measurementKey} series={series} comparison={input.comparisons.find(item=>item.measurementKey===series.measurement.measurementKey)} />)}
        </div>
      </section>

      <InternetInfrastructureLane series={input.routing} status={input.routingStatus} statusUnavailable={input.routingStatusUnavailable}/>
    </section>
  );
}
