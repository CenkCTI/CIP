import "server-only";

import type { FeedErrorCode } from "./errors";

export type FeedDiagnosticStage = "DNS" | "CONNECT" | "REQUEST" | "REDIRECT" | "BODY" | "DECOMPRESSION" | "PARSE" | "FINALIZE";

function safeCode(value: unknown) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(value) ? value : null;
}
function safeName(value:unknown) { return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(value) ? value : "Error"; }

export function logFeedDiagnostic(input: { stage: FeedDiagnosticStage; error: unknown; code: FeedErrorCode; feedSourceId: string; fetchRunId: string }) {
  const error = input.error && typeof input.error === "object" ? input.error as { name?:unknown; code?:unknown; cause?:unknown } : {};
  const cause = error.cause && typeof error.cause === "object" ? error.cause as { code?:unknown } : {};
  const record = {
    stage: input.stage,
    errorName: safeName(error.name),
    code: input.code,
    causeCode: safeCode(cause.code) ?? safeCode(error.code),
    feedSourceId: input.feedSourceId,
    fetchRunId: input.fetchRunId,
  };
  console.error("[research-feed]", JSON.stringify(record));
}
