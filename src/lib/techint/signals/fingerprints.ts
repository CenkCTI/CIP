import { createHash } from "node:crypto";
function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k, stable(v)])); return value ?? null; }
export function sha256StableJson(value: unknown) { return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
export function canonicalSnapshotFingerprint(snapshot: unknown) { return sha256StableJson(snapshot); }
export function sourceObservationIdentity(input: { sourceSystem: string; sourceRecordKey: string; sourceRevisionKey?: string | null; sourceFingerprint: string }) { return createHash("sha256").update(`${input.sourceSystem.trim().toLowerCase()}:${input.sourceRecordKey.trim()}:${input.sourceRevisionKey?.trim() ?? ""}:${input.sourceFingerprint}`).digest("hex"); }
