"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import {
  applySavedOrDeterministicPosition,
  deterministicPosition,
  filterGraph,
  preservedPosition,
  syncRelationshipFilters,
} from "@/lib/graph/filters";
import {
  graphEntityTypes,
  nodeId,
  type GraphEdge,
  type GraphEntityType,
  type GraphNode,
  type GraphNodePosition,
  type GraphResponse,
} from "@/lib/graph/types";

const colors: Record<GraphEntityType, string> = {
  ACTOR: "#ef4444",
  CAMPAIGN: "#f97316",
  INDICATOR: "#22c55e",
  MALWARE: "#a855f7",
  CVE: "#eab308",
  MITRE: "#38bdf8",
  EVIDENCE: "#94a3b8",
};
const icons: Record<GraphEntityType, string> = {
  ACTOR: "👤",
  CAMPAIGN: "🎯",
  INDICATOR: "🔎",
  MALWARE: "🧬",
  CVE: "🛡️",
  MITRE: "📐",
  EVIDENCE: "📎",
};

function graphError(payload: unknown, fallback: string) {
  return payload && typeof payload === "object" && "error" in payload
    ? String((payload as { error?: unknown }).error ?? fallback)
    : fallback;
}

function GraphCanvas({
  data,
  projectId,
  savedPositions,
  onReload,
  onLayoutReset,
}: {
  data: GraphResponse;
  projectId: string;
  savedPositions: Map<string, { x: number; y: number }>;
  onReload: () => Promise<void>;
  onLayoutReset: () => Promise<void>;
}) {
  const { fitView } = useReactFlow();
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<GraphEntityType[]>([...graphEntityTypes]);
  const relationshipOptions = useMemo(
    () =>
      Array.from(
        new Set(data.edges.map((edge) => edge.relationshipType)),
      ).sort(),
    [data.edges],
  );
  const [relationships, setRelationships] =
    useState<string[]>(relationshipOptions);
  const knownRelationshipTypes = useRef(new Set(relationshipOptions));
  const [selected, setSelected] = useState<string[]>([]);
  const [drawer, setDrawer] = useState<GraphNode | null>(null);
  const [message, setMessage] = useState("");
  const [label, setLabel] = useState("related_to");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<GraphEdge | null>(null);

  useEffect(() => {
    const newlyDiscovered = relationshipOptions.filter(
      (relationship) => !knownRelationshipTypes.current.has(relationship),
    );
    if (newlyDiscovered.length) {
      setRelationships((current) => {
        const synced = syncRelationshipFilters(
          current,
          knownRelationshipTypes.current,
          relationshipOptions,
        );
        knownRelationshipTypes.current = synced.known;
        return synced.relationships;
      });
    }
  }, [relationshipOptions]);

  const nodesRef = useRef(new Map<string, Node>());
  const filtered = useMemo(
    () =>
      filterGraph(data.nodes, data.edges, {
        query,
        types,
        relationshipTypes: relationships,
      }),
    [data.edges, data.nodes, query, relationships, types],
  );
  const makeNodes = useCallback(
    (preservePositions = true) =>
      filtered.nodes.map<Node>((node, index) => {
        const existing = preservePositions
          ? preservedPosition(
              nodesRef.current,
              node.id,
              deterministicPosition(index, filtered.nodes.length),
            )
          : undefined;
        return {
          id: node.id,
          position:
            savedPositions.get(node.id) ??
            existing ??
            applySavedOrDeterministicPosition(
              savedPositions,
              node.id,
              index,
              filtered.nodes.length,
            ),
          data: {
            label: (
              <button className="text-left" onClick={() => setDrawer(node)}>
                <span aria-hidden>{icons[node.type]}</span> <b>{node.label}</b>
                <br />
                <span className="text-xs">
                  {node.type}
                  {node.subtitle ? ` · ${node.subtitle}` : ""}
                </span>
              </button>
            ),
          },
          style: {
            border: `${selected.includes(node.id) ? 4 : 2}px solid ${colors[node.type]}`,
            background:
              query && node.label.toLowerCase().includes(query.toLowerCase())
                ? "#164e63"
                : selected.includes(node.id)
                  ? "#312e81"
                  : "#020617",
            color: "white",
            width: 190,
          },
        };
      }),
    [filtered.nodes, query, savedPositions, selected],
  );
  const makeEdges = useCallback(
    () =>
      filtered.edges.map<Edge>((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.relationshipType,
        animated: edge.sourceKind === "manual",
        style: { stroke: edge.sourceKind === "manual" ? "#f0abfc" : "#64748b" },
      })),
    [filtered.edges],
  );
  const initialNodes = filtered.nodes.map<Node>((node, index) => ({
    id: node.id,
    position: deterministicPosition(index, filtered.nodes.length),
    data: { label: `${icons[node.type]} ${node.label}` },
    style: {
      border: `2px solid ${colors[node.type]}`,
      background: "#020617",
      color: "white",
      width: 190,
    },
  }));
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(makeEdges());

  useEffect(() => {
    nodesRef.current = new Map(nodes.map((node) => [node.id, node]));
  }, [nodes]);

  useEffect(() => {
    setNodes(makeNodes(true));
    setEdges(makeEdges());
  }, [makeEdges, makeNodes, setEdges, setNodes]);

  async function resetLayout() {
    setQuery("");
    setTypes([...graphEntityTypes]);
    setRelationships(relationshipOptions);
    setSelected([]);
    const resetNodes = data.nodes.map<Node>((node, index) => ({
      id: node.id,
      position: deterministicPosition(index, data.nodes.length),
      data: { label: `${icons[node.type]} ${node.label}` },
      style: {
        border: `2px solid ${colors[node.type]}`,
        background: "#020617",
        color: "white",
        width: 190,
      },
    }));
    setNodes(resetNodes);
    try {
      await onLayoutReset();
      setMessage("Saved graph layout reset.");
    } catch {
      setMessage("Unable to reset saved graph layout.");
    }
    requestAnimationFrame(() => void fitView({ duration: 250 }));
  }

  const saveNodePosition = useCallback(
    async (_: MouseEvent | TouchEvent, dragged: Node) => {
      const graphNode = data.nodes.find((node) => node.id === dragged.id);
      if (!graphNode) return;
      const response = await fetch(`/api/projects/${projectId}/graph/layout`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          positions: [
            {
              entityType: graphNode.type,
              entityId: graphNode.entityId,
              x: dragged.position.x,
              y: dragged.position.y,
            },
          ],
        }),
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => ({}));
        setMessage(graphError(payload, "Unable to save graph layout."));
      } else {
        setMessage("Graph layout saved.");
      }
    },
    [data.nodes, projectId],
  );

  async function createLink() {
    if (selected.length !== 2) return;
    const [source, target] = selected.map((id) =>
      data.nodes.find((node) => node.id === id),
    );
    if (!source || !target) return;
    const response = await fetch(`/api/projects/${projectId}/relationships`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceType: source.type,
        sourceId: source.entityId,
        targetType: target.type,
        targetId: target.entityId,
        relationshipType: label,
        description,
      }),
    });
    const payload: unknown = await response.json().catch(() => ({}));
    if (response.ok) {
      setMessage("Manual relationship saved.");
      setSelected([]);
      setDescription("");
      await onReload();
    } else {
      setMessage(graphError(payload, "Unable to save relationship."));
    }
  }

  async function updateEdge(del = false) {
    if (!editing || editing.sourceKind !== "manual") return;
    const id = editing.id.replace("manual:", "");
    const response = await fetch(
      `/api/projects/${projectId}/relationships/${id}`,
      {
        method: del ? "DELETE" : "PATCH",
        headers: { "content-type": "application/json" },
        body: del
          ? undefined
          : JSON.stringify({ relationshipType: label, description }),
      },
    );
    const payload: unknown = await response.json().catch(() => ({}));
    if (response.ok) {
      setMessage(
        del ? "Manual relationship deleted." : "Manual relationship updated.",
      );
      setEditing(null);
      await onReload();
    } else {
      setMessage(graphError(payload, "Unable to update manual relationship."));
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex flex-wrap gap-3">
          <input
            className="input"
            aria-label="Search graph"
            placeholder="Search labels"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="btn" onClick={resetLayout}>
            Reset layout/filters
          </button>
          <button
            className="btn"
            disabled={selected.length !== 2}
            onClick={createLink}
          >
            Create Link
          </button>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Node type filters">
          {graphEntityTypes.map((type) => (
            <label key={type} className="text-sm">
              <input
                type="checkbox"
                checked={types.includes(type)}
                onChange={(event) =>
                  setTypes((current) =>
                    event.target.checked
                      ? [...current, type]
                      : current.filter((item) => item !== type),
                  )
                }
              />{" "}
              {icons[type]} {type}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Relationship filters">
          {relationshipOptions.map((relationship) => (
            <label key={relationship} className="text-sm">
              <input
                type="checkbox"
                checked={relationships.includes(relationship)}
                onChange={(event) =>
                  setRelationships((current) =>
                    event.target.checked
                      ? [...current, relationship]
                      : current.filter((item) => item !== relationship),
                  )
                }
              />{" "}
              {relationship}
            </label>
          ))}
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <input
            className="input"
            aria-label="Relationship label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <input
            className="input md:col-span-2"
            aria-label="Relationship description"
            placeholder="Optional description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        {message && <p className="text-sm text-cyan-200">{message}</p>}
        {data.meta.truncated && (
          <p className="text-sm text-amber-300">
            Large graph warning: graph limited to {data.meta.nodeLimit} nodes
            and {data.meta.edgeLimit} edges. Omitted {data.meta.omittedNodes}{" "}
            nodes and {data.meta.omittedEdges} edges.
          </p>
        )}
        <p className="text-sm text-slate-400">
          Manual edges are animated purple; semantic CTI edges are gray.
          Selected nodes have a thicker border. Select exactly two nodes to
          create a link.
        </p>
      </div>
      <div className="h-[650px] rounded-xl border border-slate-800 bg-slate-950">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={saveNodePosition}
          onNodeClick={(_, node) =>
            setSelected((current) =>
              current.includes(node.id)
                ? current.filter((id) => id !== node.id)
                : current.length < 2
                  ? [...current, node.id]
                  : [current[1], node.id],
            )
          }
          onEdgeClick={(_, edge) => {
            const graphEdge = data.edges.find((item) => item.id === edge.id);
            if (!graphEdge) return;
            if (graphEdge.sourceKind === "manual") {
              setEditing(graphEdge);
              setLabel(graphEdge.relationshipType);
              setDescription(graphEdge.description ?? "");
            } else {
              setEditing(null);
              setMessage(
                "Semantic links are managed on the linked CTI detail page.",
              );
              if (graphEdge.detailUrl)
                window.location.href = graphEdge.detailUrl;
            }
          }}
        >
          <Background />
          <Controls />
          <MiniMap
            nodeColor={(node) =>
              colors[
                (data.nodes.find((item) => item.id === node.id)?.type ??
                  "EVIDENCE") as GraphEntityType
              ]
            }
          />
        </ReactFlow>
      </div>
      {drawer && (
        <aside className="card">
          <button className="float-right" onClick={() => setDrawer(null)}>
            Close
          </button>
          <h2 className="text-xl font-bold">
            {icons[drawer.type]} {drawer.label}
          </h2>
          <p>{drawer.subtitle}</p>
          <dl>
            {Object.entries(drawer.metadata).map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs uppercase text-slate-500">{key}</dt>
                <dd>{String(value ?? "—")}</dd>
              </div>
            ))}
          </dl>
          <a className="text-cyan-200" href={drawer.detailUrl}>
            Open detail/edit page
          </a>
        </aside>
      )}
      {editing && editing.sourceKind === "manual" && (
        <div className="card">
          <p>Editing manual relationship: {editing.relationshipType}</p>
          <button className="btn" onClick={() => updateEdge(false)}>
            Save edit
          </button>{" "}
          <button className="btn" onClick={() => updateEdge(true)}>
            Delete manual link
          </button>
        </div>
      )}
    </div>
  );
}

export function KnowledgeGraph({ projectId }: { projectId: string }) {
  const [data, setData] = useState<GraphResponse | null>(null);
  const [savedPositions, setSavedPositions] = useState(
    new Map<string, { x: number; y: number }>(),
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [response, layoutResponse] = await Promise.all([
      fetch(`/api/projects/${projectId}/graph`),
      fetch(`/api/projects/${projectId}/graph/layout`),
    ]);
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => ({}));
      setError(graphError(payload, "Unable to load the knowledge graph."));
    } else {
      const graph = (await response.json()) as GraphResponse;
      setData(graph);
      if (layoutResponse.ok) {
        const layout = (await layoutResponse.json()) as {
          positions?: GraphNodePosition[];
        };
        setSavedPositions(
          new Map(
            (layout.positions ?? []).map((position) => [
              nodeId(position.entityType, position.entityId),
              { x: position.x, y: position.y },
            ]),
          ),
        );
      }
    }
    setLoading(false);
  }, [projectId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => void load(), [load]);
  if (loading) return <div className="card">Loading knowledge graph…</div>;
  if (error) return <div className="card text-red-300">{error}</div>;
  if (!data || data.nodes.length === 0) {
    return (
      <div className="card">
        No graph entities yet. Add CTI records or Evidence first.
      </div>
    );
  }
  const resetServerLayout = async () => {
    const response = await fetch(`/api/projects/${projectId}/graph/layout`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("Unable to reset graph layout.");
    setSavedPositions(new Map());
  };
  return (
    <ReactFlowProvider>
      <GraphCanvas
        data={data}
        projectId={projectId}
        savedPositions={savedPositions}
        onReload={load}
        onLayoutReset={resetServerLayout}
      />
    </ReactFlowProvider>
  );
}
