import { describe, expect, it } from "vitest";
import {
  canvasCreateSchema, canvasSaveSchema, canvasItemSchema,
} from "@/lib/canvas/schema";
import {
  commitCanvasHistory, createCanvasHistory, undoCanvasHistory, redoCanvasHistory, updateCanvasItem,
} from "@/lib/canvas/history";
import type { CanvasItem } from "@/lib/canvas/schema";

const first: CanvasItem = {
  id: "70cd45ef-2c10-4c02-aa46-959c077011b5",
  kind: "NOTE", content: "Working note",
  x: 120, y: -40, width: 300, height: 190, z_index: 0,
};

describe("CANVAS-1 contracts", () => {
  it("starts empty and does not add sample or CTI objects", () => {
    expect(createCanvasHistory().present).toEqual([]);
  });

  it("validates bounded note content, geometry, and strict mutation payloads", () => {
    expect(canvasItemSchema.safeParse(first).success).toBe(true);
    expect(canvasItemSchema.safeParse({ ...first, width: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(canvasItemSchema.safeParse({ ...first, content: "x".repeat(8001) }).success).toBe(false);
    expect(canvasItemSchema.safeParse({ ...first, kind: "ENTITY_REF" }).success).toBe(false);
    expect(canvasCreateSchema.safeParse({ name: "  Analysis  " }).data?.name).toBe("Analysis");
  });

  it("rejects duplicate identities and malformed save operations", () => {
    const base = { baseRevision: 0, requestId: "6283038e-16be-4aec-b732-3fbb878b1c15" };
    expect(canvasSaveSchema.safeParse({ ...base, items: [first, first] }).success).toBe(false);
    expect(canvasSaveSchema.safeParse({ ...base, items: [first] }).success).toBe(true);
    expect(canvasSaveSchema.safeParse({ ...base, items: [first], project_id: "other" }).success).toBe(false);
    expect(canvasSaveSchema.safeParse({ ...base, items: [first], baseRevision: -1 }).success).toBe(false);
  });

  it("undo/redo restores exactly the committed layout and text", () => {
    const a = createCanvasHistory();
    const b = commitCanvasHistory(a, [first]);
    const changed = updateCanvasItem(b.present, first.id, { x: 410, content: "Revised" });
    const c = commitCanvasHistory(b, changed);
    expect(undoCanvasHistory(c).present).toEqual([first]);
    expect(redoCanvasHistory(undoCanvasHistory(c)).present).toEqual(changed);
    expect(undoCanvasHistory(b).present).toEqual([]);
    expect(redoCanvasHistory(undoCanvasHistory(b)).present).toEqual([first]);
    expect(commitCanvasHistory(b, [first])).toBe(b);
  });

  it("new edits after undo invalidate redo and preserve history cap", () => {
    const b = commitCanvasHistory(createCanvasHistory(), [first]);
    const undone = undoCanvasHistory(b);
    const alternate = commitCanvasHistory(undone, [{ ...first, content: "New path" }]);
    expect(alternate.future).toEqual([]);
    let history = alternate;
    for (let i=0; i<55; i++) history = commitCanvasHistory(history, [{ ...first, x: i }]);
    expect(history.past.length).toBeLessThanOrEqual(50);
  });
});
