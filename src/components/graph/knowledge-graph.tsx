"use client";

import Link from "next/link";
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
  deterministicPosition,
  filterGraph,
  positionWithSavedFallback,
  preservedPosition,
  syncRelationshipFilters,
  upsertSavedPosition,
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
  ACTOR: "#b9776e",
  CAMPAIGN: "#c9963e",
  INDICATOR: "#6f9b79",
  MALWARE: "#9676a8",
  CVE: "#b69a52",
  MITRE: "#678ca3",
  EVIDENCE: "#777f83",
  REPORT: "#a67886",
  INFRASTRUCTURE_CLUSTER: "#5d8e8f",
};

const typeLabels: Record<GraphEntityType, string> = {
  ACTOR: "Actor",
  CAMPAIGN: "Campaign",
  INDICATOR: "Indicator",
  MALWARE: "Malware",
  CVE: "CVE",
  MITRE: "ATT&CK",
  EVIDENCE: "Evidence",
  REPORT: "Report",
  INFRASTRUCTURE_CLUSTER: "Infrastructure",
};

const typeCodes: Record<GraphEntityType, string> = {
  ACTOR: "ACTR",
  CAMPAIGN: "CMPN",
  INDICATOR: "IOC",
  MALWARE: "MALW",
  CVE: "CVE",
  MITRE: "ATT&CK",
  EVIDENCE: "EVID",
  REPORT: "RPT",
  INFRASTRUCTURE_CLUSTER: "INFRA",
};

