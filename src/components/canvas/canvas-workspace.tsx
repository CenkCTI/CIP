"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyNodeChanges, Background, BackgroundVariant, Controls, Handle, MarkerType, MiniMap,
  NodeResizer, Position, ReactFlow, ReactFlowProvider, useReactFlow,
  type Connection, type Edge, type Node, type NodeChange, type NodeProps,
} from "@xyflow/react";
import { useAutosave } from "@/components/document-workspace/use-autosave";
import {
  canvasRelationTypes, type CanvasEdge, type CanvasItem, type CanvasRelationType, type CanvasScene,
} from "@/lib/canvas/schema";
import { CanvasEntityNode, type CanvasEntityFlowNode } from "./canvas-entity-node";
import { CanvasFrameNode, type CanvasFrameFlowNode } from "./canvas-frame-node";
import { CanvasEntityPicker } from "./canvas-entity-picker";
import {
  canvasEntityKey, type CanvasEntityRef, type CanvasEntitySummary,
} from "@/lib/canvas/entity-registry";
import {
  alignSceneSelection, bringSceneSelectionForward, commitSceneHistory, createSceneHistory,
  groupSceneCards, linkSceneCards, moveSceneItems, redoSceneHistory, removeSceneSelection,
  undoSceneHistory, ungroupSceneFrame, updateSceneEdge, updateSceneItem,
  type Alignment,
} from "@/lib/canvas/scene-history";

type Geometry = { x: number; y: number; width: number; height: number };
type NoteData = {
  [key: string]: unknown;
  content: string;
  onCommit: (id: string, content: string) => void;
  onResize: (id: string, geometry: Geometry) => void;
};
type CanvasNoteFlowNode = Node<NoteData, "canvasNote">;
type CanvasNode = CanvasNoteFlowNode | CanvasEntityFlowNode | CanvasFrameFlowNode;

function CanvasNoteNode({ id, data, selected }: NodeProps<CanvasNoteFlowNode>) {
  const [draft, setDraft] = useState(data.content);
  const lastCommitted = useRef(data.content);
  useEffect(() => {
    if (data.content === lastCommitted.current) return;
    lastCommitted.current = data.content;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(data.content);
  }, [data.content]);
  useEffect(() => {
    if (draft === lastCommitted.current) return;
    const timer = window.setTimeout(() => {
      lastCommitted.current = draft;
      data.onCommit(id, draft);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, data.onCommit, id]);
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-md border border-amber-900/60 bg-[#1a1b19] shadow-lg"
      style={{ outline: selected ? "1px solid #d4a958" : undefined }}>
      <Handle id="in" type="target" position={Position.Left}
        className="!h-3 !w-3 !border-amber-200 !bg-[#5f7880]" />
      <Handle id="out" type="source" position={Position.Right}
        className="!h-3 !w-3 !border-amber-200 !bg-[#b9822f]" />
      <NodeResizer isVisible={selected} minWidth={180} minHeight={120}
        maxWidth={1200} maxHeight={900} onResizeEnd={(_, dimensions) => data.onResize(id, {
          x: dimensions.x, y: dimensions.y, width: dimensions.width, height: dimensions.height,
        })} />
      <div className="canvas-drag-handle flex cursor-grab items-center justify-between border-b border-stone-700/70 bg-[#24251f] px-3 py-2 text-[11px] uppercase tracking-wider text-amber-200">
        <span>Working note</span><span aria-hidden="true">⋮⋮</span>
      </div>
      <textarea aria-label="Canvas working note" spellCheck maxLength={8000}
        className="nodrag nopan nowheel h-full min-h-0 w-full resize-none bg-transparent p-3 text-sm leading-6 text-stone-200 outline-none"
        placeholder="Write a thought, question, or working note…"
        value={draft} onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== lastCommitted.current) {
            lastCommitted.current = draft;
            data.onCommit(id, draft);
          }
        }}
      />
    </div>
  );
}

const nodeTypes = {
  canvasNote: CanvasNoteNode, canvasEntity: CanvasEntityNode, canvasFrame: CanvasFrameNode,
};
const edgeLabel: Record<CanvasRelationType, string> = {
  RELATED_TO: "Related to",
  SUPPORTS: "Supports (analyst)",
  CONTRADICTS: "Contradicts (analyst)",
  DERIVED_FROM: "Derived from (analyst)",
  INVESTIGATE: "Needs investigation",
};
const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every((value) => b.has(value));

