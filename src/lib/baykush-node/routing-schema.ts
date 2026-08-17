import { z } from "zod";

const countStringSchema = z.string().regex(/^\d+$/);
const heartbeatFreshnessSchema = z.enum(["FRESH", "STALE", "UNKNOWN"]);
const coverageSchema = z.enum(["COMPLETE", "PARTIAL", "DEGRADED", "NO_COVERAGE"]);
const availabilitySchema = z.enum(["AVAILABLE", "PARTIAL", "UNAVAILABLE", "UNKNOWN"]);
const acquisitionBasisSchema = z.enum(["LIVE_STREAM", "MRT_RECOVERY", "HISTORICAL_BACKFILL"]);

export const routingStatusSchema = z.object({
  sourceKey: z.literal("RIPE_RIS_BGP"),
  displayName: z.string(),
  authority: z.literal("BAYKUSH_INTELLIGENCE_NODE"),
  upstreamOrigin: z.literal("RIPE_RIS"),
  attribution: z.string(),
  represents: z.string(),
  doesNotRepresent: z.string(),
  stream: z.object({
    heartbeatAt: z.iso.datetime({ offset: true }).nullable(),
    heartbeatFreshness: heartbeatFreshnessSchema,
    latestSessionStatus: z.string().nullable(),
    latestSessionStartedAt: z.iso.datetime({ offset: true }).nullable(),
    latestSessionConnectedAt: z.iso.datetime({ offset: true }).nullable(),
    latestSessionEndedAt: z.iso.datetime({ offset: true }).nullable(),
    latestSourceObservedAt: z.iso.datetime({ offset: true }).nullable(),
    latestNodeReceivedAt: z.iso.datetime({ offset: true }).nullable(),
    messagesObserved: countStringSchema.nullable(),
    segmentsPersisted: countStringSchema.nullable(),
  }).passthrough(),
  recovery: z.object({
    heartbeatAt: z.iso.datetime({ offset: true }).nullable(),
    heartbeatFreshness: heartbeatFreshnessSchema,
    latestRequestStatus: z.string().nullable(),
    latestRequestCreatedAt: z.iso.datetime({ offset: true }).nullable(),
    latestRequestStartedAt: z.iso.datetime({ offset: true }).nullable(),
    latestRequestCompletedAt: z.iso.datetime({ offset: true }).nullable(),
  }).passthrough(),
  latest: z.object({
    bucketStart: z.iso.datetime({ offset: true }),
    bucketEnd: z.iso.datetime({ offset: true }),
    updateMessages: countStringSchema,
    announcementPrefixEvents: countStringSchema,
    withdrawalPrefixEvents: countStringSchema,
    distinctPrefixesObserved: z.number().int().nonnegative(),
    distinctOriginAsnsObserved: z.number().int().nonnegative(),
    rrcCount: z.number().int().nonnegative(),
    coverageStatus: coverageSchema,
    dataAvailability: availabilitySchema,
    acquisitionBasis: acquisitionBasisSchema,
    acquisitionChannel: z.string().nullable(),
    liveCollectionCoverage: coverageSchema,
    captureProfileKey: z.string().nullable(),
    captureProfileVersion: z.string().nullable(),
    captureProfileRrcCount: z.number().int().nonnegative().nullable(),
  }).passthrough().nullable(),
}).passthrough();

export type NodeRoutingStatus = z.infer<typeof routingStatusSchema>;
