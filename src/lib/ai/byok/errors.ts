export function safeAiErrorMessage(code: string) {
  return code === "byok_required" ? "Reconnect your BYOK provider before generating."
    : code === "byok_expired" ? "BYOK connection expired; reconnect your provider."
    : code === "byok_binding_mismatch" ? "BYOK session is no longer valid; reconnect your provider."
    : code === "byok_consent_required" ? "Confirm BYOK provider consent before generating."
    : code === "timeout" ? "AI provider timed out."
    : code === "provider_rate_limited" ? "AI provider rate limit reached."
    : code === "provider_unreachable" ? "AI provider is unreachable."
    : code === "nvidia_output_exhausted" ? "NVIDIA returned no final answer because output was exhausted; reconnect or try again with the allowlisted model."
    : code === "malformed_output" ? "AI output did not match the required schema."
    : code;
}
export function safeAiErrorCode(e: unknown) { return e && typeof e === "object" && "code" in e && typeof (e as { code?: unknown }).code === "string" ? (e as { code: string }).code : e instanceof Error ? e.message : "request_failed"; }
