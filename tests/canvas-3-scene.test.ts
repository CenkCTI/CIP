import { describe, expect, it } from "vitest";
import type { CanvasItem, CanvasScene } from "@/lib/canvas/schema";
import {
  alignSceneSelection, bringSceneSelectionForward, commitSceneHistory, createSceneHistory,
  groupSceneCards, linkSceneCards, moveSceneItems, redoSceneHistory, removeSceneSelection,
  undoSceneHistory, ungroupSceneFrame, updateSceneEdge, updateSceneItem,
} from "@/lib/canvas/scene-history";

const a: CanvasItem = {
  id: "cfd37ec5-7a6c-48ee-ae66-1b8a7eb50001", kind: "NOTE", content: "Question",
  x: 100, y: 200, width: 300, height: 180, z_index: 0,
};
const b: CanvasItem = {
  id: "cfd37ec5-7a6c-48ee-ae66-1b8a7eb50002", kind: "ENTITY_REF", content: "",
  record_type: "INDICATOR", record_id: "cfd37ec5-7a6c-48ee-ae66-1b8a7eb50003",
  x: 550, y: 240, width: 280, height: 200, z_index: 1,
};
const c: CanvasItem = {
  id: "cfd37ec5-7a6c-48ee-ae66-1b8a7eb50004", kind: "NOTE", content: "Analyst note",
  x: 1000, y: 150, width: 250, height: 170, z_index: 2,
};
const frameId = "cfd37ec5-7a6c-48ee-ae66-1b8a7eb50005";
const edgeId = "cfd37ec5-7a6c-48ee-ae66-1b8a7eb50006";
const base: CanvasScene = { items: [a, b, c], edges: [] };

describe("CANVAS-3 scene operations", () => {
  it("starts empty and treats cards and edges as a single undoable snapshot", () => {
    expect(createSceneHistory().present).toEqual({ items: [], edges: [] });
    const linked = linkSceneCards(base, edgeId, a.id, b.id, "SUPPORTS");
    const h = commitSceneHistory(createSceneHistory(base), linked);
    expect(h.present.edges).toHaveLength(1);
    expect(undoSceneHistory(h).present).toEqual(base);
    expect(redoSceneHistory(undoSceneHistory(h)).present).toEqual(linked);
    expect(commitSceneHistory(h, linked)).toBe(h);
  });
  it("groups only selected ungrouped cards into a single draggable parent frame", () => {
    const grouped = groupSceneCards(base, new Set([a.id, b.id]), frameId, "Working hypothesis");
    const frame = grouped.items.find((item) => item.id === frameId);
    expect(frame?.kind).toBe("FRAME");
    expect(frame?.content).toBe("Working hypothesis");
    expect(grouped.items.find((item) => item.id === a.id)?.group_id).toBe(frameId);
    expect(grouped.items.find((item) => item.id === c.id)?.group_id).toBeUndefined();
    const ungrouped = ungroupSceneFrame(grouped, frameId);
    expect(ungrouped.items).toHaveLength(3);
    expect(ungrouped.items.find((item) => item.id === a.id)?.x).toBe(a.x);
    expect(ungrouped.items.find((item) => item.id === b.id)?.y).toBe(b.y);
    expect(groupSceneCards(grouped, new Set([a.id]), "cfd37ec5-7a6c-48ee-ae66-1b8a7eb50007"))
      .toBe(grouped);
  });
  it("removes a frame non-destructively and deletes only edges when its card is removed", () => {
    const linked = linkSceneCards(base, edgeId, a.id, b.id);
    const grouped = groupSceneCards(linked, new Set([a.id,b.id]), frameId);
    const withoutFrame = removeSceneSelection(grouped, new Set([frameId]), new Set());
    expect(withoutFrame.items).toHaveLength(3);
    expect(withoutFrame.edges).toHaveLength(1);
    expect(withoutFrame.items.find((item) => item.id === a.id)?.x).toBe(a.x);
    const withoutCard = removeSceneSelection(withoutFrame, new Set([a.id]), new Set());
    expect(withoutCard.items).toHaveLength(2);
    expect(withoutCard.edges).toHaveLength(0);
  });
  it("denies invented endpoint links, duplicate relationships and entity source text edits", () => {
    const invalid = linkSceneCards(base, edgeId, a.id, "f0bbcc15-e150-4539-9b03-b65bc56c8001");
    expect(invalid).toBe(base);
    expect(linkSceneCards(base, edgeId, a.id, a.id)).toBe(base);
    const linked = linkSceneCards(base, edgeId, a.id, b.id);
    expect(linkSceneCards(linked, "cfd37ec5-7a6c-48ee-ae66-1b8a7eb50008", a.id, b.id))
      .toBe(linked);
    const modified = updateSceneItem(linked, b.id, { content: "fake evidence", x: 601 });
    expect(modified.items.find((item) => item.id === b.id)?.content).toBe("");
    expect(modified.items.find((item) => item.id === b.id)?.x).toBe(601);
    expect(updateSceneEdge(linked, edgeId, { relation_type: "CONTRADICTS", rationale: "Different source" })
      .edges[0].rationale).toBe("Different source");
  });
  it("aligns compatible peers and prevents mixing parent and child coordinate spaces", () => {
    const aligned = alignSceneSelection(base, new Set([a.id,b.id]), "left");
    expect(aligned.items.find((item) => item.id === b.id)?.x).toBe(100);
    const grouped = groupSceneCards(base,new Set([a.id,b.id]),frameId);
    expect(alignSceneSelection(grouped,new Set([a.id,c.id]),"left")).toBe(grouped);
    const moved = moveSceneItems(grouped,new Map([[frameId,{x:345,y:160}]]));
    expect(moved.items.find((item) => item.id === frameId)?.x).toBe(345);
    const normalized = ungroupSceneFrame(moved,frameId);
    expect(normalized.items.find((item) => item.id === a.id)?.x).toBe(381);
    expect(bringSceneSelectionForward(base,new Set([a.id]),true).items.at(-1)?.id).toBe(a.id);
  });
  it("caps history at 50 states while preserving selected edge layout in undo/redo", () => {
    let h = createSceneHistory(base);
    for (let index = 0; index < 60; index++) {
      h = commitSceneHistory(h, updateSceneItem(h.present,a.id,{x:index}));
    }
    expect(h.past.length).toBe(50);
    const undone = undoSceneHistory(h);
    const changed = commitSceneHistory(undone,linkSceneCards(undone.present,edgeId,a.id,b.id));
    expect(changed.future).toEqual([]);
  });
});
