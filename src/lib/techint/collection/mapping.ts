import type { CollectionIssue } from "./types";

export function bounded(value: string | null | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

export function collapseWhitespace(value: string | null | undefined, max = 500): string {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function canonicalInstant(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("INVALID_TIMESTAMP");
  return parsed.toISOString();
}

export function dateOnlyInstant(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("INVALID_DATE");
  return `${value}T00:00:00.000Z`;
}

export function cisaReleaseInstant(value: string): string {
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(value)) return `${value.replaceAll(".", "-")}T00:00:00.000Z`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return dateOnlyInstant(value);
  return canonicalInstant(value);
}

export function safeIssue(code: string, message: string, sourceRecordKey?: string | null): CollectionIssue {
  return {
    kind: "SKIPPED",
    code: code.slice(0, 100),
    message: message.slice(0, 500),
    sourceRecordKey: sourceRecordKey?.slice(0, 300) ?? null,
  };
}
