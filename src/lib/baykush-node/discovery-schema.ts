import { z } from "zod";

export const discoveryMoverSchema=z.object({
  entityType:z.string(),entityKey:z.string(),newUpstreamOriginCount:z.number().int().nonnegative(),
  newSourceClassCount:z.number().int().nonnegative(),newSourceDefinitionCount:z.number().int().nonnegative(),
  windowStart:z.coerce.string(),
}).passthrough();

export const discoverySummarySchema=z.object({
  convergenceCounts:z.array(z.object({findingType:z.string(),count:z.number().int().nonnegative()}).passthrough()).max(20),
  newEntityCount:z.number().int().nonnegative(),
  compositionExpansionCount:z.number().int().nonnegative(),
  topMovers:z.array(discoveryMoverSchema).max(10),
}).passthrough();

export const convergenceFindingSchema=z.object({
  id:z.string(),findingKey:z.string(),findingType:z.enum([
    'SOURCE_SYSTEM_OVERLAP','MULTI_ORIGIN_CONVERGENCE','CROSS_CLASS_CONVERGENCE','CONCURRENT_MOVEMENT',
  ]),entityType:z.string(),entityKey:z.string(),resolution:z.enum(['HOUR','DAY']),windowStart:z.coerce.string(),windowEnd:z.coerce.string(),
  timePrecision:z.enum(['INSTANT','DATE','MIXED']),sourceDefinitionCount:z.number().int().nonnegative(),upstreamOriginCount:z.number().int().nonnegative(),
  sourceClassCount:z.number().int().nonnegative(),observationCount:z.number().int().nonnegative(),firstObservedTime:z.coerce.string().nullable().optional(),
  lastObservedTime:z.coerce.string().nullable().optional(),firstObservedDate:z.coerce.string().nullable().optional(),lastObservedDate:z.coerce.string().nullable().optional(),
  observationSpanSeconds:z.union([z.string(),z.number()]).nullable(),policyRevisionId:z.string(),calculatedAt:z.coerce.string(),
}).passthrough();

export const newEntityFindingSchema=z.object({
  id:z.string(),findingKey:z.string(),findingType:z.enum(['NEW_ENTITY','HISTORICAL_DISCOVERY']),entityType:z.string(),entityKey:z.string(),
  effectiveFirstSeenTime:z.coerce.string().nullable().optional(),effectiveFirstSeenDate:z.coerce.string().nullable().optional(),timePrecision:z.enum(['INSTANT','DATE']).nullable(),
  nodeDiscoveredAt:z.coerce.string(),acquisitionBasis:z.string().nullable(),policyRevisionId:z.string(),calculatedAt:z.coerce.string(),
}).passthrough();

export const compositionFindingSchema=z.object({
  id:z.string(),findingKey:z.string(),entityType:z.string(),entityKey:z.string(),windowStart:z.coerce.string(),windowEnd:z.coerce.string(),
  newSourceDefinitionCount:z.number().int().nonnegative(),newUpstreamOriginCount:z.number().int().nonnegative(),newSourceClassCount:z.number().int().nonnegative(),
  newSourceDefinitionKeys:z.array(z.string()).max(100),newUpstreamOriginKeys:z.array(z.string()).max(100),newSourceClasses:z.array(z.string()).max(100),
  policyRevisionId:z.string(),calculatedAt:z.coerce.string(),
}).passthrough();

export const geographyCountrySchema=z.object({
  countryCode:z.string().length(2),countryName:z.string().nullable().optional(),observedEntityCount:z.number().int().nonnegative(),
  sourceSystemCount:z.number().int().nonnegative(),upstreamOriginCount:z.number().int().nonnegative(),
}).passthrough();
export const geographyMapSchema=z.object({
  geoClass:z.enum(['OBSERVED_INFRASTRUCTURE_LOCATION','REPORTED_TARGET','REPORTED_ACTIVITY']),
  countries:z.array(geographyCountrySchema).max(250),
}).passthrough();

export const entityGeographySchema=z.array(z.object({
  id:z.string(),geoClass:z.enum(['OBSERVED_INFRASTRUCTURE_LOCATION','REPORTED_TARGET','REPORTED_ACTIVITY']),countryCode:z.string().length(2).nullable(),
  countryName:z.string().nullable(),continentCode:z.string().nullable(),continentName:z.string().nullable(),locationPrecision:z.string(),basisType:z.string(),basisSourceKey:z.string(),
  upstreamOriginKey:z.string(),observedTime:z.coerce.string().nullable(),observedDate:z.coerce.string().nullable(),timePrecision:z.enum(['INSTANT','DATE']),temporalPolicy:z.enum(['HISTORICAL','CURRENT_SNAPSHOT_ONLY']),
  qualityClass:z.string(),providerContext:z.record(z.string(),z.unknown()),policyRevisionId:z.string(),createdAt:z.coerce.string(),
}).passthrough()).max(50);

export const relatedRecordsResponseSchema=z.object({
  relationshipBasis:z.literal('EXACT_CANONICAL_ENTITY_OVERLAP'),
  records:z.array(z.object({id:z.string(),sourceKey:z.string(),sourceClass:z.string(),upstreamOriginKey:z.string(),sourceRecordId:z.string(),canonicalKey:z.string(),recordKind:z.string()}).passthrough()).max(100),
  nextCursor:z.string().nullable(),
}).passthrough();

const lineageNodeSchema=z.object({id:z.string(),type:z.string(),data:z.record(z.string(),z.unknown())}).passthrough();
const lineageEdgeSchema=z.object({from:z.string(),to:z.string(),relation:z.string()}).passthrough();
export const lineageResponseSchema=z.object({nodes:z.array(lineageNodeSchema).max(100),edges:z.array(lineageEdgeSchema).max(200),truncated:z.boolean()}).passthrough();

export const infrastructureContextSchema=z.array(z.object({
  bucketStart:z.coerce.string(),bucketEnd:z.coerce.string(),coveringPrefix:z.string(),activityTypes:z.array(z.enum(['ANNOUNCEMENT','WITHDRAWAL','OBSERVED'])).min(1).max(2),
  coverageStatus:z.string(),dataAvailability:z.string(),liveCollectionCoverage:z.string(),acquisitionBasis:z.string(),upstreamOrigin:z.literal('RIPE_RIS'),
  captureProfile:z.object({key:z.string().nullable(),version:z.number().int().nullable()}),semanticBoundary:z.string(),
}).passthrough()).max(500);

export type NodeDiscoverySummary=z.infer<typeof discoverySummarySchema>;
export type NodeConvergenceFinding=z.infer<typeof convergenceFindingSchema>;
export type NodeNewEntityFinding=z.infer<typeof newEntityFindingSchema>;
export type NodeCompositionFinding=z.infer<typeof compositionFindingSchema>;
export type NodeGeographyMap=z.infer<typeof geographyMapSchema>;
