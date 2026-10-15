import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("PDF Source Reader view continuity", () => {
  const viewer = readFileSync(
    "src/components/investigations/source-reader/pdf/pdf-source-viewer.tsx",
    "utf8",
  );
  const workspace = readFileSync(
    "src/components/investigations/source-reader/source-reader-workspace.tsx",
    "utf8",
  );
  const actions = readFileSync(
    "src/app/projects/[id]/source-collection-actions.ts",
    "utf8",
  );

  it("persists zoom and PDF pane scroll per Source asset", () => {
    expect(viewer).toContain("citem:pdf-view:");
    expect(viewer).toContain("window.sessionStorage.getItem(viewStateKey)");
    expect(viewer).toContain("window.sessionStorage.setItem(viewStateKey");
    expect(viewer).toContain("scrollTop:pages.scrollTop");
    expect(viewer).toContain("scrollLeft:pages.scrollLeft");
    expect(viewer).toContain("pages.scrollTop=pending.scrollTop");
    expect(viewer).toContain("pages.scrollLeft=pending.scrollLeft");
  });

  it("does not soft-refresh the active PDF.js reader after annotation creation", () => {
    expect(viewer).not.toContain("router.refresh()");
    expect(viewer).toContain("onAnnotationCreated?.({");
    expect(actions).toContain("annotationId: String(data)");
    expect(actions).toContain("avoid signed PDF");
    expect(actions).toContain('revalidatePath(`/projects/${context.projectId}/sources`)');
  });

  it("optimistically threads the saved annotation into overlay and sidebar data", () => {
    expect(workspace).toContain("localAnnotations");
    expect(workspace).toContain("liveAnnotations");
    expect(workspace).toContain("liveAnnotationFragments");
    expect(workspace).toContain("onAnnotationCreated=");
    expect(viewer).toContain('processing_state:"UNPROCESSED"');
  });
});
