import { createHash } from "node:crypto";
import type { TechnicalSignalType } from "./types";

/** PostgreSQL `technical_signal_canonical_json` implements this exact version-1 encoding. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}
export function deterministicFingerprint(value: unknown) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
export type CanonicalSnapshot = { lifecycle:string; title:string; summary:string; severity:string; confidence:number|null; facts:Record<string,unknown>; publishedAt:string|null; observedAt:string|null; supersededBySignalId:string|null };
const canonicalInstant=(value:string|null)=>value===null?null:new Date(value).toISOString();
export function canonicalSnapshotFingerprint(s:CanonicalSnapshot){return deterministicFingerprint([s.lifecycle,s.title,s.summary,s.severity,s.confidence,s.facts,canonicalInstant(s.publishedAt),canonicalInstant(s.observedAt),s.supersededBySignalId]);}
export function sourceSnapshotFingerprint(snapshot:Record<string,unknown>){return deterministicFingerprint(snapshot);}
export function sourceObservationKey(i:{ownerId:string;signalType:TechnicalSignalType;canonicalKey:string;sourceFamily:string;sourceSystem:string;sourceRecordKey:string;sourceRevisionKey?:string|null;sourceFingerprint:string}){return deterministicFingerprint([i.ownerId,i.signalType,i.canonicalKey,i.sourceFamily,i.sourceSystem.trim().toLowerCase(),i.sourceRecordKey.trim(),i.sourceRevisionKey?.trim()||null,i.sourceFingerprint]);}
