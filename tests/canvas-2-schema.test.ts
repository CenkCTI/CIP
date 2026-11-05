import { describe, expect, it } from "vitest";
import { canvasItemSchema, canvasSaveSchema } from "@/lib/canvas/schema";
import { canvasEntityTypes } from "@/lib/canvas/entity-registry";
import { commitCanvasHistory, createCanvasHistory, undoCanvasHistory } from "@/lib/canvas/history";

const entity = {
  id: "7b73aa8e-8155-41b7-b4c1-bc88854b1001",
  kind: "ENTITY_REF" as const,
  content: "",
  record_type: "SOURCE" as const,
  record_id: "0cdfccdb-964c-428e-a147-464f6c601001",
  x: 180, y: 0, width: 340, height: 220, z_index: 1,
};
const note = {
  id: "7b73aa8e-8155-41b7-b4c1-bc88854b1002",
  kind: "NOTE" as const, content: "Existing analysis note",
  x: 0, y: 0, width: 300, height: 190, z_index: 0,
};

describe("CANVAS-2 persistence compatibility", () => {
  it("accepts all 18 registry types as typed references", () => {
    for (const record_type of canvasEntityTypes) {
      expect(canvasItemSchema.safeParse({ ...entity, record_type }).success).toBe(true);
    }
  });

  it("preserves all Canvas-1 NOTE layouts and nullable SQL columns", () => {
    expect(canvasItemSchema.safeParse(note).success).toBe(true);
    expect(canvasItemSchema.safeParse({ ...note, record_type: null, record_id: null }).success).toBe(true);
    const mixed = [note, entity];
    const h = commitCanvasHistory(createCanvasHistory([note]), mixed);
    expect(undoCanvasHistory(h).present).toEqual([note]);
  });

  it("forbids arbitrary classes, copied entity text or non-UUID references", () => {
    expect(canvasItemSchema.safeParse({ ...entity, record_type: "USER" }).success).toBe(false);
    expect(canvasItemSchema.safeParse({ ...entity, record_id: "../../secret" }).success).toBe(false);
    expect(canvasItemSchema.safeParse({ ...entity, content: "Forged canonical text" }).success).toBe(false);
    expect(canvasItemSchema.safeParse({ ...entity, metadata: { secret: 1 } }).success).toBe(false);
    expect(canvasItemSchema.safeParse({ ...note, record_type: "SOURCE", record_id: entity.record_id }).success).toBe(false);
  });

  it("validates mixed atomic saves and protects duplicate card identities", () => {
    const base = { baseRevision: 2, requestId: "0cdfccdb-964c-428e-a147-464f6c601002" };
    expect(canvasSaveSchema.safeParse({ ...base, items: [note, entity] }).success).toBe(true);
    expect(canvasSaveSchema.safeParse({ ...base, items: [entity, entity] }).success).toBe(false);
    expect(canvasSaveSchema.safeParse({ ...base, items: [{ ...entity, x: Infinity }] }).success).toBe(false);
  });
});
