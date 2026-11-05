import { describe, expect, it } from "vitest";
import { canvasItemSchema, canvasSceneSaveSchema, canvasEdgeSchema } from "@/lib/canvas/schema";

const note = {
  id: "cfd37ec5-7a6c-48ee-ae66-1b8a7eb50001", kind: "NOTE", content: "Question",
  x: 100, y: 200, width: 300, height: 180, z_index: 0,
};
const frameId = "cfd37ec5-7a6c-48ee-ae66-1b8a7eb50005";
const frame = {
  id: frameId, kind: "FRAME", content: "Working group",
  x: 55, y: 120, width: 700, height: 460, z_index: 0,
};
const entity = {
  id: "cfd37ec5-7a6c-48ee-ae66-1b8a7eb50002",
  kind: "ENTITY_REF", content: "", record_type: "ACTOR",
  record_id: "cfd37ec5-7a6c-48ee-ae66-1b8a7eb50003",
  x: 390, y: 120, width: 280, height: 200, z_index: 1, group_id: frameId,
};
const edge = {
  id: "cfd37ec5-7a6c-48ee-ae66-1b8a7eb50006",
  source_id: note.id, target_id: entity.id,
  relation_type: "RELATED_TO", rationale: "A possibility; not established",
};
const base = { baseRevision: 3, requestId: "cfd37ec5-7a6c-48ee-ae66-1b8a7eb50007" };
const scene = { ...base, items: [frame,note,entity], edges: [edge] };

describe("CANVAS-3 typed atomic scene", () => {
  it("accepts a mixed frame, note, entity and analyst edge scene", () => {
    expect(canvasSceneSaveSchema.safeParse(scene).success).toBe(true);
    expect(canvasItemSchema.safeParse(note).success).toBe(true);
    expect(canvasItemSchema.safeParse({ ...note, group_id: null }).success).toBe(true);
  });
  it("rejects another board's frame, self-cycles, non-frames as parents, and dangling edges", () => {
    expect(canvasSceneSaveSchema.safeParse({
      ...scene, items: [frame, { ...note, group_id: "11111111-1111-4111-8111-111111111111" }, entity],
    }).success).toBe(false);
    expect(canvasSceneSaveSchema.safeParse({
      ...scene, items: [{ ...frame, group_id: frameId }, note, entity],
    }).success).toBe(false);
    expect(canvasSceneSaveSchema.safeParse({
      ...scene, items: [{ ...note, group_id: entity.id }, entity],
    }).success).toBe(false);
    expect(canvasSceneSaveSchema.safeParse({
      ...scene, edges: [{ ...edge, source_id: frameId }],
    }).success).toBe(false);
    expect(canvasSceneSaveSchema.safeParse({
      ...scene, edges: [{ ...edge, target_id: "11111111-1111-4111-8111-111111111111" }],
    }).success).toBe(false);
    expect(canvasSceneSaveSchema.safeParse({
      ...scene, edges: [{ ...edge, target_id: note.id }],
    }).success).toBe(false);
  });
  it("rejects invalid analyst relationship kinds, overlong rationale and forged entity content", () => {
    expect(canvasEdgeSchema.safeParse({ ...edge, relation_type: "VERIFIED_FACT" }).success).toBe(false);
    expect(canvasEdgeSchema.safeParse({ ...edge, rationale: "x".repeat(501) }).success).toBe(false);
    expect(canvasSceneSaveSchema.safeParse({
      ...scene, items: [frame,note,{ ...entity, content: "altered canonical source" }],
    }).success).toBe(false);
    expect(canvasSceneSaveSchema.safeParse({
      ...scene, edges: [edge,edge],
    }).success).toBe(false);
  });
  it("still accepts Canvas-1 NOTE-only and CANVAS-2 reference-only scenes", () => {
    expect(canvasSceneSaveSchema.safeParse({ ...base, items: [note], edges: [] }).success).toBe(true);
    expect(canvasSceneSaveSchema.safeParse({
      ...base, items: [{ ...entity, group_id: null }], edges: [],
    }).success).toBe(true);
  });
});
