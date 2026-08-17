import type { NodeMeasurementSeries } from "./measurement-schema";

export const VULNERABILITY_MEASUREMENTS = [
  "vulnerability.cisa_kev.additions",
  "vulnerability.nvd.publications",
  "exploitation.epss.scored_records",
  "vulnerability.github_advisory.publications",
  "vulnerability.github_advisory.updates_observed",
  "vulnerability.cisa_ics.advisory_publications",
  "vulnerability.cisa_ics.advisory_updates_observed",
] as const;

export const MALWARE_IOC_MEASUREMENTS = [
  "ioc.threatfox.reporting_volume",
  "malware.malwarebazaar.sample_reporting",
  "ioc.feodo_tracker.new_records_observed",
  "ioc.sslbl.certificate_listings_observed",
] as const;

export const ROUTING_MEASUREMENTS = [
  "routing.ripe_ris.update_messages",
  "routing.ripe_ris.announcement_prefix_events",
  "routing.ripe_ris.withdrawal_prefix_events",
  "routing.ripe_ris.distinct_prefixes_observed",
  "routing.ripe_ris.distinct_announced_prefixes",
  "routing.ripe_ris.distinct_withdrawn_prefixes",
  "routing.ripe_ris.distinct_origin_asns_observed",
] as const;

export const GLOBAL_MEASUREMENTS = [
  ...VULNERABILITY_MEASUREMENTS,
  ...MALWARE_IOC_MEASUREMENTS,
  ...ROUTING_MEASUREMENTS,
] as const;

export const COMPARABLE_MEASUREMENTS = [
  ...VULNERABILITY_MEASUREMENTS,
  ...MALWARE_IOC_MEASUREMENTS,
] as const;

export function routingSeries(series: readonly NodeMeasurementSeries[]): NodeMeasurementSeries[] {
  const allowed = new Set<string>(ROUTING_MEASUREMENTS);
  return series.filter((item) => allowed.has(item.measurement.measurementKey));
}

export function seriesForKey(
  series: readonly NodeMeasurementSeries[],
  measurementKey: string,
): NodeMeasurementSeries | undefined {
  return series.find((item) => item.measurement.measurementKey === measurementKey);
}

export function completeAdditiveTotal(series: NodeMeasurementSeries | undefined): number | null {
  if (!series || series.points.length === 0) return null;
  let total = 0;
  for (const point of series.points) {
    if (point.value === null || point.coverage.status !== "COMPLETE") return null;
    total += point.value;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

export function latestObservedPoint(series: NodeMeasurementSeries | undefined) {
  if (!series) return null;
  for (let index = series.points.length - 1; index >= 0; index -= 1) {
    const point = series.points[index];
    if (point && point.value !== null) return point;
  }
  return null;
}

export function acquisitionLabel(value: string | null | undefined): string {
  if (value === "LIVE_STREAM") return "Live stream";
  if (value === "MRT_RECOVERY") return "MRT recovery";
  if (value === "MIXED") return "Live + recovered";
  if (value === "HISTORICAL_BACKFILL") return "Historical recovery";
  return value ?? "Unknown";
}

export function formatIntegerString(value: string | null | undefined): string {
  if (!value) return "Unknown";
  try {
    return BigInt(value).toLocaleString("en-US");
  } catch {
    return "Unknown";
  }
}
