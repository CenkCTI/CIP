"use client";

import { useState, type FormEvent } from "react";
import type { CanvasAssistResult, CanvasLinkProposal } from "@/lib/canvas/ai-assist";

export type CanvasAssistAction = CanvasLinkProposal;

export function CanvasAiPanel({
  projectId, canvasId, selectedItemIds, beforeAnalyze, onApproveLink, onAddDraft, onClose, canApply,
}: {
  projectId: string;
  canvasId: string;
  selectedItemIds: string[];
  beforeAnalyze: () => Promise<number>;
  onApproveLink: (proposal: CanvasAssistAction) => void;
  onAddDraft: (result: CanvasAssistResult) => void;
  onClose: () => void;
  canApply: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [language, setLanguage] = useState<"tr" | "en">("tr");
  const [consent, setConsent] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CanvasAssistResult | null>(null);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [draftAdded, setDraftAdded] = useState(false);

  async function analyze(event: FormEvent) {
    event.preventDefault();
    if (!consent || question.trim().length < 3 || working || !selectedItemIds.length) return;
    setWorking(true); setResult(null); setError(""); setAccepted([]); setDraftAdded(false);
    try {
      // Pending note edits are persisted before asking the model to read them.
      const expectedRevision = await beforeAnalyze();
      const response = await fetch(
        `/api/projects/${projectId}/canvases/${canvasId}/assist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            question: question.trim(),
            selectedItemIds, expectedRevision, language, byokConsent: true,
          }),
        },
      );
      const payload = await response.json().catch(() => ({})) as {
        result?: CanvasAssistResult;
        error?: string;
        code?: string;
      };
      if (!response.ok || !payload.result) {
        throw new Error(payload.code === "EDIT_CONFLICT" ?
          "Canvas changed in another tab. Reload before analysing." :
          payload.error || "The AI analysis is unavailable.");
      }
      setResult(payload.result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analysis unavailable.");
    } finally { setWorking(false); }
  }

  return (
    <section className="rounded-lg border border-amber-800/60 bg-[#121a1d] p-4" aria-label="Canvas analyst AI">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-amber-300">CANVAS-5 · Analyst-assisted hypotheses</p>
          <h2 className="mt-1 text-base font-semibold text-stone-100">Review selected Canvas cards</h2>
        </div>
        <button type="button" onClick={onClose} className="citem-button-ghost">Close</button>
      </header>
      <p className="mt-2 text-xs leading-5 text-stone-400">
        {selectedItemIds.length} selected card(s) · Only working notes and short live
        Investigation catalog summaries are sent to your NVIDIA BYOK model.
        Original PDFs, private asset links, API keys and other Canvas cards are excluded.
        Catalog snippets are not independent evidence. No automatic writes.
      </p>
      <form onSubmit={(event) => { void analyze(event); }} className="mt-3 space-y-2">
        <label className="block text-xs text-stone-300" htmlFor="canvas-assist-question">
          Analyst question
        </label>
        <textarea id="canvas-assist-question" rows={3} maxLength={1200} required
          placeholder="Which hypotheses could explain these observations? What would disprove them?"
          className="w-full resize-y rounded border border-stone-700 bg-[#0c1114] p-3 text-sm text-stone-200 outline-amber-400"
          value={question} onChange={(event) => setQuestion(event.target.value)} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="text-xs text-stone-300" htmlFor="canvas-assist-language">
            Response language
            <select id="canvas-assist-language" value={language}
              onChange={(event) => setLanguage(event.target.value as "tr" | "en")}
              className="ml-2 rounded border border-stone-700 bg-[#0c1114] px-2 py-1.5">
              <option value="tr">Türkçe</option><option value="en">English</option>
            </select>
          </label>
          <label className="flex max-w-xl items-start gap-2 text-xs leading-5 text-stone-300">
            <input aria-label="I consent to send selected context to NVIDIA NIM" type="checkbox"
              checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>I consent to send the selected, bounded Canvas context and my question
              to the connected NVIDIA NIM model for this request.</span>
          </label>
        </div>
        <button type="submit" className="citem-button"
          disabled={working || !consent || question.trim().length < 3 || !selectedItemIds.length}>
          {working ? "Analysing selected cards…" : "Ask AI to propose"}
        </button>
      </form>
      {error && <p className="mt-3 rounded border border-red-900/60 p-3 text-xs text-red-300"
        role="alert">{error}</p>}
      {result && <div className="mt-4 space-y-3 border-t border-stone-700 pt-3">
        <p className="rounded border border-amber-900/40 bg-amber-950/15 p-2 text-xs leading-5 text-amber-200">
          {result.warning}
        </p>
        <div className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">Provisional assessment</h3>
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-stone-200">{result.summary}</p>
        </div>
        {result.hypotheses.length > 0 && <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
            Alternative hypotheses · confidence is not calibrated
          </h3>
          {result.hypotheses.map((hypothesis, index) =>
            <article className="rounded border border-stone-700 p-3" key={index}>
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-stone-200">{hypothesis.title}</h4>
                <span className="text-[11px] text-amber-300">{hypothesis.confidence}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-stone-300">{hypothesis.rationale}</p>
              <p className="mt-1 text-xs text-stone-400"><strong>Test:</strong> {hypothesis.test}</p>
            </article>)}
        </div>}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
            Exact matches in selected snippets · not source verification
          </h3>
          {result.observations.length ? result.observations.map((obs, index) => {
            const record = result.usedItems.find((item) => item.itemId === obs.itemId);
            return <article key={index} className="rounded border border-stone-800 p-2">
              <p className="text-[11px] text-stone-400">
                {record?.title || obs.itemId.slice(0, 8)} · {obs.scope === "CANVAS_NOTE" ?
                  "Analyst note" : "Catalog preview"}
              </p>
              <blockquote className="mt-1 border-l-2 border-amber-800 pl-2 text-xs text-stone-200">
                {obs.quote}
              </blockquote>
              <p className="mt-1 text-xs text-stone-400">{obs.significance}</p>
            </article>;
          }) : <p className="text-xs text-stone-500">No quoted passage passed exact-match verification.</p>}
        </div>
        {result.linkProposals.length > 0 && <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
            Suggested Canvas relationships · add manually
          </h3>
          {result.linkProposals.map((link, index) => {
            const key = `${link.sourceId}|${link.targetId}|${link.relationType}`;
            const source = result.usedItems.find((item) => item.itemId === link.sourceId);
            const target = result.usedItems.find((item) => item.itemId === link.targetId);
            return <div key={index} className="flex flex-wrap items-center justify-between gap-3 rounded border border-stone-700 p-3">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="break-words text-xs text-amber-200">
                  {source?.title || "Selected card"} → {link.relationType.replaceAll("_", " ")} → {target?.title || "Selected card"}
                </p>
                <p className="text-xs text-stone-400">{link.rationale}</p>
              </div>
              <button type="button" className="citem-button-ghost"
                disabled={!canApply || accepted.includes(key)}
                onClick={() => { onApproveLink(link); setAccepted((old) => [...old, key]); }}>
                {accepted.includes(key) ? "Added" : "Add link"}
              </button>
            </div>;
          })}
        </div>}
        {result.questions.length > 0 && <div className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">What to investigate next</h3>
          {result.questions.map((question, index) =>
            <p className="text-xs text-stone-300" key={index}>{index + 1}. {question}</p>)}
        </div>}
        {result.discarded > 0 &&
          <p className="text-xs text-amber-300">{result.discarded} unverifiable or duplicate AI suggestion(s) discarded.</p>}
        <button type="button" className="citem-button-ghost" disabled={!canApply || draftAdded}
          onClick={() => { onAddDraft(result); setDraftAdded(true); }}>
          {draftAdded ? "Draft note added" : "Add as unverified working note"}
        </button>
      </div>}
    </section>
  );
}
