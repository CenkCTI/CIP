import type { GraphEdge, GraphEntityType, GraphNode } from "./types";
export function filterGraph(nodes: GraphNode[], edges: GraphEdge[], opts: { query?: string; types?: GraphEntityType[]; relationshipTypes?: string[] }) {
 const allowedTypes = new Set(opts.types?.length ? opts.types : nodes.map(n=>n.type));
 const q = opts.query?.trim().toLowerCase() ?? "";
 const visibleNodes = nodes.filter(n => allowedTypes.has(n.type) && (!q || n.label.toLowerCase().includes(q) || n.subtitle?.toLowerCase().includes(q)));
 const ids = new Set(visibleNodes.map(n=>n.id));
 const rels = new Set(opts.relationshipTypes?.length ? opts.relationshipTypes : edges.map(e=>e.relationshipType));
 return { nodes: visibleNodes, edges: edges.filter(e => ids.has(e.source) && ids.has(e.target) && rels.has(e.relationshipType)) };
}
export function deterministicPosition(index:number, total:number) { const cols=Math.ceil(Math.sqrt(Math.max(total,1))); return { x:(index%cols)*220, y:Math.floor(index/cols)*150 }; }
