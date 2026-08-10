export const technicalHistoryGranularities = ["FIVE_MINUTES", "HOUR", "DAY"] as const;
export type TechnicalHistoryGranularity = (typeof technicalHistoryGranularities)[number];

export const technicalHistoryTimeAxes = ["INGESTION_TIME", "SOURCE_EFFECTIVE_TIME"] as const;
export type TechnicalHistoryTimeAxis = (typeof technicalHistoryTimeAxes)[number];

const GRANULARITY_MS: Record<TechnicalHistoryGranularity, number> = {
  FIVE_MINUTES: 5 * 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
};

export function technicalHistoryBucketMilliseconds(granularity: TechnicalHistoryGranularity) {
  return GRANULARITY_MS[granularity];
}

export function floorTechnicalHistoryTime(value: Date | string | number, granularity: TechnicalHistoryGranularity) {
  const input = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(input)) throw new Error("INVALID_HISTORY_TIME");
  const step = technicalHistoryBucketMilliseconds(granularity);
  return new Date(Math.floor(input / step) * step);
}

export function boundedTechnicalHistoryWindow(input: {
  from: Date | string | number;
  to: Date | string | number;
  granularity: TechnicalHistoryGranularity;
  maxBuckets: number;
}) {
  if (!Number.isInteger(input.maxBuckets) || input.maxBuckets < 1 || input.maxBuckets > 96) {
    throw new Error("INVALID_HISTORY_WINDOW");
  }
  const from = floorTechnicalHistoryTime(input.from, input.granularity);
  const ceiling = floorTechnicalHistoryTime(input.to, input.granularity);
  if (ceiling.getTime() <= from.getTime()) {
    return { from, to: from, bucketCount: 0 };
  }
  const step = technicalHistoryBucketMilliseconds(input.granularity);
  const to = new Date(Math.min(ceiling.getTime(), from.getTime() + step * input.maxBuckets));
  return { from, to, bucketCount: Math.floor((to.getTime() - from.getTime()) / step) };
}

export function recentTechnicalHistoryWindows(now: Date = new Date()) {
  const end = new Date(now);
  return [
    { granularity: "FIVE_MINUTES" as const, from: new Date(end.getTime() - 2 * 60 * 60 * 1000), to: end },
    { granularity: "HOUR" as const, from: new Date(end.getTime() - 48 * 60 * 60 * 1000), to: end },
    { granularity: "DAY" as const, from: new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000), to: end },
  ];
}