function terrainShadow(degree: number, maxDegree: number, selected: boolean) {
  const density = maxDegree > 0 ? degree / maxDegree : 0;
  const contours: string[] = [];
  if (degree >= 2 && density >= 0.18) contours.push("0 0 0 12px rgba(137,128,105,.035)");
  if (degree >= 3 && density >= 0.38) contours.push("0 0 0 25px rgba(137,128,105,.03)");
  if (degree >= 4 && density >= 0.58) contours.push("0 0 0 40px rgba(185,130,47,.026)");
  if (degree >= 5 && density >= 0.76) contours.push("0 0 0 58px rgba(185,130,47,.018)");
  if (selected) contours.push("0 0 0 2px rgba(210,163,78,.22)");
  contours.push("0 10px 26px rgba(0,0,0,.22)");
  return contours.join(", ");
}

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
  onPositionSaved,
  layoutWarning,
}: {
  data: GraphResponse;
  projectId: string;
  savedPositions: Map<string, { x: number; y: number }>;
  onReload: () => Promise<void>;
  onLayoutReset: () => Promise<void>;
  onPositionSaved: (id: string, position: { x: number; y: number }) => void;
  layoutWarning: string;
}) {
  const { fitView } = useReactFlow();
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<GraphEntityType[]>([...graphEntityTypes]);
  const relationshipOptions = useMemo(
    () => Array.from(new Set(data.edges.map((edge) => edge.relationshipType))).sort(),
    [data.edges],
  );
  const [relationships, setRelationships] = useState<string[]>(relationshipOptions);
  const knownRelationshipTypes = useRef(new Set(relationshipOptions));
  const [selected, setSelected] = useState<string[]>([]);
  const [drawer, setDrawer] = useState<GraphNode | null>(null);
  const [message, setMessage] = useState("");
  const [label, setLabel] = useState("related_to");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<GraphEdge | null>(null);
  const [viewportZoom, setViewportZoom] = useState(1);

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
  const draggedNodeIds = useRef(new Set<string>());
  const filtered = useMemo(
    () =>
      filterGraph(data.nodes, data.edges, {
        query,
        types,
        relationshipTypes: relationships,
      }),
    [data.edges, data.nodes, query, relationships, types],
  );

  const selectedNodes = selected
    .map((id) => data.nodes.find((node) => node.id === id))
    .filter((node): node is GraphNode => Boolean(node));

  const nodeTypeCounts = useMemo(
    () =>
      Object.fromEntries(
        graphEntityTypes.map((type) => [
          type,
          data.nodes.filter((node) => node.type === type).length,
        ]),
      ) as Record<GraphEntityType, number>,
    [data.nodes],
  );

  const degreeMap = useMemo(() => {
    const degree = new Map<string, number>();
    for (const node of filtered.nodes) degree.set(node.id, 0);
    for (const edge of filtered.edges) {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }
    return degree;
  }, [filtered.edges, filtered.nodes]);
  const maxDegree = Math.max(1, ...degreeMap.values());

  const makeNodes = useCallback(
    (preservePositions = true) =>
      filtered.nodes.map<Node>((node, index) => {
        const existing =
          preservePositions && draggedNodeIds.current.has(node.id)
            ? preservedPosition(
                nodesRef.current,
                node.id,
                deterministicPosition(index, filtered.nodes.length),
              )
            : undefined;
        const isSelected = selected.includes(node.id);
        const isMatch =
          Boolean(query) &&
          (node.label.toLowerCase().includes(query.toLowerCase()) ||
            node.subtitle?.toLowerCase().includes(query.toLowerCase()));
        const degree = degreeMap.get(node.id) ?? 0;
        const overviewMode = viewportZoom < 0.62;
        const labelScale =
          viewportZoom < 0.82
            ? Math.min(2.9, 0.86 / Math.max(viewportZoom, 0.28))
            : 1;

        return {
          id: node.id,
          position: positionWithSavedFallback(
            existing,
            savedPositions,
            node.id,
            index,
            filtered.nodes.length,
          ),
          data: {
            label: (
              <button
                className="grid w-full gap-2 text-left"
                type="button"
                style={{
                  transform: `scale(${labelScale})`,
                  transformOrigin: "center center",
                }}
                onClick={() => {
                  setEditing(null);
                  setDrawer(node);
                }}
              >
                {!overviewMode ? (
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
                      style={{ color: colors[node.type] }}
                    >
                      {typeCodes[node.type]}
                    </span>
                    {isSelected ? (
                      <span className="text-[10px] uppercase tracking-[0.12em] text-amber-300">
                        selected
                      </span>
                    ) : null}
                  </span>
                ) : null}
                <span
                  className={
                    overviewMode
                      ? "truncate text-[13px] font-semibold text-stone-100 [text-shadow:0_1px_3px_#000]"
                      : "truncate text-sm font-semibold text-stone-100"
                  }
                >
                  {node.label}
                </span>
                {!overviewMode && node.subtitle ? (
                  <span className="line-clamp-2 text-[11px] leading-4 text-stone-500">
                    {node.subtitle}
                  </span>
                ) : null}
              </button>
            ),
          },
          style: {
            border: isSelected
              ? "2px solid #d2a34e"
              : "1px solid " + colors[node.type],
            borderRadius: 8,
            background: isMatch
              ? "rgba(185, 130, 47, 0.14)"
              : isSelected
                ? "#171b1d"
                : "#101518",
            boxShadow: terrainShadow(degree, maxDegree, isSelected),
            color: "#e7e5e4",
            width: 210,
            padding: overviewMode ? 9 : 12,
            zIndex: isSelected ? 60 : 10 + Math.min(degree, 30),
          },
        };
      }),
    [
      degreeMap,
      filtered.nodes,
      maxDegree,
      query,
      savedPositions,
      selected,
      viewportZoom,
    ],
  );

  const makeEdges = useCallback(
    () =>
      filtered.edges.map<Edge>((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: viewportZoom >= 0.58 ? edge.relationshipType : undefined,
        animated: edge.sourceKind === "manual",
        style: {
          stroke: edge.sourceKind === "manual" ? "#c9963e" : "#5f6669",
          strokeWidth: edge.sourceKind === "manual" ? 1.8 : 1.2,
        },
        labelStyle: {
          fill: edge.sourceKind === "manual" ? "#d8b575" : "#8e9496",
          fontSize: 10,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        },
        labelBgStyle: {
          fill: "#0f1417",
          fillOpacity: 0.92,
        },
      })),
    [filtered.edges, viewportZoom],
  );

  const initialNodes = filtered.nodes.map<Node>((node, index) => ({
    id: node.id,
    position: deterministicPosition(index, filtered.nodes.length),
    data: { label: node.label },
    style: {
      border: "1px solid " + colors[node.type],
      borderRadius: 8,
      background: "#101518",
      color: "#e7e5e4",
      width: 210,
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

  function fitGraph() {
    requestAnimationFrame(() => void fitView({ duration: 280, padding: 0.1 }));
  }

  async function resetLayout() {
    try {
      await onLayoutReset();
    } catch {
      setMessage("Unable to reset saved graph layout; current layout preserved.");
      return;
    }
    draggedNodeIds.current.clear();
    setQuery("");
    setTypes([...graphEntityTypes]);
    setRelationships(relationshipOptions);
    setSelected([]);
    setDrawer(null);
    setEditing(null);
    const resetNodes = data.nodes.map<Node>((node, index) => ({
      id: node.id,
      position: deterministicPosition(index, data.nodes.length),
      data: { label: node.label },
      style: {
        border: "1px solid " + colors[node.type],
        borderRadius: 8,
        background: "#101518",
        color: "#e7e5e4",
        width: 210,
      },
    }));
    setNodes(resetNodes);
    setMessage("Saved graph layout and filters reset.");
    fitGraph();
  }

  const saveNodePosition = useCallback(
    async (_: MouseEvent | TouchEvent, dragged: Node) => {
      const graphNode = data.nodes.find((node) => node.id === dragged.id);
      if (!graphNode) return;
      draggedNodeIds.current.add(dragged.id);
      setNodes((current) =>
        current.map((node) =>
          node.id === dragged.id
            ? { ...node, position: dragged.position }
            : node,
        ),
      );
      onPositionSaved(dragged.id, dragged.position);
      const response = await fetch(
        "/api/projects/" + projectId + "/graph/layout",
        {
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
        },
      );
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => ({}));
        setMessage(
          graphError(payload, "Unable to save graph layout.") +
            " Current position is unsaved.",
        );
      } else {
        setMessage("Graph layout saved.");
      }
    },
    [data.nodes, onPositionSaved, projectId, setNodes],
  );

  async function createLink() {
    if (selected.length !== 2) return;
    const [source, target] = selected.map((id) =>
      data.nodes.find((node) => node.id === id),
    );
    if (!source || !target) return;

    const response = await fetch(
      "/api/projects/" + projectId + "/relationships",
      {
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
      },
    );
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
      "/api/projects/" + projectId + "/relationships/" + id,
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

  function toggleType(type: GraphEntityType) {
    setTypes((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type],
    );
  }

  function toggleRelationship(relationship: string) {
    setRelationships((current) =>
      current.includes(relationship)
        ? current.filter((item) => item !== relationship)
        : [...current, relationship],
    );
  }

  function swapSelection() {
    if (selected.length === 2) setSelected([selected[1], selected[0]]);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-stone-800/80 bg-[#0f1417] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="field min-w-64 flex-1"
            aria-label="Search graph"
            placeholder="Search entities…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="citem-button-ghost" type="button" onClick={fitGraph}>
            Fit view
          </button>
          <button className="citem-button-ghost" type="button" onClick={resetLayout}>
            Reset view
          </button>
        </div>

        <details className="mt-3 rounded border border-stone-800/70 bg-black/10">
          <summary className="cursor-pointer px-3 py-3 text-xs font-medium uppercase tracking-[0.14em] text-stone-500">
            Filters
            <span className="ml-2 font-mono normal-case tracking-normal text-stone-600">
              {filtered.nodes.length}/{data.nodes.length} nodes · {filtered.edges.length}/{data.edges.length} links
            </span>
          </summary>
          <div className="space-y-4 border-t border-stone-800 p-3">
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="citem-label">Entity types</p>
                <button
                  className="text-xs text-amber-300 hover:text-amber-200"
                  type="button"
                  onClick={() => setTypes([...graphEntityTypes])}
                >
                  Show all
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2" aria-label="Node type filters">
                {graphEntityTypes.map((type) => {
                  const active = types.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleType(type)}
                      className={
                        "inline-flex items-center gap-2 rounded border px-2.5 py-1.5 text-xs transition " +
                        (active
                          ? "border-amber-900/50 bg-amber-950/10 text-stone-200"
                          : "border-stone-800 bg-black/10 text-stone-600")
                      }
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: colors[type] }}
                        aria-hidden
                      />
                      {typeLabels[type]}
                      <span className="font-mono text-[10px] text-stone-600">
                        {nodeTypeCounts[type]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="citem-label">Relationship types</p>
                <button
                  className="text-xs text-amber-300 hover:text-amber-200"
                  type="button"
                  onClick={() => setRelationships(relationshipOptions)}
                >
                  Show all
                </button>
              </div>
              {relationshipOptions.length ? (
                <div className="mt-2 flex flex-wrap gap-2" aria-label="Relationship filters">
                  {relationshipOptions.map((relationship) => {
                    const active = relationships.includes(relationship);
                    return (
                      <button
                        key={relationship}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleRelationship(relationship)}
                        className={
                          "rounded border px-2.5 py-1.5 font-mono text-[11px] transition " +
                          (active
                            ? "border-stone-700 bg-stone-900/60 text-stone-300"
                            : "border-stone-800 bg-black/10 text-stone-600")
                        }
                      >
                        {relationship}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-xs text-stone-600">No relationship types are available.</p>
              )}
            </div>
          </div>
        </details>

        {selectedNodes.length ? (
          <div className="mt-3 rounded border border-amber-900/30 bg-amber-950/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="citem-label">Relationship selection</p>
                <p className="mt-1 text-sm text-stone-300">
                  {selectedNodes.length === 1
                    ? "Select one more entity to create a manual relationship."
                    : "Two entities selected. Confirm direction and relationship semantics before saving."}
                </p>
              </div>
              <button
                className="text-xs text-stone-500 hover:text-stone-300"
                type="button"
                onClick={() => setSelected([])}
              >
                Clear selection
              </button>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
              <div className="rounded border border-stone-800 bg-black/15 p-3">
                <p className="citem-label">Source</p>
                <p className="mt-1 truncate text-sm font-medium text-stone-200">
                  {selectedNodes[0]?.label ?? "Not selected"}
                </p>
                <p className="mt-1 text-xs text-stone-600">
                  {selectedNodes[0] ? typeLabels[selectedNodes[0].type] : "—"}
                </p>
              </div>
              <button
                className="citem-button-ghost self-center"
                type="button"
                disabled={selectedNodes.length !== 2}
                onClick={swapSelection}
              >
                Swap
              </button>
              <div className="rounded border border-stone-800 bg-black/15 p-3">
                <p className="citem-label">Target</p>
                <p className="mt-1 truncate text-sm font-medium text-stone-200">
                  {selectedNodes[1]?.label ?? "Not selected"}
                </p>
                <p className="mt-1 text-xs text-stone-600">
                  {selectedNodes[1] ? typeLabels[selectedNodes[1].type] : "—"}
                </p>
              </div>
            </div>

            {selectedNodes.length === 2 ? (
              <div className="mt-3 grid gap-2 md:grid-cols-[220px_minmax(0,1fr)_auto]">
                <input
                  className="field font-mono"
                  aria-label="Relationship label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                />
                <input
                  className="field"
                  aria-label="Relationship description"
                  placeholder="Optional analyst description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
                <button className="citem-button" type="button" onClick={createLink}>
                  Create link
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {layoutWarning ? (
          <p className="mt-3 text-sm text-amber-300">{layoutWarning}</p>
        ) : null}
        {message ? (
          <p className="mt-3 text-sm text-stone-400">{message}</p>
        ) : null}
        {data.meta.truncated ? (
          <p className="mt-3 rounded border border-amber-900/30 bg-amber-950/5 p-3 text-sm text-amber-200">
            Large graph: showing up to {data.meta.nodeLimit} nodes and {data.meta.edgeLimit} links.
            Omitted {data.meta.omittedNodes} nodes and {data.meta.omittedEdges} links.
          </p>
        ) : null}
      </section>

      <div className="relative">
        <div className="relative h-[calc(100vh-11.5rem)] min-h-[760px] max-h-[1180px] overflow-hidden rounded-lg border border-stone-800/80 bg-[#090d0f]">
          <div
            className="pointer-events-none absolute inset-0 z-0 opacity-90"
            aria-hidden
            style={{
              backgroundImage: [
                "radial-gradient(ellipse at 18% 24%, rgba(185,130,47,.055), transparent 28%)",
                "radial-gradient(ellipse at 76% 68%, rgba(93,142,143,.045), transparent 24%)",
                "repeating-radial-gradient(ellipse at 18% 24%, transparent 0 58px, rgba(154,144,117,.045) 59px, transparent 62px)",
                "repeating-radial-gradient(ellipse at 76% 68%, transparent 0 72px, rgba(105,128,130,.035) 73px, transparent 76px)",
                "linear-gradient(rgba(255,255,255,.012) 1px, transparent 1px)",
                "linear-gradient(90deg, rgba(255,255,255,.012) 1px, transparent 1px)",
              ].join(", "),
              backgroundSize: "auto, auto, auto, auto, 48px 48px, 48px 48px",
            }}
          />
          <div className="pointer-events-none absolute left-3 top-3 z-10 rounded border border-stone-800/80 bg-[#0f1417]/90 px-3 py-2 backdrop-blur-sm">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-600">
              Visible
            </p>
            <p className="mt-1 text-sm text-stone-300">
              {filtered.nodes.length} entities · {filtered.edges.length} relationships
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-stone-600">
              contour depth = connection density
            </p>
          </div>
          <ReactFlow
            className="relative z-[1]"
            nodes={nodes}
            edges={edges}
            fitView
            minZoom={0.28}
            maxZoom={2}
            onMove={(_, viewport) => {
              const roundedZoom = Math.round(viewport.zoom * 20) / 20;
              setViewportZoom((current) =>
                current === roundedZoom ? current : roundedZoom,
              );
            }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={saveNodePosition}
            onNodeClick={(_, node) => {
              setEditing(null);
              setSelected((current) =>
                current.includes(node.id)
                  ? current.filter((id) => id !== node.id)
                  : current.length < 2
                    ? [...current, node.id]
                    : [current[1], node.id],
              );
            }}
            onEdgeClick={(_, edge) => {
              const graphEdge = data.edges.find((item) => item.id === edge.id);
              if (!graphEdge) return;
              setDrawer(null);
              if (graphEdge.sourceKind === "manual") {
                setEditing(graphEdge);
                setLabel(graphEdge.relationshipType);
                setDescription(graphEdge.description ?? "");
              } else {
                setEditing(null);
                setMessage("Semantic relationships are managed from their owning CTI workspace.");
                if (graphEdge.detailUrl) window.location.href = graphEdge.detailUrl;
              }
            }}
          >
            <Background color="#2b3134" gap={32} size={1} />
            <Controls />
            <MiniMap
              nodeColor={(node) =>
                colors[
                  (data.nodes.find((item) => item.id === node.id)?.type ??
                    "EVIDENCE") as GraphEntityType
                ]
              }
              maskColor="rgba(7,10,12,0.72)"
              style={{ background: "#101518", border: "1px solid #292524" }}
            />
          </ReactFlow>
        </div>

        <aside className="mt-4 min-h-[220px] rounded-lg border border-stone-800/80 bg-[#0f1417]/95 p-4 shadow-2xl backdrop-blur-md xl:absolute xl:right-4 xl:top-4 xl:z-20 xl:mt-0 xl:max-h-[calc(100%-2rem)] xl:w-[340px] xl:overflow-y-auto">
          {editing && editing.sourceKind === "manual" ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="citem-label">Manual relationship</p>
                  <h2 className="mt-1 text-lg font-semibold text-stone-100">
                    Edit relationship
                  </h2>
                </div>
                <button
                  className="text-xs text-stone-500 hover:text-stone-300"
                  type="button"
                  onClick={() => setEditing(null)}
                >
                  Close
                </button>
              </div>
              <p className="mt-3 font-mono text-xs text-amber-300">
                {editing.relationshipType}
              </p>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1">
                  <span className="citem-label">Relationship type</span>
                  <input
                    className="field font-mono"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="citem-label">Description</span>
                  <textarea
                    className="field min-h-24"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-800 pt-4">
                <button className="citem-button" type="button" onClick={() => updateEdge(false)}>
                  Save relationship
                </button>
                <button
                  className="citem-button-ghost text-red-300"
                  type="button"
                  onClick={() => updateEdge(true)}
                >
                  Delete
                </button>
              </div>
            </div>
          ) : drawer ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="citem-label">Entity inspector</p>
                  <h2 className="mt-1 break-words text-xl font-semibold text-stone-100">
                    {drawer.label}
                  </h2>
                </div>
                <button
                  className="text-xs text-stone-500 hover:text-stone-300"
                  type="button"
                  onClick={() => setDrawer(null)}
                >
                  Close
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: colors[drawer.type] }}
                  aria-hidden
                />
                <span className="font-mono text-xs uppercase tracking-[0.12em] text-stone-500">
                  {typeLabels[drawer.type]}
                </span>
              </div>
              {drawer.subtitle ? (
                <p className="mt-3 text-sm leading-6 text-stone-400">{drawer.subtitle}</p>
              ) : null}

              {Object.keys(drawer.metadata).length ? (
                <dl className="mt-4 grid gap-3 border-t border-stone-800 pt-4">
                  {Object.entries(drawer.metadata).map(([key, value]) => (
                    <div key={key}>
                      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-600">
                        {key.replaceAll("_", " ")}
                      </dt>
                      <dd className="mt-1 break-words text-sm text-stone-300">
                        {String(value ?? "—")}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-4 text-sm text-stone-600">No additional metadata is exposed for this node.</p>
              )}

              <Link
                className="mt-5 inline-flex text-sm font-medium text-amber-300 hover:text-amber-200"
                href={drawer.detailUrl}
              >
                Open entity workspace →
              </Link>
            </div>
          ) : (
            <div>
              <p className="citem-label">Graph inspector</p>
              <h2 className="mt-1 text-lg font-semibold text-stone-100">
                Explore relationships
              </h2>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                Click an entity label to inspect it. Select two nodes to create an analyst-defined relationship.
              </p>

              <div className="mt-5 grid gap-3 border-t border-stone-800 pt-4">
                <div>
                  <p className="citem-label">Semantic links</p>
                  <p className="mt-1 text-xs leading-5 text-stone-600">
                    Existing CITEM relationships. Open the owning workspace to change them.
                  </p>
                </div>
                <div>
                  <p className="citem-label">Manual links</p>
                  <p className="mt-1 text-xs leading-5 text-stone-600">
                    Amber animated links are explicit analyst-created graph relationships.
                  </p>
                </div>
                <div>
                  <p className="citem-label">Terrain depth</p>
                  <p className="mt-1 text-xs leading-5 text-stone-600">
                    Concentric contour halos grow around highly connected entities, giving dense graph regions a topographic reading.
                  </p>
                </div>
                <div>
                  <p className="citem-label">Layout</p>
                  <p className="mt-1 text-xs leading-5 text-stone-600">
                    Dragged entity positions are saved for this Investigation.
                  </p>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export function KnowledgeGraph({ projectId }: { projectId: string }) {
  const [showHistoricalInfrastructure, setShowHistoricalInfrastructure] = useState(false);
  const [data, setData] = useState<GraphResponse | null>(null);
  const [savedPositions, setSavedPositions] = useState(
    new Map<string, { x: number; y: number }>(),
  );
  const [error, setError] = useState("");
  const [layoutWarning, setLayoutWarning] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setLayoutWarning("");
    const [response, layoutResponse] = await Promise.all([
      fetch(
        "/api/projects/" +
          projectId +
          "/graph?historical=" +
          showHistoricalInfrastructure,
      ),
      fetch("/api/projects/" + projectId + "/graph/layout"),
    ]);
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => ({}));
      setError(graphError(payload, "Unable to load the knowledge graph."));
    } else {
      const graphData = (await response.json()) as GraphResponse;
      setData(graphData);
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
      } else {
        setLayoutWarning(
          "Saved graph layout could not be loaded; using automatic layout until positions can be fetched.",
        );
      }
    }
    setLoading(false);
  }, [projectId, showHistoricalInfrastructure]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => void load(), [load]);

  if (loading) {
    return (
      <div className="mt-5 rounded-lg border border-stone-800/80 bg-[#0f1417] p-6 text-sm text-stone-500">
        Loading knowledge graph…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-5 rounded-lg border border-red-950/60 bg-red-950/5 p-6 text-sm text-red-300">
        {error}
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="mt-5 space-y-4">
        <header className="rounded-lg border border-stone-800/80 bg-[#0f1417] p-4">
          <p className="citem-label">Analytical map</p>
          <h2 className="mt-1 text-xl font-semibold text-stone-100">Knowledge Graph</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-500">
            Explore Investigation entities and the relationships already recorded between them.
          </p>
        </header>
        <div className="rounded-lg border border-dashed border-stone-800 bg-[#0f1417] p-10 text-center text-sm text-stone-500">
          No graph entities yet. Add CTI records or Evidence first.
        </div>
      </div>
    );
  }

  const resetServerLayout = async () => {
    const response = await fetch("/api/projects/" + projectId + "/graph/layout", {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("Unable to reset graph layout.");
    setSavedPositions(new Map());
  };

  const updateSavedPosition = (
    id: string,
    position: { x: number; y: number },
  ) =>
    setSavedPositions((current) => upsertSavedPosition(current, id, position));

  const semanticEdges = data.edges.filter((edge) => edge.sourceKind === "semantic").length;
  const manualEdges = data.edges.filter((edge) => edge.sourceKind === "manual").length;

  return (
    <ReactFlowProvider>
      <div className="mt-5 space-y-4">
        <header className="rounded-lg border border-stone-800/80 bg-[#0f1417] p-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="citem-label">Analytical map</p>
              <h2 className="mt-1 text-xl font-semibold text-stone-100">Knowledge Graph</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-500">
                Explore Investigation entities, inspect context, and create explicit analyst-defined relationships without changing semantic CTI records.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-stone-800 bg-black/10 px-3 py-2 text-xs text-stone-500">
              <input
                type="checkbox"
                checked={showHistoricalInfrastructure}
                onChange={(event) => setShowHistoricalInfrastructure(event.target.checked)}
              />
              Historical infrastructure
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-stone-800/80 pt-3 text-xs text-stone-500">
            <span>{data.meta.nodeCount} entities</span>
            <span>{data.meta.edgeCount} relationships</span>
            <span>{semanticEdges} semantic</span>
            <span className="text-amber-300">{manualEdges} analyst-defined</span>
          </div>
        </header>

        <GraphCanvas
          data={data}
          projectId={projectId}
          savedPositions={savedPositions}
          onReload={load}
          onLayoutReset={resetServerLayout}
          onPositionSaved={updateSavedPosition}
          layoutWarning={layoutWarning}
        />
      </div>
    </ReactFlowProvider>
  );
}
