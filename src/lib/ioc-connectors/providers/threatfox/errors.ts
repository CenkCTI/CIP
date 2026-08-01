export type ThreatFoxErrorCode = "THREATFOX_CURSOR_INVALID" | "THREATFOX_CREDENTIAL_REQUIRED" | "THREATFOX_CREDENTIAL_INVALID" | "THREATFOX_AUTH_FAILED" | "THREATFOX_RATE_LIMITED" | "THREATFOX_TIMEOUT" | "THREATFOX_HTTP_ERROR" | "THREATFOX_RESPONSE_TOO_LARGE" | "THREATFOX_INVALID_JSON" | "THREATFOX_INVALID_RESPONSE" | "THREATFOX_QUERY_FAILED" | "THREATFOX_ITEM_LIMIT" | "THREATFOX_NO_SUPPORTED_ITEMS" | "THREATFOX_MAPPING_FAILED" | "THREATFOX_CONFIGURATION_INVALID";
export type ThreatFoxSafeDiagnostics = { received_count?: number; mapping_skipped_count?: number; skip_reason_counts?: Record<string, number> };
export class ThreatFoxError extends Error {
  constructor(public readonly code: ThreatFoxErrorCode, public readonly transient = false, public readonly retryAfterSeconds?: number, public readonly diagnostics?: ThreatFoxSafeDiagnostics) { super(code); this.name = "ThreatFoxError"; }
  toJSON() { return { code: this.code, transient: this.transient, retryAfterSeconds: this.retryAfterSeconds, diagnostics: this.diagnostics }; }
}
