import type { CanvasItem } from "./schema";

export type CanvasHistory = {
  past: CanvasItem[][];
  present: CanvasItem[];
  future: CanvasItem[][];
};

const LIMIT = 50;

export function createCanvasHistory(items: CanvasItem[] = []): CanvasHistory {
  return { past: [], present: items, future: [] };
}

export function commitCanvasHistory(history: CanvasHistory, next: CanvasItem[]): CanvasHistory {
  if (JSON.stringify(history.present) === JSON.stringify(next)) return history;
  return { past: [...history.past, history.present].slice(-LIMIT), present: next, future: [] };
}

export function undoCanvasHistory(history: CanvasHistory): CanvasHistory {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future].slice(0, LIMIT),
  };
}

export function redoCanvasHistory(history: CanvasHistory): CanvasHistory {
  if (!history.future.length) return history;
  return {
    past: [...history.past, history.present].slice(-LIMIT),
    present: history.future[0],
    future: history.future.slice(1),
  };
}

/** Geometry/text may change; canonical record reference and item identity may not. */
export function updateCanvasItem(
  items: CanvasItem[], id: string,
  patch: Partial<Pick<CanvasItem, "x" | "y" | "width" | "height" | "z_index" | "content">>,
): CanvasItem[] {
  return items.map((item) => {
    if (item.id !== id) return item;
    if (item.kind === "NOTE") return { ...item, ...patch };
    // Canonical entity references are immutable after placement.
    // A UI content update must never turn a reference into copied source text.
    return {
      ...item,
      x: patch.x ?? item.x,
      y: patch.y ?? item.y,
      width: patch.width ?? item.width,
      height: patch.height ?? item.height,
      z_index: patch.z_index ?? item.z_index,
    };
  });
}
