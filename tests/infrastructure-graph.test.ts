import { describe, expect, it } from "vitest";

import {
  infrastructureMembershipEdges,
  visibleInfrastructureMembershipStatuses,
} from "@/lib/graph/service";

const nodes = new Set(["infrastructure-cluster:cluster", "indicator:indicator"]);
const rows = [
  { id: "possible", cluster_id: "cluster", indicator_id: "indicator", status: "POSSIBLE", role: "C2", confidence: "LOW", rationale: "possible" },
  { id: "confirmed", cluster_id: "cluster", indicator_id: "indicator", status: "CONFIRMED", role: "C2", confidence: "HIGH", rationale: "confirmed" },
  { id: "rejected", cluster_id: "cluster", indicator_id: "indicator", status: "REJECTED", role: "C2", confidence: "LOW", rationale: "rejected" },
  { id: "removed", cluster_id: "cluster", indicator_id: "indicator", status: "REMOVED", role: "C2", confidence: "LOW", rationale: "removed" },
];

describe("Infrastructure Graph derivation", () => {
  it("selects only active membership statuses by default", () => {
    expect(visibleInfrastructureMembershipStatuses(false)).toEqual(["POSSIBLE", "CONFIRMED"]);
  });

  it("includes rejected and removed only with the historical toggle", () => {
    expect(visibleInfrastructureMembershipStatuses(true)).toEqual(["POSSIBLE", "CONFIRMED", "REJECTED", "REMOVED"]);
  });

  it("derives edges without creating parallel relationships", () => {
    const active = rows.filter((row) => visibleInfrastructureMembershipStatuses(false).includes(row.status));
    const edges = infrastructureMembershipEdges(active, "project", nodes);
    expect(edges).toHaveLength(2);
    expect(edges[1]).toMatchObject({ relationshipType: "CONFIRMED · C2 · HIGH", sourceKind: "semantic" });
  });
});
