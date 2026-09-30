import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Stage 3 Source Reader processing bridge", () => {
  const component = readFileSync(
    "src/components/investigations/source-reader/annotation-processing-actions.tsx",
    "utf8",
  );
  const workspace = readFileSync(
    "src/components/investigations/source-reader/source-reader-workspace.tsx",
    "utf8",
  );
  const sourcePage = readFileSync(
    "src/app/projects/[id]/sources/[sourceId]/page.tsx",
    "utf8",
  );
  const library = readFileSync(
    "src/components/investigations/sources/source-library.tsx",
    "utf8",
  );
  const actions = readFileSync(
    "src/app/projects/[id]/source-processing-actions.ts",
    "utf8",
  );
  const detailPage = readFileSync(
    "src/app/projects/[id]/[module]/[entityId]/page.tsx",
    "utf8",
  );
  const provenance = readFileSync(
    "src/components/processing/source-annotation-support.tsx",
    "utf8",
  );
  const claims = readFileSync(
    "src/components/processing/source-attribution-claims.tsx",
    "utf8",
  );

  it("uses one Process / Extract surface for structured destinations", () => {
    expect(component).toContain("Process / Extract");
    expect(component).toContain("Timeline Event");
    expect(component).toContain("Indicator / IOC");
    expect(component).toContain("MITRE ATT&CK");
    expect(component).toContain("Attribution Claim");
    expect(workspace).toContain("<AnnotationProcessingActions");
  });

  it("keeps processing state analyst-controlled", () => {
    expect(component).toContain("Mark processed");
    expect(component).toContain("Confirm ignore");
    expect(component).toContain("Reopen");
    expect(component).toContain("Processing state remains analyst-controlled");
  });

  it("loads existing records for create-vs-link decisions", () => {
    expect(sourcePage).toContain('.from("source_annotation_outputs")');
    expect(sourcePage).toContain('.from("indicators")');
    expect(sourcePage).toContain('.from("malware")');
    expect(sourcePage).toContain('.from("cves")');
    expect(sourcePage).toContain('.from("mitre_techniques")');
    expect(sourcePage).toContain('.from("campaigns")');
    expect(sourcePage).toContain('.from("threat_actors")');
    expect(component).toContain("Link existing");
  });

  it("surfaces resumable processing work", () => {
    expect(library).toContain("unprocessedAnnotationCounts");
    expect(library).toContain("unprocessed");
    expect(workspace).toContain("Processing queue");
    expect(workspace).toContain("not a completion percentage");
  });

  it("keeps analytical-stage warnings in the processing UI", () => {
    expect(component).toContain("Reliability, corroboration");
    expect(component).toContain("does not attribute the current");
    expect(component).toContain("activity to that actor");
    expect(component).toContain("Operational Picture analysis");
    expect(component).toContain("Suggestions only");
  });

  it("supports analyst-reviewed bulk IOC candidate processing", () => {
    expect(component).toContain("Add selected Indicators");
    expect(actions).toContain("processAnnotationIndicatorBatch");
    expect(actions).toContain(".max(100)");
    expect(actions).toContain("Processed ${created + linked} Indicator candidate(s)");
  });

  it("surfaces source annotation provenance on structured CTI records", () => {
    expect(detailPage).toContain("<SourceAnnotationSupport");
    expect(provenance).toContain("Annotation provenance");
    expect(provenance).toContain("Open source annotation");
    expect(provenance).toContain("SHA-256");
  });

  it("keeps source-reported actor claims separate from attribution conclusions", () => {
    expect(detailPage).toContain("<SourceAttributionClaims");
    expect(claims).toContain("Source-reported attribution");
    expect(claims).toContain("not CITEM attribution conclusions");
  });
});
