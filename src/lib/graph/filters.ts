import type { GraphEdge, GraphEntityType, GraphNode } from "./types";

export function filterGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  opts: {
    query?: string;
    types?: GraphEntityType[];
    relationshipTypes?: string[];
  },
) {
  const allowedTypes = new Set(opts.types ?? nodes.map((node) => node.type));
  const q = opts.query?.trim().toLowerCase() ?? "";
  const visibleNodes = nodes.filter(
    (node) =>
      allowedTypes.has(node.type) &&
      (!q ||
        node.label.toLowerCase().includes(q) ||
        node.subtitle?.toLowerCase().includes(q)),
  );
  const ids = new Set(visibleNodes.map((node) => node.id));
  const allowedRelationships = new Set(
    opts.relationshipTypes ?? edges.map((edge) => edge.relationshipType),
  );
  return {
    nodes: visibleNodes,
    edges: edges.filter(
      (edge) =>
        ids.has(edge.source) &&
        ids.has(edge.target) &&
        allowedRelationships.has(edge.relationshipType),
    ),
  };
}

export function deterministicPosition(index: number, total: number) {
  const cols = Math.ceil(Math.sqrt(Math.max(total, 1)));
  return { x: (index % cols) * 220, y: Math.floor(index / cols) * 150 };
}

export function syncRelationshipFilters(
  current: string[],
  known: Set<string>,
  discovered: string[],
) {
  const next = [...current];
  const nextKnown = new Set(known);
  for (const relationship of discovered) {
    if (!nextKnown.has(relationship)) {
      next.push(relationship);
      nextKnown.add(relationship);
    }
  }
  return { relationships: next, known: nextKnown };
}

export function preservedPosition<
  T extends { id: string; position: { x: number; y: number } },
>(existing: Map<string, T>, id: string, fallback: { x: number; y: number }) {
  return existing.get(id)?.position ?? fallback;
}
