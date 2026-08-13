import "server-only";
import { nodeGet } from "./client";
import { nodeMeasurementEnvelopeSchema } from "./measurement-schema";
import { envelope,sourceSchema,sourceStatusSchema,changeSchema,recordsSchema,entitySchema,summarySchema,provenanceSchema } from "./schemas";
import type { GlobalRange } from "./range";
import { resolveGlobalRange } from "./range";

export const GLOBAL_MEASUREMENTS=['vulnerability.cisa_kev.additions','vulnerability.nvd.publications','exploitation.epss.scored_records','ioc.threatfox.reporting_volume','malware.malwarebazaar.sample_reporting'] as const;
export const getNodeSources=()=>nodeGet('/v1/sources',envelope(sourceSchema.array()),{revalidate:3600});
export const getNodeSourceStatus=()=>nodeGet('/v1/sources/status',envelope(sourceStatusSchema.array()),{revalidate:20});
export const getNodeSummary=(range:GlobalRange)=>nodeGet(`/v1/techint/summary?range=${range.toUpperCase()}`,envelope(summarySchema),{revalidate:45});
export function getNodeMeasurements(range:GlobalRange,now=new Date()){const {from,to}=resolveGlobalRange(range,now);const keys=GLOBAL_MEASUREMENTS.map(key=>`measurementKey=${encodeURIComponent(key)}`).join('&');return nodeGet(`/v1/techint/measurements?${keys}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&resolution=AUTO`,nodeMeasurementEnvelopeSchema,{revalidate:60});}
export function getNodeChanges(range:GlobalRange,now=new Date()){const {from,to}=resolveGlobalRange(range,now);return nodeGet(`/v1/techint/changes?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=25`,envelope(changeSchema.array().max(100)),{revalidate:30});}
export const getNodeEntity=(id:string)=>nodeGet(`/v1/techint/entities/${encodeURIComponent(id)}`,envelope(entitySchema));
export const getNodeRecords=(query:string)=>nodeGet(`/v1/techint/records?${query}`,envelope(recordsSchema));
export const getNodeProvenance=(id:string)=>nodeGet(`/v1/techint/provenance/measurement/${encodeURIComponent(id)}`,envelope(provenanceSchema));
