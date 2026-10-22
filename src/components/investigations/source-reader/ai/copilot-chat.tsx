"use client";

import { contextTitle, type CopilotContext } from "./copilot-context-selector";

export type CopilotEvidence = {
  statement: string; quote: string; sourceToken: string;
  page: number | null; kind: "PDF" | "ANNOTATION";
  provenance: { sourceId: string; assetId: string; annotationId?: string };
};
export type CopilotResult = {
  summary: string;
  evidence: CopilotEvidence[];
  unansweredQuestions: string[];
  warnings: string[];
  discarded: number;
};
export type CopilotTurn = {
  id: number;
  prompt: string;
  mode: "ask" | "analyse";
  context: CopilotContext;
  result: CopilotResult;
};

export function CopilotChat({ turns, onNavigate }: {
  turns: CopilotTurn[];
  onNavigate: (page: number, annotationId?: string, quote?: string) => void;
}) {
  if (!turns.length) return <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 px-8 text-center">
    <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full border border-[var(--line)] bg-[var(--amber-tint)] text-xl text-[var(--amber-soft)]">✦</span>
    <p className="text-sm font-medium text-[var(--foreground)]">AI Processing Copilot</p>
    <p className="max-w-80 text-sm leading-relaxed text-[var(--muted-strong)]">
      Ask about the selected PDF pages, or use Analyse to start with source-grounded findings.
    </p>
    <p className="text-[11px] text-[var(--muted)]">AI suggestions are not an analyst assessment.</p>
  </div>;

  return <div className="mx-auto w-full max-w-3xl space-y-7 px-5 py-6 sm:px-7" aria-live="polite">
    {turns.map((turn) => <article key={turn.id} className="space-y-4" data-testid="copilot-turn">
      <div className="ml-auto max-w-[94%] rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3 sm:max-w-[88%]">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--amber-soft)]">
          {contextTitle(turn.context)} · {turn.mode === "analyse" ? "Analyse" : "Ask"}
        </p>
        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--foreground)]">{turn.prompt}</p>
      </div>

      <div className="space-y-4 border-l-2 border-[var(--amber)] pl-4 sm:pl-5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--amber-soft)]">CİTEM · AI</span>
          <span className="text-[10px] text-[var(--muted)]">Source-grounded response</span>
        </div>
        {turn.result.summary ?
          <p className="whitespace-pre-wrap break-words text-sm leading-7 text-[var(--foreground)]">{turn.result.summary}</p>
          : <p className="text-xs text-[var(--muted-strong)]">No validated narrative summary was returned.</p>}

        {turn.result.discarded > 0 ? <p data-testid="copilot-partial-evidence"
          className="rounded border border-[var(--line)] bg-[var(--amber-tint)] px-3 py-2 text-xs leading-relaxed text-[var(--amber-soft)]">
          Partially verified · {turn.result.discarded} unsupported AI {turn.result.discarded===1?"suggestion was":"suggestions were"} discarded.
          The remaining quotations match the source text, but the model-generated narrative
          has not been verified sentence by sentence. Review before using it.
        </p> : null}
        {turn.result.evidence.length ? <details className="group rounded-lg border border-[var(--line-neutral)] bg-[var(--surface-input)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-xs text-[var(--amber-soft)] hover:bg-[var(--amber-tint)] [&::-webkit-details-marker]:hidden">
            <span className="font-medium">Source excerpts · {turn.result.evidence.length}</span>
            <span aria-hidden="true" className="text-base leading-none transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <ul className="space-y-3 border-t border-[var(--line-neutral)] px-3.5 py-3">
            {turn.result.evidence.map((item,index) => <li key={index}
              className="space-y-2 border-b border-[var(--line-neutral)] pb-3 last:border-0 last:pb-0">
              <p className="break-words text-[13px] leading-relaxed text-[var(--foreground)]">{item.statement}</p>
              <blockquote className="break-words border-l-2 border-[var(--amber-dark)] pl-3 text-xs leading-relaxed text-[var(--muted-strong)]">
                {item.quote}
              </blockquote>
              {item.page !== null && item.page >= 1
                ? <button type="button"
                  className="rounded border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--amber-soft)] hover:border-[var(--line-hover)] hover:bg-[var(--amber-tint)]"
                  onClick={() => onNavigate(item.page!, item.provenance.annotationId,item.quote)}
                  aria-label={`Go to PDF page ${item.page}`}>
                  [{item.kind === "ANNOTATION" ? "ANN" : "DOC"} p.{item.page}] ↗
                </button>
                : <span className="text-[11px] text-[var(--muted)]">{item.sourceToken} (page unavailable)</span>}
            </li>)}
          </ul>
        </details> : <p className="text-xs text-[var(--amber-soft)]">No source-matched excerpts were returned; review the answer carefully.</p>}

        {turn.result.unansweredQuestions.length ? <div className="space-y-1 text-xs text-[var(--muted-strong)]">
          <p className="font-semibold text-[var(--foreground)]">Unanswered questions</p>
          <ul className="list-inside list-disc space-y-1">{turn.result.unansweredQuestions.map((q,i)=><li key={i}>{q}</li>)}</ul>
        </div> : null}
        {turn.result.warnings.length ? <div role="note"
          className="space-y-1 rounded border border-[var(--line)] bg-[var(--amber-tint)] px-3 py-2 text-xs leading-relaxed text-[var(--amber-soft)]">
          {turn.result.warnings.map((warning,i)=><p key={i}>{warning}</p>)}
        </div> : null}
      </div>
    </article>)}
  </div>;
}
