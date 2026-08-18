import { describe, expect, it } from "vitest";
import type { NodeMeasurementSeries } from "./measurement-schema";
import { completeAdditiveTotal, formatIntegerString, routingSeries } from "./routing";
import { routingStatusSchema } from "./routing-schema";

function series(key:string, points:Array<{value:number|null;coverage:string}>):NodeMeasurementSeries{
  return {
    measurement:{measurementKey:key,contractVersion:"v1",calculationVersion:"v1",unit:"count",timeAxis:"SOURCE_OBSERVED_TIME",represents:"test",doesNotRepresent:"test"},
    resolution:"FIVE_MINUTES",
    points:points.map((point,index)=>({bucketStart:`2026-08-18T00:${String(index*5).padStart(2,"0")}:00.000Z`,bucketEnd:`2026-08-18T00:${String(index*5+5).padStart(2,"0")}:00.000Z`,value:point.value,coverage:{status:point.coverage as "COMPLETE",expectation:"EXPECTED",dataAvailability:"AVAILABLE"},acquisitionBasis:null,bucketState:"SETTLED",revision:1,revisionId:null,calculatedAt:null,materialized:true})),
  };
}

const bucket=(overrides:Record<string,unknown>={})=>({bucketStart:"2026-08-17T23:59:00.000Z",bucketEnd:"2026-08-18T00:00:00.000Z",updateMessages:"0",announcementPrefixEvents:"0",withdrawalPrefixEvents:"0",distinctPrefixesObserved:0,distinctOriginAsnsObserved:0,rrcCount:1,coverageStatus:"COMPLETE",dataAvailability:"AVAILABLE",acquisitionBasis:"LIVE_STREAM",acquisitionChannel:"RIS_LIVE_WEBSOCKET",liveCollectionCoverage:"COMPLETE",captureProfileKey:"test",captureProfileVersion:"v1",captureProfileRrcCount:1,...overrides});

describe("CİTEM Internet Infrastructure adapter",()=>{
  it("sums additive routing counts only across fully proven buckets",()=>{
    expect(completeAdditiveTotal(series("routing.ripe_ris.update_messages",[{value:2,coverage:"COMPLETE"},{value:3,coverage:"COMPLETE"}]))).toBe(5);
    expect(completeAdditiveTotal(series("routing.ripe_ris.update_messages",[{value:2,coverage:"COMPLETE"},{value:null,coverage:"NO_COVERAGE"}]))).toBeNull();
    expect(completeAdditiveTotal(series("routing.ripe_ris.update_messages",[{value:2,coverage:"PARTIAL"}]))).toBeNull();
  });

  it("keeps routing measurements in a separate semantic lane",()=>{
    const input=[series("routing.ripe_ris.update_messages",[{value:1,coverage:"COMPLETE"}]),series("ioc.threatfox.reporting_volume",[{value:1,coverage:"COMPLETE"}])];
    expect(routingSeries(input).map(item=>item.measurement.measurementKey)).toEqual(["routing.ripe_ris.update_messages"]);
  });

  it("formats large count strings without Number precision loss",()=>{
    expect(formatIntegerString("9007199254740993")).toBe(BigInt("9007199254740993").toLocaleString("en-US"));
  });

  it("validates current live state and retained recovered provenance independently",()=>{
    const parsed=routingStatusSchema.parse({
      sourceKey:"RIPE_RIS_BGP",displayName:"RIPE RIS BGP",authority:"BAYKUSH_INTELLIGENCE_NODE",upstreamOrigin:"RIPE_RIS",attribution:"RIPE NCC Routing Information Service (RIS)",represents:"Observed BGP activity",doesNotRepresent:"Attack or outage verdicts",
      stream:{heartbeatAt:"2026-08-18T00:00:00.000Z",heartbeatFreshness:"FRESH",latestSessionStatus:"STREAMING",latestSessionStartedAt:null,latestSessionConnectedAt:null,latestSessionEndedAt:null,latestSourceObservedAt:null,latestNodeReceivedAt:null,messagesObserved:"10",segmentsPersisted:"1"},
      recovery:{heartbeatAt:"2026-08-18T00:00:00.000Z",heartbeatFreshness:"FRESH",latestRequestStatus:"SUCCEEDED",latestRequestCreatedAt:null,latestRequestStartedAt:null,latestRequestCompletedAt:null},
      latest:bucket(),
      latestRecovered:bucket({bucketStart:"2024-01-01T00:00:00.000Z",bucketEnd:"2024-01-01T00:01:00.000Z",updateMessages:"37159",coverageStatus:"COMPLETE",dataAvailability:"AVAILABLE",acquisitionBasis:"MRT_RECOVERY",acquisitionChannel:"RIS_MRT_UPDATE",liveCollectionCoverage:"PARTIAL",captureProfileKey:"NODE6_3_CITEM_RECOVERY_ACCEPTANCE_RRC00"}),
    });
    expect(parsed.latest?.acquisitionBasis).toBe("LIVE_STREAM");
    expect(parsed.latestRecovered?.dataAvailability).toBe("AVAILABLE");
    expect(parsed.latestRecovered?.liveCollectionCoverage).toBe("PARTIAL");
    expect(parsed.latestRecovered?.acquisitionBasis).toBe("MRT_RECOVERY");
  });
});
