import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  entityTableMap,
  graphLayoutPositionSchema,
  manualRelationshipSchema,
  nodeId,
} from "@/lib/graph/types";

describe("Report graph integration", () => {
  it("validates manual REPORT relationships and graph positions", () => {
    const id1 = "00000000-0000-4000-8000-000000000001";
    const id2 = "00000000-0000-4000-8000-000000000002";
    expect(
      manualRelationshipSchema.safeParse({
        sourceType: "REPORT",
        sourceId: id1,
        targetType: "EVIDENCE",
        targetId: id2,
        relationshipType: "documents",
      }).success,
    ).toBe(true);
    expect(
      graphLayoutPositionSchema.safeParse({
        entityType: "REPORT",
        entityId: id1,
        x: 1,
        y: 2,
      }).success,
    ).toBe(true);
    expect(nodeId("REPORT", id1)).toBe(`report:${id1}`);
    expect(entityTableMap.REPORT).toBe("reports");
  });
  it("migration 011 cleans report relationships and graph node positions", () => {
    const sql = readFileSync(
      "supabase/migrations/202607210011_phase5_graph_report_support.sql",
      "utf8",
    );
    expect(sql).toContain("cleanup_report_relationships");
    expect(sql).toContain("cleanup_entity_relationships('REPORT')");
    expect(sql).toContain("cleanup_report_graph_node_positions");
    expect(sql).toContain("cleanup_graph_node_positions('REPORT')");
    expect(sql).toContain("p_type = 'REPORT'");
  });
});
