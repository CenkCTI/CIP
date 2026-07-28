import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const detail = readFileSync(
  "src/app/projects/[id]/sources/[sourceId]/page.tsx",
  "utf8",
);

describe("Source detail ownership boundary", () => {
  it("requires the Investigation owner and project-scopes the Source record", () => {
    expect(detail).toContain("requireOwnedProject(id)");
    expect(detail).toContain('.from("sources")');
    expect(detail).toContain('.eq("project_id", context.projectId)');
    expect(detail).toContain('.eq("id", sourceId)');
    expect(detail).toContain("notFound()");
  });

  it("project-scopes linked Evidence and provenance reference counts", () => {
    expect(detail).toContain('.from("evidence")');
    expect(detail).toContain('.from("indicator_observations")');
    expect(detail).toContain('.from("enrichment_results")');
    expect(detail.match(/\.eq\("project_id", context\.projectId\)/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
