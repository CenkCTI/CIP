import { z } from "zod";

const coverageSchema = z.object({
  status: z.enum(["COMPLETE", "PARTIAL", "DEGRADED", "NO_COVERAGE"]),
  expectation: z.string(),
  dataAvailability: z.string(),
}).passthrough();

export const nodeMeasurementPointSchema = z.object({
  bucketStart: z.iso.datetime({ offset: true }),
  bucketEnd: z.iso.datetime({ offset: true }),
  value: z.number().nullable(),
  coverage: coverageSchema,
  acquisitionBasis: z.unknown(),
  bucketState: z.string(),
  revision: z.number().int().nullable(),
  revisionId: z.string().uuid().nullable(),
  calculatedAt: z.iso.datetime({ offset: true }).nullable(),
  materialized: z.boolean(),
}).passthrough();

export const nodeMeasurementSeriesSchema = z.object({
  measurement: z.object({
    measurementKey: z.string(),
    contractVersion: z.string(),
    calculationVersion: z.string(),
    unit: z.string(),
    timeAxis: z.string(),
    represents: z.string(),
    doesNotRepresent: z.string(),
  }).passthrough(),
  resolution: z.enum(["FIVE_MINUTES", "HOUR", "DAY"]),
  points: z.array(nodeMeasurementPointSchema).max(1000),
}).passthrough();

export const nodeMeasurementEnvelopeSchema = z.object({
  apiVersion: z.literal("v1"),
  generatedAt: z.iso.datetime({ offset: true }),
  data: z.array(nodeMeasurementSeriesSchema).max(8),
  meta: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export type NodeMeasurementSeries = z.infer<typeof nodeMeasurementSeriesSchema>;
