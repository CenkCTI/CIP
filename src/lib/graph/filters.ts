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
