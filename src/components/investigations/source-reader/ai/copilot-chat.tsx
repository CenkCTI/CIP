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
  onNavigate: (page: number, annotationId?: string) => void;
}) {
  if (!turns.length) return <p className="px-4 py-8 text-center text-sm text-stone-400">
    Ask a question about the current source. Answers are provisional and must be checked against the cited evidence.
  </p>;
  return <div className="space-y-4 px-4 py-3" aria-live="polite">
    {turns.map((turn) => <article key={turn.id} className="space-y-3 border-b border-stone-800 pb-4" data-testid="copilot-turn">
      <div className="rounded-lg bg-stone-800/80 p-3 text-sm text-stone-100">
        <p className="mb-1 text-[11px] uppercase text-amber-300">{contextTitle(turn.context)} · {turn.mode === "analyse" ? "Analyse" : "Ask"}</p>
        <p className="whitespace-pre-wrap break-words">{turn.prompt}</p>
      </div>
      <div className="space-y-3 rounded-lg border border-stone-800 bg-stone-950/70 p-3 text-sm text-stone-200">
        {turn.result.summary ? <p className="whitespace-pre-wrap break-words">{turn.result.summary}</p> : null}
        {turn.result.evidence.length ? <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Source-supported statements</p>
          <ul className="space-y-2">{turn.result.evidence.map((item, index) =>
            <li key={index} className="rounded border border-stone-800 p-2">
              <p className="break-words">{item.statement}</p>
              <blockquote className="mt-1 border-l-2 border-amber-600 pl-2 text-xs text-stone-400 break-words">{item.quote}</blockquote>
              {item.page !== null && item.page >= 1
                ? <button type="button" className="mt-2 rounded border border-amber-800 px-2 py-1 text-xs text-amber-200 hover:bg-stone-800"
                    onClick={() => onNavigate(item.page!, item.provenance.annotationId)}
                    aria-label={`Go to PDF page ${item.page}`}>
                    [{item.kind === "ANNOTATION" ? "ANN" : "DOC"} p.{item.page}]
                  </button>
                : <span className="mt-2 block text-xs text-stone-500">{item.sourceToken} (page unavailable)</span>}
            </li>)}</ul>
        </div> : <p className="text-xs text-amber-300">No verified evidence was returned. Do not treat this answer as source-supported.</p>}
        {turn.result.unansweredQuestions.length > 0 ? <div>
          <p className="text-xs font-semibold text-stone-400">Unanswered questions</p>
          <ul className="list-inside list-disc text-xs text-stone-400">{turn.result.unansweredQuestions.map((q,i)=><li key={i}>{q}</li>)}</ul>
        </div> : null}
        {turn.result.warnings.length > 0 ? <div role="note" className="text-xs text-amber-300">
          {turn.result.warnings.map((warning,i)=><p key={i}>{warning}</p>)}
        </div> : null}
      </div>
    </article>)}
  </div>;
}
