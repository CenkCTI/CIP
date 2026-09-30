import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Stage 3 processing foundation", () => {
  const migration = readFileSync(
    "supabase/migrations/202609300058_stage3_processing_foundation.sql",
    "utf8",
  );
  const hardening = readFileSync(
    "supabase/migrations/202609300059_stage3_processing_provenance_hardening.sql",
    "utf8",
  );
  const actions = readFileSync(
    "src/app/projects/[id]/source-processing-actions.ts",
    "utf8",
  );

  it("keeps processing state explicit and separate from progress percentages", () => {
    expect(migration).toContain("'UNPROCESSED','PROCESSED','IGNORED'");
    expect(migration).toContain("processing_state");
    expect(migration).not.toContain("completion_percentage");
    expect(actions).toContain("setAnnotationProcessingState");
  });

  it("uses a provenance ledger instead of analytical relationship inference", () => {
    expect(migration).toContain("source_annotation_outputs");
    expect(migration).toContain("output_action");
    expect(migration).toContain("mapping_origin");
    expect(migration).toContain("source_attribution_claims");
    expect(migration).toContain("Source-reported actor attribution statements");
  });

  it("records analyst-controlled create/link outputs for existing CTI objects", () => {
    expect(actions).toContain("createAnnotationOutput");
    expect(actions).toContain("linkAnnotationOutput");
    expect(actions).toContain("unlinkAnnotationOutput");
    expect(actions).toContain("SOURCE_EXPLICIT");
    expect(actions).toContain("ANALYST_MAPPED");
  });

  it("does not auto-mark an annotation processed when an output is created", () => {
    const createBody = actions.slice(
      actions.indexOf("export async function createAnnotationOutput"),
      actions.indexOf("async function targetLabel"),
    );
    expect(createBody).not.toContain("processing_state");
  });

  it("keeps exact Indicator and CVE dedup deterministic", () => {
    expect(actions).toContain('.eq("normalized_value", normalized)');
    expect(actions).toContain('.eq("cve_id", parsed.data.cve_id)');
    expect(actions).toContain("linkedExisting: true");
  });

  it("hardens ignored-state and authenticated ledger access in the database", () => {
    expect(migration).toContain("processing_state <> 'IGNORED'");
    expect(migration).toContain("grant select,insert,update,delete on public.source_attribution_claims");
    expect(migration).toContain("grant select,insert,delete on public.source_annotation_outputs");
    expect(migration).not.toContain("Immutable provenance ledger");
    expect(migration).toContain("on delete restrict");
    expect(migration).toContain(
      "foreign key(project_id,source_annotation_id,attribution_claim_id)",
    );
    expect(hardening).toContain("STAGE3_PROVENANCE_MISMATCH");
    expect(hardening).toContain("source_annotation_outputs_attribution_claim_fk");
    expect(hardening).toContain("on delete cascade");
  });

  it("deletes annotation-bound attribution claims without orphaning ledger rows", () => {
    expect(actions).toContain('existing.output_type === "ATTRIBUTION_CLAIM"');
    expect(actions).toContain('.from("source_attribution_claims")');
    expect(actions).toContain("Source attribution claim deleted with its provenance link.");
  });
});
