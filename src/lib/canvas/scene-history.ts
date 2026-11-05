import type { CanvasEdge, CanvasItem, CanvasRelationType, CanvasScene } from "./schema";

export type SceneHistory = {
  past: CanvasScene[];
  present: CanvasScene;
  future: CanvasScene[];
};
const LIMIT = 50;
const SCENE_LIMIT = 500;
const EDGE_LIMIT = 1000;
export function createSceneHistory(scene: CanvasScene = { items: [], edges: [] }): SceneHistory {
  return { past: [], present: scene, future: [] };
}
export function commitSceneHistory(h: SceneHistory, next: CanvasScene): SceneHistory {
  if (JSON.stringify(h.present) === JSON.stringify(next)) return h;
  return { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] };
}
export function undoSceneHistory(h: SceneHistory): SceneHistory {
  if (!h.past.length) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future].slice(0, LIMIT),
  };
}
export function redoSceneHistory(h: SceneHistory): SceneHistory {
  if (!h.future.length) return h;
  return {
    past: [...h.past, h.present].slice(-LIMIT),
    present: h.future[0],
    future: h.future.slice(1),
  };
}

export function updateSceneItem(
  scene: CanvasScene, id: string,
  patch: Partial<Pick<CanvasItem, "x" | "y" | "width" | "height" | "z_index" | "content">>,
): CanvasScene {
  return {
    ...scene,
    items: scene.items.map((item): CanvasItem => {
      if (item.id !== id) return item;
      if (item.kind === "ENTITY_REF") {
        // Canonical references cannot be re-written into fabricated source text.
        const { x, y, width, height, z_index } = patch;
        return {
          ...item, x: x ?? item.x, y: y ?? item.y,
          width: width ?? item.width, height: height ?? item.height,
          z_index: z_index ?? item.z_index,
        };
      }
      return { ...item, ...patch } as CanvasItem;
    }),
  };
}

/** React Flow stores a grouped child's position relative to its parent frame. */
export function moveSceneItems(
  scene: CanvasScene, positions: ReadonlyMap<string, { x: number; y: number }>,
): CanvasScene {
  return {
    ...scene,
    items: scene.items.map((item): CanvasItem => {
      const position = positions.get(item.id);
      return position ? { ...item, x: position.x, y: position.y } : item;
    }),
  };
}

export function linkSceneCards(
  scene: CanvasScene, id: string, sourceId: string, targetId: string,
  relation_type: CanvasRelationType = "RELATED_TO",
): CanvasScene {
  const source = scene.items.find((item) => item.id === sourceId);
  const target = scene.items.find((item) => item.id === targetId);
  if (!source || !target || source.kind === "FRAME" || target.kind === "FRAME" ||
      sourceId === targetId || scene.edges.length >= EDGE_LIMIT) return scene;
  if (scene.edges.some((edge) =>
    edge.source_id === sourceId && edge.target_id === targetId && edge.relation_type === relation_type)) {
    return scene;
  }
  return {
    ...scene,
    edges: [...scene.edges, { id, source_id: sourceId, target_id: targetId, relation_type, rationale: "" }],
  };
}

export function updateSceneEdge(
  scene: CanvasScene, id: string,
  patch: Partial<Pick<CanvasEdge, "relation_type" | "rationale">>,
): CanvasScene {
  return {
    ...scene,
    edges: scene.edges.map((edge) => edge.id === id ? { ...edge, ...patch } : edge),
  };
}

export function groupSceneCards(
  scene: CanvasScene, selectedIds: ReadonlySet<string>, frameId: string, label = "Analysis group",
): CanvasScene {
  const members = scene.items.filter((item) =>
    selectedIds.has(item.id) && item.kind !== "FRAME" && !item.group_id);
  if (!members.length || scene.items.length >= SCENE_LIMIT) return scene;
  const left = Math.min(...members.map((item) => item.x));
  const top = Math.min(...members.map((item) => item.y));
  const right = Math.max(...members.map((item) => item.x + item.width));
  const bottom = Math.max(...members.map((item) => item.y + item.height));
  const x = left - 36, y = top - 76;
  const width = Math.max(320, right - left + 72);
  const height = Math.max(220, bottom - top + 112);
  if (width > 5000 || height > 4000 ||
      x < -1_000_000 || x > 1_000_000 ||
      y < -1_000_000 || y > 1_000_000) return scene;
  const frame: CanvasItem = {
    id: frameId, kind: "FRAME",
    content: label.trim().slice(0, 120) || "Analysis group",
    x, y, width, height, z_index: 0,
  };
  return {
    edges: scene.edges,
    items: [
      frame,
      ...scene.items.map((item): CanvasItem =>
        item.kind !== "FRAME" && members.some((member) => member.id === item.id)
          ? { ...item, group_id: frameId, x: item.x - x, y: item.y - y }
          : item),
    ],
  };
}

