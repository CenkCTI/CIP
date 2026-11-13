"use client";

import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { CanvasMediaPreview } from "./canvas-media-preview";
import {
  canvasEntityLabel, type CanvasEntitySummary, type CanvasEntityType,
} from "@/lib/canvas/entity-registry";

type Geometry = { x: number; y: number; width: number; height: number };
export type CanvasEntityNodeData = {
  [key: string]: unknown;
  recordType: CanvasEntityType;
  recordId: string;
  entity: CanvasEntitySummary | null;
  loading: boolean;
  projectId: string;
  previewPage: number | null;
  onPreviewPageChange: (id: string, page: number) => void;
  onResize: (id: string, geometry: Geometry) => void;
};
export type CanvasEntityFlowNode = Node<CanvasEntityNodeData, "canvasEntity">;

export function CanvasEntityNode({ id, data, selected }: NodeProps<CanvasEntityFlowNode>) {
  const { entity, recordType, loading } = data;
  return (
    <article className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-[#526367] bg-[#142026] shadow-xl"
      style={{ outline: selected ? "1px solid #d4a958" : undefined }}>
      <Handle id="in" type="target" position={Position.Left}
        className="!h-3 !w-3 !border-amber-200 !bg-[#5f7880]" aria-label="Incoming Canvas relationship" />
      <Handle id="out" type="source" position={Position.Right}
        className="!h-3 !w-3 !border-amber-200 !bg-[#b9822f]" aria-label="Outgoing Canvas relationship" />
      <NodeResizer isVisible={selected} minWidth={180} minHeight={120} maxWidth={1200}
        maxHeight={900} onResizeEnd={(_, dimensions) => data.onResize(id, {
          x: dimensions.x, y: dimensions.y, width: dimensions.width, height: dimensions.height,
        })} />
      <div className="canvas-drag-handle flex cursor-grab items-center justify-between gap-2 border-b border-[#526367]/60 bg-[#213139] px-3 py-2">
        <span className="truncate text-[10px] uppercase tracking-wider text-amber-200">
          {canvasEntityLabel(recordType)}
        </span>
        <span className="text-[10px] text-stone-500" aria-hidden="true">⋮⋮</span>
      </div>
      {entity && recordType === "SOURCE_ASSET" && data.previewPage != null ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <CanvasMediaPreview projectId={data.projectId} assetId={data.recordId}
            page={data.previewPage} onPageChange={(page) => data.onPreviewPageChange(id, page)} />
        </div>
      ) : entity ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <h3 className="line-clamp-2 break-words text-sm font-semibold text-stone-100" title={entity.title}>
            {entity.title}
          </h3>
          <p className="nowheel min-h-0 flex-1 overflow-y-auto break-words text-xs leading-5 text-stone-300">
            {entity.summary || "No description available in the original record."}
          </p>
          {recordType === "SOURCE_CLAIM" || recordType === "ATTRIBUTION_CLAIM" ? (
            <p className="text-[10px] text-amber-300">
              {recordType === "SOURCE_CLAIM" ? "Source-reported; not independently verified" :
                "Attribution is a claim, not a confirmed fact"}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2 border-t border-stone-700/60 pt-2">
            <span className="truncate text-[10px] text-stone-500" title={entity.originKind}>
              {entity.originKind || "Canonical record"}
            </span>
            <a href={entity.href} target="_blank" rel="noopener noreferrer"
              className="nodrag nopan shrink-0 text-xs font-medium text-amber-300 underline hover:text-amber-100">
              Open original
            </a>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 px-3 py-4">
          <p role="status" className="text-sm text-stone-300">
            {loading ? "Resolving Investigation record…" : "Record unavailable or deleted"}
          </p>
          {!loading && <p className="text-xs leading-5 text-amber-300">
            This reference is preserved on the Canvas, but its source is no longer accessible.
            It is not treated as verified evidence.
          </p>}
          <span className="truncate font-mono text-[10px] text-stone-600" title={data.recordId}>
            {data.recordId}
          </span>
        </div>
      )}
    </article>
  );
}
