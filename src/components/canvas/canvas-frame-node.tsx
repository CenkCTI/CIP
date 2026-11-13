"use client";

import { NodeResizer, type Node, type NodeProps } from "@xyflow/react";

export type CanvasFrameData = {
  [key: string]: unknown;
  title: string;
  count: number;
  onResize: (id: string, geometry: { x: number; y: number; width: number; height: number }) => void;
};
export type CanvasFrameFlowNode = Node<CanvasFrameData, "canvasFrame">;

/** Frames are Canvas-only visual organization, not evidence or Knowledge Graph entities. */
export function CanvasFrameNode({ id, data, selected }: NodeProps<CanvasFrameFlowNode>) {
  return (
    <div className="relative h-full w-full rounded-xl border-2 border-dashed border-[#8a7248]/70 bg-[#b9822f]/[0.055]"
      style={{ outline: selected ? "2px solid #d4a958" : undefined }}>
      <NodeResizer isVisible={selected} minWidth={320} minHeight={220}
        maxWidth={5000} maxHeight={4000}
        onResizeEnd={(_, dimensions) => data.onResize(id, {
          x: dimensions.x, y: dimensions.y, width: dimensions.width, height: dimensions.height,
        })}
      />
      <header className="canvas-drag-handle flex cursor-grab items-center justify-between gap-3 rounded-t-lg border-b border-[#b9822f]/30 bg-[#2b241b]/90 px-3 py-2">
        <span className="truncate text-sm font-semibold text-amber-200" title={data.title}>
          {data.title}
        </span>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-stone-400">
          {data.count} items · analyst frame
        </span>
      </header>
    </div>
  );
}
