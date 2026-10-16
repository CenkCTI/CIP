"use client";
import type { ChangeEvent } from "react";

export type CopilotContext =
  | { kind: "annotation"; annotationId: string }
  | { kind: "page"; page: number }
  | { kind: "pages"; pageStart: number; pageEnd: number };

export function contextTitle(context: CopilotContext) {
  if (context.kind === "annotation") return "Current annotation";
  if (context.kind === "page") return `Page ${context.page}`;
  return `Pages ${context.pageStart}–${context.pageEnd}`;
}

export function CopilotContextSelector({
  context, onChange, activePage, totalPages, annotationId, sourceTitle,
}: {
  context: CopilotContext;
  onChange: (context: CopilotContext) => void;
  activePage: number;
  totalPages: number | null;
  annotationId: string | null;
  sourceTitle: string;
}) {
  const max = Math.max(1, totalPages ?? 10000);
  const normalize = (event: ChangeEvent<HTMLInputElement>) => {
    const parsed = Number(event.currentTarget.value);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.trunc(parsed))) : 1;
  };
  return <fieldset className="space-y-2 border-b border-stone-800 px-4 py-3 text-xs text-stone-300">
    <legend className="sr-only">AI context</legend>
    <p className="font-semibold uppercase tracking-wide text-amber-300">Context</p>
    <p className="truncate text-stone-400" title={sourceTitle}>{sourceTitle}</p>
    <label className="flex items-center gap-2">
      <input type="radio" name="copilot-context" disabled={!annotationId}
        checked={context.kind === "annotation"}
        onChange={() => annotationId && onChange({kind:"annotation",annotationId})} />
      Current annotation {annotationId ? "" : "(select a text annotation)"}
    </label>
    <label className="flex items-center gap-2">
      <input type="radio" name="copilot-context" checked={context.kind === "page"}
        onChange={() => onChange({kind:"page",page:activePage})} />
      Current page · p.{activePage}
    </label>
    <label className="flex items-center gap-2">
      <input type="radio" name="copilot-context" checked={context.kind === "pages"}
        onChange={() => onChange({kind:"pages",pageStart:activePage,pageEnd:activePage})} />
      Selected pages
    </label>
    {context.kind === "pages" ? <div className="flex items-center gap-2 pl-6">
      <label className="flex items-center gap-1">From
        <input aria-label="Start page" className="w-16 rounded border border-stone-700 bg-stone-950 p-1 text-white"
          type="number" min={1} max={max} value={context.pageStart}
          onChange={(event) => onChange({kind:"pages",pageStart:normalize(event),pageEnd:context.pageEnd})} />
      </label>
      <label className="flex items-center gap-1">To
        <input aria-label="End page" className="w-16 rounded border border-stone-700 bg-stone-950 p-1 text-white"
          type="number" min={1} max={max} value={context.pageEnd}
          onChange={(event) => onChange({kind:"pages",pageStart:context.pageStart,pageEnd:normalize(event)})} />
      </label>
    </div> : null}
    {context.kind === "pages" && (context.pageEnd < context.pageStart || context.pageEnd - context.pageStart >= 10)
      ? <p role="alert" className="text-red-300">Choose 1–10 consecutive pages.</p> : null}
    <p className="text-stone-500">Entire document and Investigation-wide context arrive in later phases.</p>
  </fieldset>;
}