export function ungroupSceneFrame(scene: CanvasScene, frameId: string): CanvasScene {
  const frame = scene.items.find((item) => item.id === frameId);
  if (!frame || frame.kind !== "FRAME") return scene;
  const items = scene.items.filter((item) => item.id !== frameId)
    .map((item): CanvasItem => {
      if (item.kind === "FRAME" || item.group_id !== frameId) return item;
      const x = item.x + frame.x;
      const y = item.y + frame.y;
      return { ...item, x, y, group_id: null };
    });
  if (items.some((item) => !Number.isFinite(item.x) || !Number.isFinite(item.y) ||
      Math.abs(item.x) > 1_000_000 || Math.abs(item.y) > 1_000_000)) return scene;
  return { items, edges: scene.edges };
}

/** Removing a frame un-groups its children; removing a card removes only its Canvas edges. */
export function removeSceneSelection(
  scene: CanvasScene, selectedNodes: ReadonlySet<string>, selectedEdges: ReadonlySet<string>,
): CanvasScene {
  let items = scene.items;
  for (const frame of scene.items.filter((item) =>
    item.kind === "FRAME" && selectedNodes.has(item.id))) {
    items = ungroupSceneFrame({ items, edges: scene.edges }, frame.id).items;
  }
  const deletedCards = new Set([...selectedNodes].filter((id) =>
    scene.items.some((item) => item.id === id && item.kind !== "FRAME")));
  items = items.filter((item) => !deletedCards.has(item.id));
  return {
    items,
    edges: scene.edges.filter((edge) =>
      !selectedEdges.has(edge.id) &&
      !deletedCards.has(edge.source_id) && !deletedCards.has(edge.target_id)),
  };
}

export type Alignment = "left" | "right" | "top" | "bottom" | "center-x" | "center-y";

/** Align only nodes with a shared coordinate space (same frame or top-level). */
export function alignSceneSelection(
  scene: CanvasScene, selectedIds: ReadonlySet<string>, alignment: Alignment,
): CanvasScene {
  const members = scene.items.filter((item) => selectedIds.has(item.id));
  if (members.length < 2 ||
    new Set(members.map((item) => item.kind === "FRAME" ? "top" : item.group_id ?? "top")).size !== 1) {
    return scene;
  }
  const left = Math.min(...members.map((item) => item.x));
  const right = Math.max(...members.map((item) => item.x + item.width));
  const top = Math.min(...members.map((item) => item.y));
  const bottom = Math.max(...members.map((item) => item.y + item.height));
  return {
    ...scene,
    items: scene.items.map((item): CanvasItem => {
      if (!selectedIds.has(item.id)) return item;
      const x = alignment === "left" ? left :
        alignment === "right" ? right - item.width :
        alignment === "center-x" ? (left + right - item.width) / 2 : item.x;
      const y = alignment === "top" ? top :
        alignment === "bottom" ? bottom - item.height :
        alignment === "center-y" ? (top + bottom - item.height) / 2 : item.y;
      return { ...item, x, y };
    }),
  };
}

export function bringSceneSelectionForward(
  scene: CanvasScene, ids: ReadonlySet<string>, front: boolean,
): CanvasScene {
  const selected = scene.items.filter((item) => ids.has(item.id));
  if (!selected.length) return scene;
  const others = scene.items.filter((item) => !ids.has(item.id));
  const order = front ? [...others, ...selected] : [...selected, ...others];
  return { ...scene, items: order.map((item, index): CanvasItem => ({ ...item, z_index: index })) };
}
