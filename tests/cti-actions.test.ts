import { describe, expect, it } from "vitest";
import {
  buildRelationshipRpcPayload,
  parseRelationshipSelections,
  ctiDetailPath,
} from "@/lib/cti-schema";
const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
];
describe("cti action relationship payloads", () => {
  it("selecting three relationships sends all three IDs to the RPC", () => {
    const fd = new FormData();
    ids.forEach((id) => fd.append("threat_actor_ids", id));
    const parsed = parseRelationshipSelections(fd);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(
      buildRelationshipRpcPayload("campaigns", parsed.data).p_threat_actor_ids,
    ).toEqual(ids);
  });
  it("builds ownership-gated detail route paths", () => {
    expect(ctiDetailPath("project-1", "actors", "actor-1")).toBe(
      "/projects/project-1/actors/actor-1",
    );
  });
  it("deselection removes only the omitted relationship from the replacement payload", () => {
    const fd = new FormData();
    fd.append("threat_actor_ids", ids[0]);
    fd.append("threat_actor_ids", ids[2]);
    const parsed = parseRelationshipSelections(fd);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(
      buildRelationshipRpcPayload("campaigns", parsed.data).p_threat_actor_ids,
    ).toEqual([ids[0], ids[2]]);
  });
});
