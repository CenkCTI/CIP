"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyNodeChanges, Background, BackgroundVariant, Controls, MiniMap,
  NodeResizer, ReactFlow, ReactFlowProvider, useReactFlow,
  type Node, type NodeProps, type NodeChange,
} from "@xyflow/react";
import { useAutosave } from "@/components/document-workspace/use-autosave";
import type { CanvasItem } from "@/lib/canvas/schema";
import {
  commitCanvasHistory, createCanvasHistory, redoCanvasHistory,
  undoCanvasHistory, updateCanvasItem,
} from "@/lib/canvas/history";

type NoteData = {
  [key: string]: unknown;
  content: string;
  onCommit: (id: string, content: string) => void;
  onResize: (id: string, geometry: { x: number; y: number; width: number; height: number }) => void;
};
type CanvasNode = Node<NoteData, "canvasNote">;

function CanvasNoteNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const [draft, setDraft] = useState(data.content);
  useEffect(() => {
    // Sync an external undo/redo, but do not change canonical note content during typing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(data.content);
  }, [data.content]);
  useEffect(() => {
    // Commit after a short typing pause even if focus stays in the note.
    // Blur flushes immediately; undo history groups a typing burst.
    if (draft === data.content) return;
    const timer = window.setTimeout(() => data.onCommit(id, draft), 450);
    return () => window.clearTimeout(timer);
  }, [draft, data.content, data.onCommit, id]);
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-md border border-amber-900/60 bg-[#1a1b19] shadow-lg"
      style={{ outline: selected ? "1px solid #d4a958" : undefined }}>
      <NodeResizer isVisible={selected} minWidth={180} minHeight={120} maxWidth={1200} maxHeight={900}
        onResizeEnd={(_, dimensions) => data.onResize(id, {
          x: dimensions.x, y: dimensions.y,
          width: dimensions.width, height: dimensions.height,
        })} />
      <div className="canvas-drag-handle flex cursor-grab items-center justify-between border-b border-stone-700/70 bg-[#24251f] px-3 py-2 text-[11px] uppercase tracking-wider text-amber-200">
        <span>Working note</span><span aria-hidden="true">⋮⋮</span>
      </div>
      <textarea
        aria-label="Canvas working note"
        spellCheck
        maxLength={8000}
        className="nodrag nopan nowheel h-full min-h-0 w-full resize-none bg-transparent p-3 text-sm leading-6 text-stone-200 outline-none"
        placeholder="Write a thought, question, or working note…"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => { if (draft !== data.content) data.onCommit(id, draft); }}
      />
    </div>
  );
}

const nodeTypes = { canvasNote: CanvasNoteNode };

