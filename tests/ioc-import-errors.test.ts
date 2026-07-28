import { describe, expect, it } from "vitest";

import {
  isCanonicalIndicatorConflict,
  mapIndicatorImportError,
} from "@/lib/cti/import-errors";

describe("IOC import database error mapping", () => {
  it("reports a missing migration or stale schema cache instead of five false conflicts", () => {
    const message = mapIndicatorImportError({
      code: "PGRST202",
      message:
        "Could not find the function public.import_indicator_observation in the schema cache",
    });
    expect(message).toContain("migration 016 is missing");
    expect(message).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it("recognizes PostgreSQL missing-function errors", () => {
    expect(
      mapIndicatorImportError({
        code: "42883",
        message: "function public.import_indicator_observation does not exist",
      }),
    ).toContain("202607280016_phase2_1a_investigation_ioc_workbench.sql");
  });

  it("maps RLS or grant failures to a safe authorization message", () => {
    expect(
      mapIndicatorImportError({
        code: "42501",
        message: "permission denied for function import_indicator_observation",
      }),
    ).toContain("database authorization");
  });

  it("counts only the explicit canonical outcome as an IOC conflict", () => {
    expect(isCanonicalIndicatorConflict("indicator_conflict")).toBe(true);
    expect(isCanonicalIndicatorConflict("not_found")).toBe(false);
    expect(isCanonicalIndicatorConflict(undefined)).toBe(false);
  });

  it("keeps unknown database errors generic and secret-free", () => {
    const message = mapIndicatorImportError({
      code: "XX000",
      message: "unexpected internal provider response",
      details: "private diagnostics",
    });
    expect(message).toBe(
      "IOC import could not be completed because the database import service returned an error.",
    );
    expect(message).not.toContain("private diagnostics");
  });
});
