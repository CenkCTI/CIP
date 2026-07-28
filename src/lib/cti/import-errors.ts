export type IndicatorImportDatabaseError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function errorText(error?: IndicatorImportDatabaseError | null) {
  return [error?.code, error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function isCanonicalIndicatorConflict(outcomeError?: string | null) {
  return outcomeError === "indicator_conflict";
}

export function mapIndicatorImportError(
  error?: IndicatorImportDatabaseError | null,
  outcomeError?: string | null,
) {
  const text = errorText(error);

  if (
    error?.code === "PGRST202" ||
    error?.code === "42883" ||
    (text.includes("import_indicator_observation") &&
      (text.includes("could not find") ||
        text.includes("does not exist") ||
        text.includes("schema cache")))
  ) {
    return "IOC import is unavailable because database migration 016 has not been applied to this Supabase environment. Apply supabase/migrations/202607280016_phase2_1a_investigation_ioc_workbench.sql and retry.";
  }

  if (
    error?.code === "42501" ||
    text.includes("permission denied") ||
    text.includes("row-level security")
  ) {
    return "IOC import was rejected by database authorization. Confirm migration 016, its authenticated RPC grant, and the Indicator observation RLS policies are applied.";
  }

  if (outcomeError === "not_found") {
    return "Investigation not found or access was denied.";
  }

  if (
    outcomeError === "invalid_value" ||
    outcomeError === "invalid_observation" ||
    outcomeError === "invalid_source" ||
    outcomeError === "invalid_source_label" ||
    outcomeError === "invalid_note"
  ) {
    return "The database rejected an invalid IOC import payload.";
  }

  if (isCanonicalIndicatorConflict(outcomeError)) {
    return "The Indicator could not be resolved after a canonical uniqueness conflict.";
  }

  return "IOC import could not be completed because the database import service returned an error.";
}
