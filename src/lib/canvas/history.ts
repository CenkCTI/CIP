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
  return {
    past: [...history.past, history.present].slice(-LIMIT),
    present: next,
    future: [],
  };
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

export function updateCanvasItem(items: CanvasItem[], id: string, patch: Partial<CanvasItem>): CanvasItem[] {
  return items.map((item) => item.id === id ? { ...item, ...patch, id: item.id, kind: item.kind } : item);
}
