import { describe, expect, it } from "vitest";

import {
  EnrichmentError,
  mapEnrichmentDatabaseError,
  safeEnrichmentError,
} from "@/lib/enrichment/errors";

describe("enrichment safe errors", () => {
  it("reports migration/schema cache failures actionably", () => {
    const error = mapEnrichmentDatabaseError({
      code: "42P01",
      message: 'relation "public.enrichment_runs" does not exist',
    });
    expect(error.safeCode).toBe("MIGRATION_REQUIRED");
    expect(error.message).toContain("migration 017");
    expect(error.message).toContain("reload schema");
  });

  it("maps authorization failures without exposing database details", () => {
    const error = mapEnrichmentDatabaseError({
      code: "42501",
      message: "permission denied for table enrichment_results private detail",
    });
    expect(error.safeCode).toBe("AUTHORIZATION");
    expect(error.message).not.toContain("private detail");
  });

  it("maps active-run uniqueness distinctly", () => {
    const error = mapEnrichmentDatabaseError({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "enrichment_runs_one_active_provider_idx"',
    });
    expect(error.safeCode).toBe("ACTIVE_RUN");
  });

  it("maps aborts to timeout and preserves explicit safe failures", () => {
    const abort = new DOMException("provider body", "AbortError");
    expect(safeEnrichmentError(abort).safeCode).toBe("TIMEOUT");
    const explicit = new EnrichmentError("PROVIDER_DISABLED", "Disabled safely");
    expect(safeEnrichmentError(explicit)).toBe(explicit);
  });

  it("keeps unknown provider failures generic", () => {
    const error = safeEnrichmentError(new Error("Authorization: secret-token"));
    expect(error.safeCode).toBe("PROVIDER_FAILED");
    expect(error.message).not.toContain("secret-token");
  });
});
