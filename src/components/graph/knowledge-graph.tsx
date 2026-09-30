"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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

function compactGraphLabel(value: string, max = 34) {
  if (value.length <= max) return value;
  const denseToken = !value.includes(" ") && value.length > max;
  if (denseToken) return value.slice(0, Math.ceil(max * 0.58)) + "…" + value.slice(-Math.floor(max * 0.28));
  return value.slice(0, max - 1).trimEnd() + "…";
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
  showHistoricalInfrastructure,
  onHistoricalInfrastructureChange,
}: {
  data: GraphResponse;
  projectId: string;
  savedPositions: Map<string, { x: number; y: number }>;
  onReload: () => Promise<void>;
  onLayoutReset: () => Promise<void>;
  onPositionSaved: (id: string, position: { x: number; y: number }) => void;
  layoutWarning: string;
  showHistoricalInfrastructure: boolean;
  onHistoricalInfrastructureChange: (checked: boolean) => void;
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
  const [message, setMessage] = useState("");
  const [label, setLabel] = useState("related_to");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<GraphEdge | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewportZoom, setViewportZoom] = useState(1);
  const terrainFarRef = useRef<HTMLDivElement | null>(null);
  const terrainMidRef = useRef<HTMLDivElement | null>(null);

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
        const overviewMode = viewportZoom < 0.68;
        const overviewScale = overviewMode
          ? Math.min(2.45, Math.max(1.15, 0.72 / Math.max(viewportZoom, 0.28)))
          : 1;
        const displayLabel = compactGraphLabel(
          node.label,
          overviewMode ? 28 : 42,
        );

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
              <Link
                href={node.detailUrl}
                title={node.label}
                onClick={(event) => event.stopPropagation()}
                className={
                  overviewMode
                    ? "inline-flex max-w-[190px] items-center gap-2 whitespace-nowrap rounded-sm bg-[#091012]/80 px-2 py-1 text-left shadow-[0_3px_12px_rgba(0,0,0,.38)] backdrop-blur-[2px]"
                    : "grid w-full min-w-0 gap-2 overflow-hidden text-left"
                }
                style={{
                  transform: overviewMode
                    ? `scale(${overviewScale})`
                    : undefined,
                  transformOrigin: "center center",
                }}
              >
                {overviewMode ? (
                  <>
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: colors[node.type] }}
                      aria-hidden
                    />
                    <span className="min-w-0 truncate text-[12px] font-semibold text-stone-100 [text-shadow:0_1px_3px_#000]">
                      {displayLabel}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex min-w-0 items-center justify-between gap-2">
                      <span
                        className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
                        style={{ color: colors[node.type] }}
                      >
                        {typeCodes[node.type]}
                      </span>
                      {isSelected ? (
                        <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-amber-300">
                          selected
                        </span>
                      ) : null}
                    </span>
                    <span className="block min-w-0 truncate text-sm font-semibold text-stone-100">
                      {displayLabel}
                    </span>
                    {node.subtitle ? (
                      <span className="block min-w-0 truncate text-[11px] leading-4 text-stone-500">
                        {node.subtitle}
                      </span>
                    ) : null}
                  </>
                )}
              </Link>
            ),
          },
          style: overviewMode
            ? {
                border: "0",
                borderRadius: 999,
                background: "transparent",
                boxShadow: terrainShadow(degree, maxDegree, isSelected),
                color: "#e7e5e4",
                width: 190,
                padding: 0,
                overflow: "visible",
                zIndex: isSelected ? 60 : 10 + Math.min(degree, 30),
              }
            : {
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
                width: 230,
                padding: 12,
                overflow: "hidden",
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

  function moveTerrain(viewport: { x: number; y: number; zoom: number }) {
    const zoom = Math.max(0.28, viewport.zoom);
    const farScale = Math.pow(zoom, 0.24);
    const midScale = Math.pow(zoom, 0.46);
    if (terrainFarRef.current) {
      terrainFarRef.current.style.transform =
        `translate3d(${viewport.x * 0.07}px, ${viewport.y * 0.07}px, 0) scale(${farScale})`;
    }
    if (terrainMidRef.current) {
      terrainMidRef.current.style.transform =
        `translate3d(${viewport.x * 0.16}px, ${viewport.y * 0.16}px, 0) scale(${midScale})`;
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
    <div className="relative">
      <div
        className="relative h-[calc(100dvh-6.15rem)] min-h-[690px] overflow-hidden rounded-[0.46rem] border border-[#4e4635]/60 bg-[#070c0e] shadow-[0_18px_45px_rgba(0,0,0,.22),inset_0_0_0_1px_rgba(201,150,62,.025)]"
        style={{
          backgroundImage: [
            "radial-gradient(ellipse at 18% 42%, rgba(201,150,62,.055), transparent 34%)",
            "radial-gradient(ellipse at 80% 57%, rgba(77,138,118,.045), transparent 31%)",
            "linear-gradient(180deg, #091012 0%, #071012 54%, #060b0d 100%)",
          ].join(", "),
        }}
      >
        <div
          ref={terrainFarRef}
          className="pointer-events-none absolute -inset-[72%] z-0 will-change-transform"
          aria-hidden
          style={{
            transformOrigin: "center center",
            backgroundImage: [
              "radial-gradient(ellipse at 22% 48%, rgba(201,150,62,.11), transparent 31%)",
              "radial-gradient(ellipse at 78% 55%, rgba(77,138,118,.095), transparent 29%)",
              "radial-gradient(ellipse at 54% 8%, rgba(113,104,78,.04), transparent 24%)",
              "linear-gradient(145deg, #0a1113 0%, #071012 47%, #060b0d 100%)",
            ].join(", "),
          }}
        />
        <div
          ref={terrainMidRef}
          className="pointer-events-none absolute -inset-[78%] z-[1] opacity-[0.94] will-change-transform"
          aria-hidden
          style={{
            transformOrigin: "center center",
            backgroundImage: 'url("/graph/topographic-terrain.svg")',
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
            backgroundSize: "100% 100%",
          }}
        />
        <div
          className="pointer-events-none absolute inset-px z-[2] rounded-[0.4rem] border border-white/[0.015]"
          aria-hidden
        />

        <div className="pointer-events-none absolute left-4 top-4 z-30 rounded border border-stone-800/70 bg-[#0c1214]/82 px-3 py-2 shadow-lg backdrop-blur-md">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-300/80">
            Graph
          </p>
          <p className="mt-1 text-sm text-stone-300">
            {filtered.nodes.length} entities · {filtered.edges.length} relationships
          </p>
        </div>

        <div className="absolute right-4 top-4 z-30 flex flex-wrap justify-end gap-2">
          <button className="citem-button-ghost bg-[#0c1214]/88 backdrop-blur-md" type="button" onClick={fitGraph}>
            Fit
          </button>
          <button className="citem-button-ghost bg-[#0c1214]/88 backdrop-blur-md" type="button" onClick={resetLayout}>
            Reset
          </button>
          <button
            className="citem-button-ghost bg-[#0c1214]/88 backdrop-blur-md"
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((current) => !current)}
          >
            Filters
            {(query || types.length !== graphEntityTypes.length || relationships.length !== relationshipOptions.length || showHistoricalInfrastructure) ? (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" aria-label="Filters active" />
            ) : null}
          </button>
        </div>

        {filtersOpen ? (
          <section className="absolute right-4 top-[4.5rem] z-40 w-[min(390px,calc(100%-2rem))] rounded-lg border border-stone-800/80 bg-[#0c1214]/96 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="citem-label">Map controls</p>
                <h2 className="mt-1 text-base font-semibold text-stone-100">Filters</h2>
              </div>
              <button
                className="text-xs text-stone-500 hover:text-stone-200"
                type="button"
                onClick={() => setFiltersOpen(false)}
              >
                Close
              </button>
            </div>

            <input
              className="field mt-4 w-full"
              aria-label="Search graph"
              placeholder="Search entities…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />

            <div className="mt-4 border-t border-stone-800 pt-4">
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

            <div className="mt-4 border-t border-stone-800 pt-4">
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
                <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto" aria-label="Relationship filters">
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

            <label className="mt-4 flex cursor-pointer items-start gap-3 border-t border-stone-800 pt-4 text-xs text-stone-400">
              <input
                className="mt-0.5"
                type="checkbox"
                checked={showHistoricalInfrastructure}
                onChange={(event) => onHistoricalInfrastructureChange(event.target.checked)}
              />
              <span>
                <span className="block font-medium text-stone-300">Historical infrastructure</span>
                <span className="mt-1 block leading-5 text-stone-600">
                  Include rejected and removed infrastructure memberships.
                </span>
              </span>
            </label>
          </section>
        ) : null}

        {selectedNodes.length ? (
          <section className="absolute bottom-5 left-1/2 z-40 w-[min(860px,calc(100%-2rem))] -translate-x-1/2 rounded-lg border border-amber-900/35 bg-[#0c1214]/96 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="citem-label">Relationship selection</p>
                <p className="mt-1 text-sm text-stone-300">
                  {selectedNodes.length === 1
                    ? "Select one more entity to create a manual relationship."
                    : "Confirm source, target and relationship semantics before saving."}
                </p>
              </div>
              <button className="text-xs text-stone-500 hover:text-stone-200" type="button" onClick={() => setSelected([])}>
                Clear
              </button>
            </div>
            {selectedNodes.length === 2 ? (
              <>
                <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                  <div className="min-w-0 rounded border border-stone-800 bg-black/15 p-3">
                    <p className="citem-label">Source</p>
                    <p className="mt-1 truncate text-sm text-stone-200">{selectedNodes[0].label}</p>
                  </div>
                  <button className="citem-button-ghost self-center" type="button" onClick={swapSelection}>Swap</button>
                  <div className="min-w-0 rounded border border-stone-800 bg-black/15 p-3">
                    <p className="citem-label">Target</p>
                    <p className="mt-1 truncate text-sm text-stone-200">{selectedNodes[1].label}</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-[210px_minmax(0,1fr)_auto]">
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
                  <button className="citem-button" type="button" onClick={createLink}>Create link</button>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {editing && editing.sourceKind === "manual" ? (
          <section className="absolute bottom-5 right-4 z-40 w-[min(390px,calc(100%-2rem))] rounded-lg border border-amber-900/35 bg-[#0c1214]/96 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="citem-label">Manual relationship</p>
                <h2 className="mt-1 text-base font-semibold text-stone-100">Edit link</h2>
              </div>
              <button className="text-xs text-stone-500 hover:text-stone-200" type="button" onClick={() => setEditing(null)}>Close</button>
            </div>
            <div className="mt-3 grid gap-2">
              <input className="field font-mono" value={label} onChange={(event) => setLabel(event.target.value)} />
              <textarea className="field min-h-20" value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
            <div className="mt-3 flex gap-2">
              <button className="citem-button" type="button" onClick={() => updateEdge(false)}>Save</button>
              <button className="citem-button-ghost text-red-300" type="button" onClick={() => updateEdge(true)}>Delete</button>
            </div>
          </section>
        ) : null}

        {(layoutWarning || message || data.meta.truncated) ? (
          <div className="pointer-events-none absolute bottom-5 left-4 z-30 max-w-[min(520px,calc(100%-2rem))] space-y-2">
            {layoutWarning ? <p className="rounded border border-amber-900/30 bg-[#0c1214]/90 px-3 py-2 text-xs text-amber-300 backdrop-blur-md">{layoutWarning}</p> : null}
            {message ? <p className="rounded border border-stone-800/70 bg-[#0c1214]/90 px-3 py-2 text-xs text-stone-400 backdrop-blur-md">{message}</p> : null}
            {data.meta.truncated ? (
              <p className="rounded border border-amber-900/30 bg-[#0c1214]/90 px-3 py-2 text-xs text-amber-200 backdrop-blur-md">
                Large graph: omitted {data.meta.omittedNodes} nodes and {data.meta.omittedEdges} links.
              </p>
            ) : null}
          </div>
        ) : null}

        <ReactFlow
          className="absolute inset-0 z-10"
          nodes={nodes}
          edges={edges}
          fitView
          minZoom={0.28}
          maxZoom={2}
          onMove={(_, viewport) => {
            moveTerrain(viewport);
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
            if (graphEdge.sourceKind === "manual") {
              setSelected([]);
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
          <Controls position="bottom-left" />
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            nodeColor={(node) =>
              colors[
                (data.nodes.find((item) => item.id === node.id)?.type ??
                  "EVIDENCE") as GraphEntityType
              ]
            }
            maskColor="rgba(6,10,11,0.70)"
            style={{
              background: "rgba(10,16,18,.88)",
              border: "1px solid rgba(87,83,78,.72)",
            }}
          />
        </ReactFlow>
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

  return (
    <ReactFlowProvider>
      <GraphCanvas
        data={data}
        projectId={projectId}
        savedPositions={savedPositions}
        onReload={load}
        onLayoutReset={resetServerLayout}
        onPositionSaved={updateSavedPosition}
        layoutWarning={layoutWarning}
        showHistoricalInfrastructure={showHistoricalInfrastructure}
        onHistoricalInfrastructureChange={setShowHistoricalInfrastructure}
      />
    </ReactFlowProvider>
  );
}
