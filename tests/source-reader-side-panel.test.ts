import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Source Reader right analysis panel", () => {
  const workspace = readFileSync(
    "src/components/investigations/source-reader/source-reader-workspace.tsx",
    "utf8",
  );
  const processing = readFileSync(
    "src/components/investigations/source-reader/annotation-processing-actions.tsx",
    "utf8",
  );

  it("keeps the desktop right panel inside the viewport with native wheel scrolling", () => {
    expect(workspace).toContain("xl:max-h-[calc(100dvh-2rem)]");
    expect(workspace).toContain("xl:flex-col xl:overflow-hidden");
    expect(workspace).toContain("xl:overflow-y-auto xl:overscroll-contain");
    expect(workspace).toContain("data-source-reader-panel-scroll");
    expect(workspace).toContain("[scrollbar-gutter:stable]");
  });

  it("uses compact previews for long source excerpts and analyst notes", () => {
    expect(workspace).toContain("compactText(annotation.selected_text, 220)");
    expect(workspace).toContain("compactText(annotation.comment, 150)");
    expect(workspace).toContain("expandedAnnotationId");
    expect(workspace).toContain('{expanded ? "Daralt" : "Detay"}');
  });

  it("keeps processing actions compact until the analyst opens details", () => {
    expect(workspace).toContain("compact={!expanded}");
    expect(processing).toContain("compact = false");
    expect(processing).toContain("structuredOutputCount");
    expect(processing).toContain('"No structured outputs"');
  });

  it("compacts saved Source notes while preserving access to the full note", () => {
    expect(workspace).toContain("compactText(body, 180)");
    expect(workspace).toContain("Tamamını göster");
  });
});
