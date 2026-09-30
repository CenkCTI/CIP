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
    expect(component).toContain("does not attribute the current activity");
    expect(component).toContain("Operational Picture analysis");
    expect(component).toContain("Suggestions only");
  });
});