function EdgeDetails({ edge, onCommit }: {
  edge: CanvasEdge;
  onCommit: (id: string, patch: Partial<Pick<CanvasEdge, "relation_type" | "rationale">>) => void;
}) {
  return <div className="flex flex-wrap items-end gap-2 rounded border border-stone-700 bg-[#172026] px-3 py-2">
    <span className="text-xs text-amber-200">Analyst relationship</span>
    <label className="text-xs text-stone-400">Type
      <select className="ml-2 rounded border border-stone-700 bg-[#11171a] p-1.5 text-stone-200"
        value={edge.relation_type}
        onChange={(event) => onCommit(edge.id, { relation_type: event.target.value as CanvasRelationType })}>
        {canvasRelationTypes.map((value) =>
          <option key={value} value={value}>{edgeLabel[value]}</option>)}
      </select>
    </label>
    <label className="flex min-w-[220px] flex-1 items-center gap-2 text-xs text-stone-400">
      Rationale
      <input key={edge.id} defaultValue={edge.rationale} maxLength={500}
        aria-label="Canvas relationship rationale"
        className="min-w-0 flex-1 rounded border border-stone-700 bg-[#11171a] px-2 py-1.5 text-stone-200"
        placeholder="Your reasoning; not an evidence assertion"
        onBlur={(event) => onCommit(edge.id, { rationale: event.target.value })} />
    </label>
  </div>;
}

