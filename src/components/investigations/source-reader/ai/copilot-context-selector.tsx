"use client";

import { useState, type ChangeEvent } from "react";

export type CopilotContext =
  | { kind: "document" }
  | { kind: "annotation"; annotationId: string }
  | { kind: "page"; page: number }
  | { kind: "pages"; pageStart: number; pageEnd: number };

export function contextTitle(context: CopilotContext) {
  if (context.kind === "document") return "Entire PDF";
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
  const [expanded, setExpanded] = useState(false);
  const max = Math.max(1, totalPages ?? 10000);
  const normalize = (event: ChangeEvent<HTMLInputElement>) => {
    const parsed = Number(event.currentTarget.value);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.trunc(parsed))) : 1;
  };
  const invalidRange = context.kind === "pages" &&
    (context.pageEnd < context.pageStart || context.pageEnd - context.pageStart >= 10);

  return <section className="shrink-0 border-b border-[var(--line-neutral)]" aria-label="Source context">
    <div className="flex min-h-12 items-center gap-3 px-4">
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--amber-strong)]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-[var(--foreground)]" title={sourceTitle}>{sourceTitle}</p>
        <p className="text-[11px] text-[var(--muted-strong)]">{contextTitle(context)}{context.kind === "document" && totalPages ? ` · ${totalPages} pages` : ""} · source only</p>
      </div>
      <button type="button" aria-expanded={expanded} aria-controls="citem-copilot-context-options"
        className="shrink-0 rounded border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--amber-soft)] hover:border-[var(--line-hover)] hover:bg-[var(--amber-tint)]"
        onClick={() => setExpanded((previous) => !previous)}>
        {expanded ? "Hide context" : "Change context"} <span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
      </button>
    </div>
    {expanded ? <fieldset id="citem-copilot-context-options"
      className="space-y-3 border-t border-[var(--line-neutral)] bg-[var(--surface-input)] px-4 py-3 text-xs text-[var(--foreground)]">
      <legend className="sr-only">AI context</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="radio" name="copilot-context" checked={context.kind === "document"}
            onChange={() => onChange({kind:"document"})} />
          Entire PDF {totalPages ? `· ${totalPages} pages` : ""}
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="radio" name="copilot-context" disabled={!annotationId}
            checked={context.kind === "annotation"}
            onChange={() => annotationId && onChange({kind:"annotation",annotationId})} />
          Current annotation {annotationId ? "" : "(select text first)"}
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="radio" name="copilot-context" checked={context.kind === "page"}
            onChange={() => onChange({kind:"page",page:activePage})} />
          Current page · p.{activePage}
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="radio" name="copilot-context" checked={context.kind === "pages"}
            onChange={() => onChange({kind:"pages",pageStart:activePage,pageEnd:activePage})} />
          Selected pages
        </label>
      </div>
      {context.kind === "pages" ? <div className="flex items-center gap-3">
        <label className="flex items-center gap-2">From
          <input aria-label="Start page" className="w-18 rounded border border-[var(--line)] bg-[var(--surface-raised)] p-1.5 text-[var(--foreground)]"
            type="number" min={1} max={max} value={context.pageStart}
            onChange={(event) => onChange({kind:"pages",pageStart:normalize(event),pageEnd:context.pageEnd})} />
        </label>
        <label className="flex items-center gap-2">To
          <input aria-label="End page" className="w-18 rounded border border-[var(--line)] bg-[var(--surface-raised)] p-1.5 text-[var(--foreground)]"
            type="number" min={1} max={max} value={context.pageEnd}
            onChange={(event) => onChange({kind:"pages",pageStart:context.pageStart,pageEnd:normalize(event)})} />
        </label>
        <span className="text-[var(--muted)]">Up to 10 pages</span>
      </div> : null}
      {invalidRange ? <p role="alert" className="text-[var(--danger)]">Choose 1–10 consecutive pages.</p> : null}
      <p className="text-[11px] text-[var(--muted)]">Entire PDF analyses read this PDF. Analyst Chat also retrieves relevant, verified passages from indexed sources across this investigation.</p>
    </fieldset> : null}
  </section>;
}
