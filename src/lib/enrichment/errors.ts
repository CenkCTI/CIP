export type EnrichmentSafeErrorCode =
  | "MIGRATION_REQUIRED"
  | "PROVIDER_DISABLED"
  | "UNSUPPORTED_TYPE"
  | "ACTIVE_RUN"
  | "COOLDOWN"
  | "TIMEOUT"
  | "MALFORMED_RESPONSE"
  | "AUTHORIZATION"
  | "PROVIDER_FAILED"
  | "STORAGE_FAILED";

export class EnrichmentError extends Error {
  constructor(
    public readonly safeCode: EnrichmentSafeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EnrichmentError";
  }
}

export type DatabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function errorText(error?: DatabaseErrorLike | null) {
  return [error?.code, error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function mapEnrichmentDatabaseError(error?: DatabaseErrorLike | null) {
  const text = errorText(error);
  if (
    error?.code === "23505" &&
    text.includes("enrichment_runs_one_active_provider_idx")
  ) {
    return new EnrichmentError(
      "ACTIVE_RUN",
      "An enrichment run is already active for this Indicator and provider.",
    );
  }
  if (
    error?.code === "PGRST204" ||
    error?.code === "42P01" ||
    error?.code === "42703" ||
    text.includes("could not find the table") ||
    text.includes("schema cache")
  ) {
    return new EnrichmentError(
      "MIGRATION_REQUIRED",
      "Enrichment storage is unavailable because migration 017 is missing or the Supabase API schema cache has not reloaded. Apply migration 017, run NOTIFY pgrst, 'reload schema'; and retry.",
    );
  }
  if (
    error?.code === "42501" ||
    text.includes("permission denied") ||
    text.includes("row-level security")
  ) {
    return new EnrichmentError(
      "AUTHORIZATION",
      "Enrichment was rejected by project authorization or RLS.",
    );
  }
  return new EnrichmentError(
    "STORAGE_FAILED",
    "Enrichment data could not be stored safely.",
  );
}

export function safeEnrichmentError(error: unknown) {
  if (error instanceof EnrichmentError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new EnrichmentError(
      "TIMEOUT",
      "The enrichment provider did not complete within the allowed timeout.",
    );
  }
  if (error instanceof Error && error.message === "unsupported_provider") {
    return new EnrichmentError(
      "PROVIDER_DISABLED",
      "The requested enrichment provider is unavailable.",
    );
  }
  return new EnrichmentError(
    "PROVIDER_FAILED",
    "The enrichment provider request failed without exposing external response details.",
  );
}
