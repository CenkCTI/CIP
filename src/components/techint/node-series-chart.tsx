import type { NodeMeasurementSeries } from "@/lib/baykush-node/measurement-schema";
import Link from "next/link";

function finiteValues(series: NodeMeasurementSeries) {
  return series.points.flatMap((point) => point.value === null ? [] : [point.value]);
}

export function NodeSeriesChart({ series }: { series: NodeMeasurementSeries }) {
  const values = finiteValues(series);
  const maximum = Math.max(1, ...values);
  const width = 720;
  const height = 180;
  const count = Math.max(1, series.points.length);
  const step = width / count;

  return (
    <div className="space-y-2">
      <svg className="h-44 w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={series.measurement.measurementKey}>
        <line x1="0" y1={height - 1} x2={width} y2={height - 1} className="stroke-stone-800" />
        {series.points.map((point, index) => {
          const x = index * step;
          if (point.value === null) {
            return <rect key={point.bucketStart} x={x + step * 0.15} y="8" width={Math.max(1, step * 0.7)} height={height - 16} className="fill-stone-900/20 stroke-stone-800" strokeDasharray="3 4" />;
          }
          const barHeight = Math.max(1, (point.value / maximum) * (height - 18));
          return (
            <rect
              key={point.bucketStart}
              x={x + step * 0.15}
              y={height - barHeight}
              width={Math.max(1, step * 0.7)}
              height={barHeight}
              className="fill-amber-500/55"
            >
              <title>{`${new Date(point.bucketStart).toLocaleString()} · ${point.value} · ${point.coverage.status}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-3 text-[11px] text-stone-500">
        <span>Resolution: {series.resolution}</span>
        <span>Unit: {series.measurement.unit}</span>
        <span>Dashed buckets: unavailable / unproven data, not zero.</span>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px]">{series.points.filter(point=>point.revisionId).slice(-8).map(point=><Link className="text-amber-300 hover:text-amber-200" key={point.revisionId} href={`/techint/global/provenance/${point.revisionId}?measurementKey=${encodeURIComponent(series.measurement.measurementKey)}&bucketStart=${encodeURIComponent(point.bucketStart)}&bucketEnd=${encodeURIComponent(point.bucketEnd)}&value=${point.value??''}&coverage=${encodeURIComponent(point.coverage.status)}&availability=${encodeURIComponent(point.coverage.dataAvailability)}`}>{new Date(point.bucketStart).toLocaleString()} provenance</Link>)}</div>
    </div>
  );
}