function Editor({
  projectId, canvasId, name, initialItems, initialRevision,
}: {
  projectId: string; canvasId: string; name: string;
  initialItems: CanvasItem[]; initialRevision: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingAttempt = useRef<{ base: number; serialized: string; requestId: string } | null>(null);
  const { screenToFlowPosition } = useReactFlow<CanvasNode>();
  const [history, setHistory] = useState(() => createCanvasHistory(initialItems));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [interactionError, setInteractionError] = useState("");

  const commitNote = useCallback((id: string, content: string) => {
    setHistory((current) => commitCanvasHistory(
      current, updateCanvasItem(current.present, id, { content }),
    ));
  }, []);
  const commitResize = useCallback((id: string, geometry: { x: number; y: number; width: number; height: number }) => {
    setHistory((current) => commitCanvasHistory(
      current, updateCanvasItem(current.present, id, geometry),
    ));
  }, []);

  const makeNodes = useCallback((items: CanvasItem[]): CanvasNode[] => items.map((item) => ({
    id: item.id, type: "canvasNote",
    position: { x: item.x, y: item.y },
    style: { width: item.width, height: item.height },
    data: { content: item.content, onCommit: commitNote, onResize: commitResize },
    dragHandle: ".canvas-drag-handle",
    zIndex: item.z_index,
  })), [commitNote, commitResize]);

  const [nodes, setNodes] = useState<CanvasNode[]>(() => makeNodes(initialItems));
  useEffect(() => {
    // Commit boundaries are drag-stop / resize-stop / note-blur, not every pointer move.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNodes(makeNodes(history.present));
  }, [history.present, makeNodes]);

  const save = useCallback(async (items: CanvasItem[], baseRevision: number) => {
    const serialized = JSON.stringify(items);
    if (!pendingAttempt.current || pendingAttempt.current.base !== baseRevision ||
        pendingAttempt.current.serialized !== serialized) {
      pendingAttempt.current = { base: baseRevision, serialized, requestId: crypto.randomUUID() };
    }
    const requestId = pendingAttempt.current.requestId;
    const response = await fetch(`/api/projects/${projectId}/canvases/${canvasId}/mutations`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, baseRevision, requestId }),
    });
    const payload = await response.json().catch(() => ({})) as { revision?: number; error?: string };
    if (!response.ok || typeof payload.revision !== "number") {
      throw new Error(payload.error === "EDIT_CONFLICT" ? "EDIT_CONFLICT" : "Canvas save failed.");
    }
    if (pendingAttempt.current?.requestId === requestId) pendingAttempt.current = null;
    return { revision: payload.revision };
  }, [projectId, canvasId]);

  const autosave = useAutosave({
    snapshot: history.present,
    initialRevision,
    save,
    debounceMs: 700,
  });

  const addNote = useCallback(() => {
    if (history.present.length >= 500) {
      setInteractionError("This Canvas has reached the 500-item limit.");
      return;
    }
    const bounds = rootRef.current?.getBoundingClientRect();
    const center = bounds
      ? screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 })
      : { x: 0, y: 0 };
    const next: CanvasItem = {
      id: crypto.randomUUID(), kind: "NOTE", content: "",
      x: Math.round(center.x - 150), y: Math.round(center.y - 95),
      width: 300, height: 190, z_index: history.present.length,
    };
    setHistory((current) => commitCanvasHistory(current, [...current.present, next]));
    setSelectedId(next.id);
    setInteractionError("");
  }, [history.present.length, screenToFlowPosition]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setHistory((current) => commitCanvasHistory(current, current.present.filter((item) => item.id !== selectedId)));
    setSelectedId(null);
  }, [selectedId]);

  const undo = useCallback(() => {
    setHistory(undoCanvasHistory);
    setSelectedId(null);
  }, []);
  const redo = useCallback(() => {
    setHistory(redoCanvasHistory);
    setSelectedId(null);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("textarea,input,[contenteditable='true']")) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [deleteSelected, selectedId, undo, redo]);

  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    setNodes((current) => applyNodeChanges(changes.filter((c) => c.type !== "remove"), current));
  }, []);

  const statusLabel = autosave.status === "saved" ? "Saved" :
    autosave.status === "dirty" ? "Unsaved changes" :
    autosave.status === "saving" ? "Saving…" :
    autosave.status === "conflict" ? "Edit conflict — changes remain in this tab" :
    "Save failed — changes remain in this tab";

  return <div className="space-y-2">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded border border-stone-800 bg-[#11171a] p-3">
      <div>
        <p className="citem-label">Analysis Canvas · CANVAS-1</p>
        <h1 className="text-lg font-semibold text-stone-100">{name}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="citem-button" onClick={addNote}>+ Working note</button>
        <button type="button" className="citem-button-ghost" disabled={!history.past.length} onClick={undo} aria-label="Undo">Undo</button>
        <button type="button" className="citem-button-ghost" disabled={!history.future.length} onClick={redo} aria-label="Redo">Redo</button>
        <button type="button" className="citem-button-ghost text-red-300" disabled={!selectedId} onClick={deleteSelected}>Remove</button>
        <button type="button" className="citem-button-ghost"
          disabled={autosave.status === "saving" || autosave.status === "saved" || autosave.status === "conflict"}
          onClick={() => { void (autosave.status === "error" ? autosave.retry() : autosave.flush()); }}>Save / Retry</button>
      </div>
    </header>
    <div role="status" aria-live="polite" className="flex flex-wrap justify-between gap-2 text-xs text-stone-400">
      <span>{history.present.length} working notes · {statusLabel}</span>
      <span>Canvas layout is independent of the Investigation Knowledge Graph.</span>
    </div>
    {(interactionError || autosave.error) && <p role="alert" className="rounded border border-red-900/70 px-3 py-2 text-sm text-red-300">
      {interactionError || autosave.error}
      {autosave.status === "conflict" ? " Do not reload until you have copied your unsaved notes." : ""}
    </p>}
    <div ref={rootRef} className="relative h-[min(72vh,760px)] min-h-[440px] overflow-hidden rounded border border-stone-700 bg-[#0d1215]">
      {history.present.length === 0 ? <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center text-center text-sm text-stone-500">
        <div><p className="text-lg text-stone-300">Your canvas is empty</p><p className="mt-2">Add a working note to begin. No sample intelligence is created.</p></div>
      </div> : null}
      <ReactFlow<CanvasNode>
        nodes={nodes} edges={[]} nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_, node) => {
          setHistory((current) => commitCanvasHistory(current,
            updateCanvasItem(current.present, node.id, { x: node.position.x, y: node.position.y })));
        }}
        onNodeClick={(_, node) => setSelectedId(node.id)}
        onPaneClick={() => setSelectedId(null)}
        nodesConnectable={false} deleteKeyCode={null}
        minZoom={0.2} maxZoom={2.5} fitView={history.present.length > 0}
        colorMode="dark" proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#303b3e" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable maskColor="rgba(5,9,11,0.65)" />
      </ReactFlow>
    </div>
  </div>;
}

export function CanvasWorkspace(props: {
  projectId: string; canvasId: string; name: string;
  initialItems: CanvasItem[]; initialRevision: number;
}) {
  return <ReactFlowProvider><Editor {...props} /></ReactFlowProvider>;
}
