import "server-only";
import { nodeGet } from "./client";
import { nodeMeasurementEnvelopeSchema } from "./measurement-schema";
import { envelope,sourceSchema,sourceStatusSchema,changeSchema,recordsSchema,entitySchema,summarySchema,provenanceSchema,comparisonSchema } from "./schemas";
import { routingStatusSchema } from "./routing-schema";
import { COMPARABLE_MEASUREMENTS, GLOBAL_MEASUREMENTS } from "./routing";
import type { GlobalRange } from "./range";
import { resolveGlobalRange } from "./range";

export { GLOBAL_MEASUREMENTS } from "./routing";

const MAX_MEASUREMENTS_PER_NODE_REQUEST=8;

function measurementBatches(){const batches:string[][]=[];for(let index=0;index<GLOBAL_MEASUREMENTS.length;index+=MAX_MEASUREMENTS_PER_NODE_REQUEST)batches.push([...GLOBAL_MEASUREMENTS.slice(index,index+MAX_MEASUREMENTS_PER_NODE_REQUEST)]);return batches;}

export const getNodeSources=()=>nodeGet('/v1/sources',envelope(sourceSchema.array()),{revalidate:3600});
export function getNodeSourceStatus(range:GlobalRange,now=new Date()){const {from,to}=resolveGlobalRange(range,now);return nodeGet(`/v1/sources/status?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,envelope(sourceStatusSchema.array()),{revalidate:20});}
export const getNodeSummary=(range:GlobalRange)=>nodeGet(`/v1/techint/summary?range=${range.toUpperCase()}`,envelope(summarySchema),{revalidate:45});
export async function getNodeMeasurements(range:GlobalRange,now=new Date()){const {from,to}=resolveGlobalRange(range,now);const responses=await Promise.all(measurementBatches().map(batch=>{const keys=batch.map(key=>`measurementKey=${encodeURIComponent(key)}`).join('&');return nodeGet(`/v1/techint/measurements?${keys}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&resolution=AUTO`,nodeMeasurementEnvelopeSchema,{revalidate:60});}));return{apiVersion:'v1' as const,generatedAt:responses.map(response=>response.generatedAt).sort().at(-1)??now.toISOString(),data:responses.flatMap(response=>response.data),meta:{batchCount:responses.length,maxMeasurementsPerRequest:MAX_MEASUREMENTS_PER_NODE_REQUEST}};}
export function getNodeChanges(range:GlobalRange,now=new Date()){const {from,to}=resolveGlobalRange(range,now);return nodeGet(`/v1/techint/changes?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=25`,envelope(changeSchema.array().max(100)),{revalidate:30});}
export async function getNodeComparisons(range:GlobalRange,now=new Date()){const {from,to}=resolveGlobalRange(range,now);const results=await Promise.allSettled(COMPARABLE_MEASUREMENTS.map(measurementKey=>nodeGet(`/v1/techint/comparison?measurementKey=${encodeURIComponent(measurementKey)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,envelope(comparisonSchema),{revalidate:60})));return results.flatMap(result=>result.status==='fulfilled'?[result.value.data]:[]);}
export const getNodeRoutingStatus=()=>nodeGet('/v1/techint/routing/status',envelope(routingStatusSchema),{revalidate:15});
export const getNodeEntity=(id:string)=>nodeGet(`/v1/techint/entities/${encodeURIComponent(id)}`,envelope(entitySchema));
export const getNodeRecords=(query:string)=>nodeGet(`/v1/techint/records?${query}`,envelope(recordsSchema));
export const getNodeProvenance=(id:string)=>nodeGet(`/v1/techint/provenance/measurement/${encodeURIComponent(id)}`,envelope(provenanceSchema));
