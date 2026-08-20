import { describe,expect,it } from "vitest";
import { convergenceFindingSchema,discoverySummarySchema,geographyMapSchema,infrastructureContextSchema } from "./discovery-schema";

describe('NODE-7 CITEM contracts',()=>{
  it('accepts explicit convergence counts without a threat score',()=>{
    const parsed=discoverySummarySchema.parse({convergenceCounts:[{findingType:'MULTI_ORIGIN_CONVERGENCE',count:3}],newEntityCount:2,compositionExpansionCount:1,topMovers:[{entityType:'CVE',entityKey:'CVE-2026-0001',newUpstreamOriginCount:2,newSourceClassCount:1,newSourceDefinitionCount:3,windowStart:'2026-08-18T12:00:00.000Z'}]});
    expect(parsed.convergenceCounts[0]?.count).toBe(3);
    expect('threatScore' in parsed).toBe(false);
  });

  it('preserves DATE precision instead of inventing instant concurrency semantics',()=>{
    const parsed=convergenceFindingSchema.parse({id:'1',findingKey:'a'.repeat(64),findingType:'SOURCE_SYSTEM_OVERLAP',entityType:'CVE',entityKey:'CVE-2026-0001',resolution:'DAY',windowStart:'2026-08-18T00:00:00.000Z',windowEnd:'2026-08-19T00:00:00.000Z',timePrecision:'DATE',sourceDefinitionCount:2,upstreamOriginCount:1,sourceClassCount:1,observationCount:2,observationSpanSeconds:null,policyRevisionId:'p',calculatedAt:'2026-08-18T12:00:00.000Z'});
    expect(parsed.timePrecision).toBe('DATE');
    expect(parsed.findingType).not.toBe('CONCURRENT_MOVEMENT');
  });

  it('keeps geography class explicit',()=>{
    const parsed=geographyMapSchema.parse({geoClass:'OBSERVED_INFRASTRUCTURE_LOCATION',countries:[{countryCode:'PL',countryName:'Poland',observedEntityCount:5,sourceSystemCount:1,upstreamOriginCount:1}]});
    expect(parsed.geoClass).toBe('OBSERVED_INFRASTRUCTURE_LOCATION');
  });

  it('keeps RIPE routing activity semantic boundaries',()=>{
    const parsed=infrastructureContextSchema.parse([{bucketStart:'2026-08-18T12:00:00.000Z',bucketEnd:'2026-08-18T12:01:00.000Z',coveringPrefix:'192.0.2.0/24',activityTypes:['WITHDRAWAL'],coverageStatus:'COMPLETE',dataAvailability:'AVAILABLE',liveCollectionCoverage:'COMPLETE',acquisitionBasis:'LIVE_STREAM',upstreamOrigin:'RIPE_RIS',captureProfile:{key:'p',version:1},semanticBoundary:'Withdrawal is not an outage verdict.'}]);
    expect(parsed[0]?.activityTypes).toEqual(['WITHDRAWAL']);
  });
});
