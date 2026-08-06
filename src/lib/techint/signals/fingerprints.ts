import { createHash } from "node:crypto";

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
}
export function deterministicFingerprint(value: unknown) { return createHash("sha256").update(stable(value)).digest("hex"); }
export function sourceObservationKey(input: { sourceSystem: string; sourceRecordKey: string; sourceRevisionKey?: string | null; sourceFingerprint: string }) {
  return deterministicFingerprint({ sourceSystem: input.sourceSystem.trim().toLowerCase(), sourceRecordKey: input.sourceRecordKey.trim(), sourceRevisionKey: input.sourceRevisionKey?.trim() || null, sourceFingerprint: input.sourceFingerprint });
}
