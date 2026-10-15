import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Stage 3 Evidence / Source Claim", () => {
  const migration = readFileSync(
    "supabase/migrations/202610150060_stage3_source_claims.sql",
    "utf8",
  );
  const actions = readFileSync(
    "src/app/projects/[id]/source-processing-actions.ts",
    "utf8",
  );
  const processing = readFileSync(
    "src/components/investigations/source-reader/annotation-processing-actions.tsx",
    "utf8",
  );
  const panel = readFileSync(
    "src/components/investigations/source-reader/source-claim-processing-panel.tsx",
    "utf8",
  );
  const workspace = readFileSync(
    "src/components/processing/source-claims-workspace.tsx",
    "utf8",
  );
  const sourcePage = readFileSync(
    "src/app/projects/[id]/sources/[sourceId]/page.tsx",
    "utf8",
  );
  const nav = readFileSync(
    "src/components/investigations/workspace-nav.tsx",
    "utf8",
  );
  const genericTypes = readFileSync("src/lib/processing/types.ts", "utf8");

  it("models canonical propositions separately from source positions", () => {
    expect(migration).toContain("create table if not exists public.source_claims");
    expect(migration).toContain(
      "create table if not exists public.source_claim_assertions",
    );
    expect(migration).toContain("source_claim_stance");
    expect(migration).toContain("'ASSERTS'");
    expect(migration).toContain("'DENIES'");
    expect(migration).toContain("'QUALIFIES'");
    expect(migration).toContain("'UNCLEAR'");
    expect(migration).toContain("source_qualifier");
    expect(migration).toContain("mapping_origin");
  });

  it("keeps Source Claims outside the generic entity output ledger", () => {
    expect(genericTypes).not.toContain('"source_claim"');
    expect(actions).toContain("createSourceClaimFromAnnotation");
    expect(actions).toContain("linkSourceClaimFromAnnotation");
    expect(actions).toContain("unlinkSourceClaimAssertion");
    expect(migration).toContain("create_source_claim_from_annotation");
    expect(migration).toContain("link_source_claim_from_annotation");
  });

  it("makes create+provenance atomic and removes unsupported orphan claims", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("PROJECT_NOT_OWNED");
    expect(migration).toContain("unlink_source_claim_assertion");
    expect(migration).toContain("if v_remaining=0 then");
    expect(migration).toContain("delete from public.source_claims");
  });

  it("does not turn Source Claims into confidence or truth judgements", () => {
    expect(migration).not.toContain("claim_confidence");
    expect(migration).not.toContain("reliability_score");
    expect(migration).toContain("not a CITEM truth judgement");
    expect(panel).toContain("not yet a CITEM truth");
    expect(workspace).toContain("not yet a CITEM truth judgement");
  });

  it("adds Evidence / Source Claim to the Source Reader processing workflow", () => {
    expect(processing).toContain('source_claim: "Evidence / Source Claim"');
    expect(processing).toContain("<SourceClaimProcessingPanel");
    expect(panel).toContain("one atomic proposition");
    expect(panel).toContain("CITEM never auto-merges");
    expect(panel).toContain("Source stance");
    expect(panel).toContain("Source qualifier");
  });

  it("loads current assertions and existing claims for explicit create-vs-link", () => {
    expect(sourcePage).toContain('.from("source_claim_assertions")');
    expect(sourcePage).toContain('.from("source_claims")');
    expect(sourcePage).toContain("sourceClaimAssertions=");
    expect(sourcePage).toContain("source_claim: processingSourceClaimsResult.data");
  });

  it("provides a dedicated Source Claims review workspace", () => {
    expect(nav).toContain('label: "Source Claims"');
    expect(workspace).toContain("Assertions, denials and qualifications");
    expect(workspace).toContain("Source stance is not CITEM confidence");
    expect(workspace).toContain("Open annotation");
  });
});