function Editor({
  projectId, canvasId, name, initialItems, initialEdges, initialRevision,
}: {
  projectId: string; canvasId: string; name: string;
  initialItems: CanvasItem[]; initialEdges: CanvasEdge[]; initialRevision: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingAttempt = useRef<{ base: number; serialized: string; requestId: string } | null>(null);
  const { screenToFlowPosition, getNodes, setViewport } = useReactFlow<CanvasNode>();
  const [history, setHistory] = useState(() =>
    createSceneHistory({ items: initialItems, edges: initialEdges }));
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(() => new Set());
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(() => new Set());
  const [interactionError, setInteractionError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [entityByKey, setEntityByKey] = useState<Record<string, CanvasEntitySummary>>({});
  const [missingKeys, setMissingKeys] = useState<string[]>([]);
  const [loadingKeys, setLoadingKeys] = useState<string[]>([]);
  const [resolverError, setResolverError] = useState("");
  const attempted = useRef(new Set<string>());
  const refs = useMemo<CanvasEntityRef[]>(() => history.present.items
    .filter((item) => item.kind === "ENTITY_REF")
    .map((item) => ({ recordType: item.record_type, recordId: item.record_id })),
    [history.present.items]);
  const refSignature = refs.map(canvasEntityKey).join("|");

  useEffect(() => {
    const outstanding = refs.filter((ref) =>
      !attempted.current.has(canvasEntityKey(ref)) && !entityByKey[canvasEntityKey(ref)]);
    const batch = [...new Map(outstanding.map((ref) => [canvasEntityKey(ref), ref])).values()];
    if (!batch.length) return;
    batch.forEach((ref) => attempted.current.add(canvasEntityKey(ref)));
    const keys = batch.map(canvasEntityKey);
    const resolve = async () => {
      setLoadingKeys((current) => [...new Set([...current, ...keys])]);
      setResolverError("");
      try {
        const found: CanvasEntitySummary[] = [];
        const missing: CanvasEntityRef[] = [];
        for (let offset = 0; offset < batch.length; offset += 50) {
          const response = await fetch(`/api/projects/${projectId}/canvases/entities`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            cache: "no-store", body: JSON.stringify({ refs: batch.slice(offset, offset + 50) }),
          });
          if (!response.ok) throw new Error("Could not resolve linked Investigation records.");
          const payload = await response.json() as {
            items: CanvasEntitySummary[]; missing: CanvasEntityRef[];
          };
          found.push(...payload.items);
          missing.push(...payload.missing);
        }
        setEntityByKey((current) => ({
          ...current, ...Object.fromEntries(found.map((entity) => [canvasEntityKey(entity), entity])),
        }));
        const unavailable = new Set(missing.map(canvasEntityKey));
        setMissingKeys((current) => [
          ...new Set([...current.filter((key) => !keys.includes(key)), ...unavailable]),
        ]);
      } catch (error) {
        setResolverError(error instanceof Error ? error.message : "Record lookup failed.");
      } finally {
        setLoadingKeys((current) => current.filter((key) => !keys.includes(key)));
      }
    };
    void resolve();
    // The reference list is tied to the persistent scene, not transient node selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refSignature, projectId, entityByKey]);

  const refreshEntities = useCallback(() => {
    attempted.current.clear(); setEntityByKey({}); setMissingKeys([]); setResolverError("");
  }, []);
  const commitItem = useCallback((id: string, patch: Parameters<typeof updateSceneItem>[2]) => {
    setHistory((current) => commitSceneHistory(current, updateSceneItem(current.present, id, patch)));
  }, []);
  const commitNote = useCallback((id: string, content: string) => commitItem(id, { content }), [commitItem]);
  const commitResize = useCallback((id: string, geometry: Geometry) =>
    commitItem(id, geometry), [commitItem]);

  const makeNodes = useCallback((items: CanvasItem[]): CanvasNode[] => {
    // React Flow requires parents before children and parent-relative coordinates.
    const ordered = [
      ...items.filter((item) => item.kind === "FRAME"),
      ...items.filter((item) => item.kind !== "FRAME"),
    ];
    return ordered.map((item): CanvasNode => {
      const common = {
        id: item.id,
        position: { x: item.x, y: item.y },
        style: { width: item.width, height: item.height },
        dragHandle: ".canvas-drag-handle", zIndex: item.z_index,
        selected: selectedNodeIds.has(item.id),
        parentId: item.kind !== "FRAME" ? item.group_id ?? undefined : undefined,
      };
      if (item.kind === "FRAME") {
        return { ...common, type: "canvasFrame", connectable: false,
          data: {
            title: item.content,
            count: items.filter((child) => child.kind !== "FRAME" && child.group_id === item.id).length,
            onResize: commitResize,
          },
        };
      }
      if (item.kind === "ENTITY_REF") {
        const key = canvasEntityKey({ recordType: item.record_type, recordId: item.record_id });
        return { ...common, type: "canvasEntity", data: {
          recordType: item.record_type, recordId: item.record_id,
          entity: entityByKey[key] ?? null,
          loading: loadingKeys.includes(key) || (!entityByKey[key] && !missingKeys.includes(key) && !resolverError),
          onResize: commitResize,
        }};
      }
      return {
        ...common, type: "canvasNote",
        data: { content: item.content, onCommit: commitNote, onResize: commitResize },
      };
    });
  }, [commitNote, commitResize, selectedNodeIds, entityByKey, loadingKeys, missingKeys, resolverError]);

  const [nodes, setNodes] = useState<CanvasNode[]>(() => makeNodes(initialItems));
  useEffect(() => {
    // Persistent changes become history at drag-stop / resize-stop / blur only.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNodes(makeNodes(history.present.items));
  }, [history.present.items, makeNodes]);

  const flowEdges = useMemo<Edge[]>(() => history.present.edges.map((edge) => ({
    id: edge.id,
    source: edge.source_id,
    target: edge.target_id,
    sourceHandle: "out",
    targetHandle: "in",
    type: "smoothstep",
    label: edgeLabel[edge.relation_type],
    labelStyle: { fill: "#e5c991", fontSize: 11 },
    labelBgStyle: { fill: "#172026", fillOpacity: 0.96 },
    labelBgPadding: [6, 3] as [number, number],
    style: { stroke: edge.relation_type === "CONTRADICTS" ? "#b37e67" : "#a68b60",
      strokeWidth: 1.75,
      strokeDasharray: edge.relation_type === "INVESTIGATE" ? "5 5" : undefined },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#a68b60" },
    selected: selectedEdgeIds.has(edge.id),
  })), [history.present.edges, selectedEdgeIds]);

  const save = useCallback(async (scene: CanvasScene, baseRevision: number) => {
    const serialized = JSON.stringify(scene);
    if (!pendingAttempt.current || pendingAttempt.current.base !== baseRevision ||
        pendingAttempt.current.serialized !== serialized) {
      pendingAttempt.current = { base: baseRevision, serialized, requestId: crypto.randomUUID() };
    }
    const requestId = pendingAttempt.current.requestId;
    const response = await fetch(`/api/projects/${projectId}/canvases/${canvasId}/mutations`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...scene, baseRevision, requestId }),
    });
    const payload = await response.json().catch(() => ({})) as { revision?: number; error?: string };
    if (!response.ok || typeof payload.revision !== "number") {
      throw new Error(payload.error === "EDIT_CONFLICT" ? "EDIT_CONFLICT" :
        payload.error || "Canvas scene save failed.");
    }
    if (pendingAttempt.current?.requestId === requestId) pendingAttempt.current = null;
    return { revision: payload.revision };
  }, [projectId, canvasId]);

  const autosave = useAutosave({
    snapshot: history.present, initialRevision, save, debounceMs: 700,
  });

  const center = useCallback((width: number, height: number) => {
    const bounds = rootRef.current?.getBoundingClientRect();
    const point = bounds
      ? screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 })
      : { x: 0, y: 0 };
    return { x: Math.round(point.x - width / 2), y: Math.round(point.y - height / 2) };
  }, [screenToFlowPosition]);

  const addNote = useCallback(() => {
    if (history.present.items.length >= 500) {
      setInteractionError("This Canvas has reached the 500-item limit."); return;
    }
    const next: CanvasItem = { id: crypto.randomUUID(), kind: "NOTE", content: "",
      ...center(300, 190), width: 300, height: 190, z_index: history.present.items.length };
    setHistory((h) => commitSceneHistory(h, {
      ...h.present, items: [...h.present.items, next],
    }));
    setSelectedNodeIds(new Set([next.id])); setSelectedEdgeIds(new Set());
    setInteractionError("");
  }, [history.present.items.length, center]);

  const addEntity = useCallback((entity: CanvasEntitySummary) => {
    if (history.present.items.length >= 500) {
      setInteractionError("This Canvas has reached the 500-item limit.");
      setPickerOpen(false); return;
    }
    const next: CanvasItem = {
      id: crypto.randomUUID(), kind: "ENTITY_REF", content: "",
      record_type: entity.recordType, record_id: entity.recordId,
      ...center(340, 220), width: 340, height: 220,
      z_index: history.present.items.length,
    };
    const key = canvasEntityKey(entity);
    attempted.current.add(key);
    setEntityByKey((current) => ({ ...current, [key]: entity }));
    setMissingKeys((current) => current.filter((entry) => entry !== key));
    setHistory((h) => commitSceneHistory(h, {
      ...h.present, items: [...h.present.items, next],
    }));
    setSelectedNodeIds(new Set([next.id])); setSelectedEdgeIds(new Set());
    setPickerOpen(false); setInteractionError("");
  }, [history.present.items.length, center]);

  const addFrame = useCallback(() => {
    const id = crypto.randomUUID();
    setHistory((h) => {
      const next = groupSceneCards(h.present, selectedNodeIds, id);
      if (next === h.present) return h;
      return commitSceneHistory(h, next);
    });
    setSelectedNodeIds(new Set([id])); setSelectedEdgeIds(new Set());
  }, [selectedNodeIds]);

  const ungroup = useCallback(() => {
    const frame = history.present.items.find((item) =>
      selectedNodeIds.has(item.id) && item.kind === "FRAME");
    if (!frame) return;
    setHistory((h) => commitSceneHistory(h, ungroupSceneFrame(h.present, frame.id)));
    setSelectedNodeIds(new Set()); setSelectedEdgeIds(new Set());
  }, [history.present.items, selectedNodeIds]);

  const removeSelected = useCallback(() => {
    if (!selectedNodeIds.size && !selectedEdgeIds.size) return;
    setHistory((h) => commitSceneHistory(h,
      removeSceneSelection(h.present, selectedNodeIds, selectedEdgeIds)));
    setSelectedNodeIds(new Set()); setSelectedEdgeIds(new Set());
  }, [selectedNodeIds, selectedEdgeIds]);

  const undo = useCallback(() => {
    setHistory(undoSceneHistory); setSelectedNodeIds(new Set()); setSelectedEdgeIds(new Set());
  }, []);
  const redo = useCallback(() => {
    setHistory(redoSceneHistory); setSelectedNodeIds(new Set()); setSelectedEdgeIds(new Set());
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("textarea,input,select,[contenteditable='true']")) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault(); if (event.shiftKey) redo(); else undo();
      } else if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault(); redo();
      } else if ((event.key === "Delete" || event.key === "Backspace") &&
                 (selectedNodeIds.size || selectedEdgeIds.size)) {
        event.preventDefault(); removeSelected();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, removeSelected, selectedNodeIds, selectedEdgeIds]);

  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    setNodes((current) => applyNodeChanges(changes.filter((change) => change.type !== "remove"), current));
  }, []);
  const onSelectionChange = useCallback(({ nodes: picked, edges: pickedEdges }: {
    nodes: Node[]; edges: Edge[];
  }) => {
    const nodeIds = new Set(picked.map((node) => node.id));
    const edgeIds = new Set(pickedEdges.map((edge) => edge.id));
    setSelectedNodeIds((current) => sameSet(current, nodeIds) ? current : nodeIds);
    setSelectedEdgeIds((current) => sameSet(current, edgeIds) ? current : edgeIds);
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const id = crypto.randomUUID();
    setHistory((h) => commitSceneHistory(h,
      linkSceneCards(h.present, id, connection.source, connection.target)));
  }, []);

  const handleDragStop = useCallback(() => {
    const positions = new Map(getNodes().map((node) => [
      node.id, { x: node.position.x, y: node.position.y },
    ]));
    setHistory((h) => commitSceneHistory(h, moveSceneItems(h.present, positions)));
  }, [getNodes]);

  const selectedEdge = history.present.edges.find((edge) => selectedEdgeIds.has(edge.id));
  const selectedFrame = history.present.items.find((item) =>
    item.kind === "FRAME" && selectedNodeIds.has(item.id));
  const groupingCandidates = history.present.items.filter((item) =>
    selectedNodeIds.has(item.id) && item.kind !== "FRAME" && !item.group_id);
  const statusLabel = autosave.status === "saved" ? "Saved" :
    autosave.status === "dirty" ? "Unsaved changes" :
    autosave.status === "saving" ? "Saving…" :
    autosave.status === "conflict" ? "Edit conflict — changes remain in this tab" :
    "Save failed — changes remain in this tab";

  const align = (direction: Alignment) => {
    setHistory((h) => commitSceneHistory(h,
      alignSceneSelection(h.present, selectedNodeIds, direction)));
  };

  return <div className="space-y-2">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded border border-stone-800 bg-[#11171a] p-3">
      <div>
        <p className="citem-label">Analysis Canvas · CANVAS-3</p>
        <h1 className="text-lg font-semibold text-stone-100">{name}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="citem-button" onClick={addNote}>+ Working note</button>
        <button type="button" className="citem-button" onClick={() => setPickerOpen(true)}>
          + Investigation record
        </button>
        <button type="button" className="citem-button-ghost"
          disabled={!refs.length} onClick={refreshEntities}>Refresh linked records</button>
        <button type="button" className="citem-button-ghost"
          disabled={groupingCandidates.length < 2 || history.present.items.length >= 500}
          onClick={addFrame}>Group selected</button>
        <button type="button" className="citem-button-ghost"
          disabled={!selectedFrame} onClick={ungroup}>Ungroup</button>
        <button type="button" className="citem-button-ghost" disabled={!history.past.length}
          onClick={undo} aria-label="Undo">Undo</button>
        <button type="button" className="citem-button-ghost" disabled={!history.future.length}
          onClick={redo} aria-label="Redo">Redo</button>
        <button type="button" className="citem-button-ghost text-red-300"
          disabled={!selectedNodeIds.size && !selectedEdgeIds.size}
          onClick={removeSelected}>Remove selection</button>
        <button type="button" className="citem-button-ghost"
          disabled={autosave.status === "saving" || autosave.status === "saved" || autosave.status === "conflict"}
          onClick={() => { void (autosave.status === "error" ? autosave.retry() : autosave.flush()); }}>
          Save / Retry
        </button>
      </div>
    </header>
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-stone-400">
      <span>
        {history.present.items.filter((item) => item.kind === "NOTE").length} notes ·{" "}
        {refs.length} entity references ·{" "}
        {history.present.items.filter((item) => item.kind === "FRAME").length} frames ·{" "}
        {history.present.edges.length} analyst links · {statusLabel}
      </span>
      <span>Drag from right handle to left handle to link · Shift/drag to select · Middle-drag to pan</span>
    </div>
    {selectedNodeIds.size > 1 && <div className="flex flex-wrap items-center gap-2 rounded border border-stone-800 bg-[#12191c] p-2 text-xs text-stone-300">
      <span>{selectedNodeIds.size} selected</span>
      <label>Align
        <select className="ml-2 rounded bg-stone-800 p-1.5 text-stone-200"
          defaultValue="" aria-label="Align selected cards"
          onChange={(event) => {
            if (event.target.value) align(event.target.value as Alignment);
            event.target.value = "";
          }}>
          <option value="">Choose alignment</option>
          <option value="left">Left</option><option value="right">Right</option>
          <option value="top">Top</option><option value="bottom">Bottom</option>
          <option value="center-x">Horizontal centers</option>
          <option value="center-y">Vertical centers</option>
        </select>
      </label>
      <button type="button" className="citem-button-ghost" onClick={() => setHistory((h) =>
        commitSceneHistory(h, bringSceneSelectionForward(h.present, selectedNodeIds, true)))}>
        Bring forward
      </button>
      <button type="button" className="citem-button-ghost" onClick={() => setHistory((h) =>
        commitSceneHistory(h, bringSceneSelectionForward(h.present, selectedNodeIds, false)))}>
        Send backward
      </button>
    </div>}
    {selectedFrame && selectedFrame.kind === "FRAME" && <label className="flex items-center gap-2 text-xs text-amber-200">
      Frame title
      <input key={selectedFrame.id} defaultValue={selectedFrame.content} maxLength={120}
        aria-label="Rename selected frame"
        className="min-w-52 rounded border border-stone-700 bg-[#11171a] px-3 py-2 text-stone-200"
        onBlur={(event) => {
          const name = event.target.value.trim();
          if (name) commitItem(selectedFrame.id, { content: name });
        }} />
    </label>}
    {selectedEdge && <EdgeDetails key={selectedEdge.id} edge={selectedEdge}
      onCommit={(id, patch) => setHistory((h) =>
        commitSceneHistory(h, updateSceneEdge(h.present, id, patch)))} />}
    {(interactionError || autosave.error || resolverError) && <p role="alert"
      className="rounded border border-red-900/70 px-3 py-2 text-sm text-red-300">
      {interactionError || autosave.error || resolverError}
      {autosave.status === "conflict" ? " Do not reload until you have copied unsaved notes." : ""}
    </p>}
    <div ref={rootRef} className="relative h-[min(72vh,760px)] min-h-[440px] overflow-hidden rounded border border-stone-700 bg-[#0d1215]">
      {history.present.items.length === 0 && <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center text-center text-sm text-stone-500">
        <div><p className="text-lg text-stone-300">Your canvas is empty</p>
          <p className="mt-2">Add a working note or an Investigation record. No evidence is fabricated.</p>
        </div>
      </div>}
      <ReactFlow<CanvasNode, Edge>
        nodes={nodes} edges={flowEdges} nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onSelectionChange={onSelectionChange}
        onNodeDragStop={handleDragStop}
        onConnect={onConnect}
        onPaneClick={() => { setSelectedNodeIds(new Set()); setSelectedEdgeIds(new Set()); }}
        onEdgesChange={() => { /* Deletions only happen through revisioned scene history. */ }}
        nodesConnectable
        deleteKeyCode={null}
        selectionOnDrag panOnDrag={[1, 2]} multiSelectionKeyCode="Shift"
        minZoom={0.15} maxZoom={2.5} fitView={initialItems.length > 0}
        colorMode="dark" proOptions={{ hideAttribution: false }}>
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#303b3e" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable maskColor="rgba(5,9,11,0.65)" />
      </ReactFlow>
    </div>
    <button type="button" className="citem-button-ghost"
      onClick={() => { void setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 250 }); }}>
      Reset view
    </button>
    <p className="text-[11px] text-stone-500">
      Links and frames express an analyst&apos;s working arrangement, not verified CTI evidence.
      They do not alter the Investigation Knowledge Graph.
    </p>
    {pickerOpen && <CanvasEntityPicker projectId={projectId}
      onAdd={addEntity} onClose={() => setPickerOpen(false)} />}
  </div>;
}

export function CanvasWorkspace(props: {
  projectId: string; canvasId: string; name: string;
  initialItems: CanvasItem[]; initialEdges: CanvasEdge[]; initialRevision: number;
}) {
  return <ReactFlowProvider><Editor {...props} /></ReactFlowProvider>;
}
