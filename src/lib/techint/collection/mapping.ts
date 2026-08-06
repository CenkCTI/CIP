import type { CollectionIssue } from "./types";

export function bounded(value: string | null | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

export function collapseWhitespace(value: string | null | undefined, max = 500): string {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function canonicalInstant(value: string): string {
  const trimmed = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?$/.test(trimmed)
    ? `${trimmed}Z`
    : trimmed;
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) throw new Error("INVALID_TIMESTAMP");
  return parsed.toISOString();
}

export function dateOnlyInstant(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("INVALID_DATE");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("INVALID_DATE");
  }
  return parsed.toISOString();
}

export function cisaReleaseInstant(value: string): string {
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(value)) return dateOnlyInstant(value.replaceAll(".", "-"));
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return dateOnlyInstant(value);
  return canonicalInstant(value);
}

export function safeIssue(code: string, message: string, sourceRecordKey?: string | null): CollectionIssue {
  const safeCode = code.trim().slice(0, 100);
  const safeMessage = message.trim().slice(0, 500);
  return {
    kind: "SKIPPED",
    code: safeCode || "COLLECTION_ISSUE",
    message: safeMessage || "A source record was skipped safely.",
    sourceRecordKey: sourceRecordKey?.trim().slice(0, 300) || null,
  };
}
