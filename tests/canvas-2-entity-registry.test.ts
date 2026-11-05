import { describe, expect, it } from "vitest";
import {
  canvasEntityFromFusionRow, canvasEntityKey, canvasEntityLabel, canvasEntityTypes,
} from "@/lib/canvas/entity-registry";

const sourceId = "0cdfccdb-964c-428e-a147-464f6c601001";
const annotationId = "dcac56c2-1e1b-4839-bbd0-95c5f00c1002";
const projectId = "62ad38bc-2c5d-4390-a688-57f68d3e1001";

const row = {
  record_type: "ANNOTATION", record_id: annotationId,
  title: "  Important    excerpt  ", summary: " Reporter\n claimed an intrusion ",
  preview_text: "<script>alert('x')</script>", origin_kind: "SOURCE_PASSAGE",
  source_ids: [sourceId], metadata: { selectedText: "secret", key: "internal" },
  updated_at: "2026-11-05T14:00:00Z",
};

describe("CANVAS-2 entity registry and safe projections", () => {
  it("covers exactly the 18 canonical Fusion Inventory families", () => {
    expect(canvasEntityTypes).toHaveLength(18);
    expect(new Set(canvasEntityTypes).size).toBe(18);
    for (const kind of canvasEntityTypes) {
      expect(canvasEntityLabel(kind)).toBeTruthy();
    }
    expect(canvasEntityLabel("SOURCE_CLAIM")).toBe("Source-reported claim");
  });

  it("links annotations to the existing Source Reader and does not leak metadata", () => {
    const summary = canvasEntityFromFusionRow(projectId, row);
    expect(summary?.href).toBe(
      `/projects/${projectId}/sources/${sourceId}?annotation=${annotationId}`,
    );
    expect(summary?.title).toBe("Important excerpt");
    expect(summary?.summary).toBe("Reporter claimed an intrusion");
    expect(summary && canvasEntityKey(summary)).toBe(`ANNOTATION:${annotationId}`);
    expect(JSON.stringify(summary)).not.toContain("secret");
    expect(JSON.stringify(summary)).not.toContain("key");
  });

  it("navigates source claims to the original claim rather than inventing provenance", () => {
    const summary = canvasEntityFromFusionRow(projectId, {
      ...row, record_type: "SOURCE_CLAIM", source_ids: [],
    });
    expect(summary?.href).toBe(`/projects/${projectId}/source-claims/${annotationId}`);
    expect(summary?.originKind).toBe("SOURCE_PASSAGE");
  });

  it("rejects unknown types and invalid IDs before producing a link", () => {
    expect(canvasEntityFromFusionRow(projectId, { ...row, record_type: "ADMIN" })).toBeNull();
    expect(canvasEntityFromFusionRow(projectId, { ...row, record_id: "../../etc" })).toBeNull();
  });

  it("bounds long, untrusted labels and summaries, with no raw HTML interpretation", () => {
    const summary = canvasEntityFromFusionRow(projectId, {
      ...row, title: "X".repeat(1000), summary: "<img onerror=alert(1)>".repeat(100),
    });
    expect(summary?.title).toHaveLength(240);
    expect(summary?.summary.length).toBeLessThanOrEqual(440);
  });
});
