"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ByokConnectionPanel } from "@/components/ai/byok-connection-panel";
import { useCopilotWindow } from "@/components/investigations/source-reader/ai/use-copilot-window";
import type { CanvasAssistResult, CanvasLinkProposal } from "@/lib/canvas/ai-assist";

export type CanvasAssistAction = CanvasLinkProposal;
type ByokStatus = {
  enabled?: boolean; connected?: boolean; state?: string;
  provider?: string; providerId?: string; model?: string;
  expiresAt?: string;
};

/**
 * Same floating, dockable, resizable Source Reader Copilot shell.
 * The Canvas Copilot has its own session window geometry and never writes
 * AI suggestions unless the analyst explicitly approves an action.
 */
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
  const windowState = useCopilotWindow("citem:canvas-ai-window:v1");
  const activeRequest = useRef<AbortController | null>(null);
  const [showConnection, setShowConnection] = useState(false);
  const [byok, setByok] = useState<ByokStatus | null>(null);
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [language, setLanguage] = useState<"tr" | "en">("tr");
  const [consent, setConsent] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CanvasAssistResult | null>(null);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [draftAdded, setDraftAdded] = useState(false);
  const isMinimized = windowState.geometry.minimized && !windowState.mobile;
  const connected = byok?.connected === true && byok.providerId === "nvidia_nim";

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/ai/byok/status", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("status_unavailable");
        return await res.json() as ByokStatus;
      })
      .then((status) => { if (!controller.signal.aborted) setByok(status); })
      .catch(() => { if (!controller.signal.aborted) setByok({ connected: false, state: "unavailable" }); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  async function analyze(event: FormEvent) {
    event.preventDefault();
    if (!consent || question.trim().length < 3 || working || !selectedItemIds.length) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setWorking(true); setResult(null); setError(""); setAccepted([]); setDraftAdded(false);
    try {
      // Save local drafts first; the API reads all selected records from owned DB.
      const expectedRevision = await beforeAnalyze();
      if (controller.signal.aborted) return;
      const response = await fetch(
        `/api/projects/${projectId}/canvases/${canvasId}/assist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: controller.signal,
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
      if (!controller.signal.aborted) {
        setSubmittedQuestion(question.trim());
        setResult(payload.result);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(
        cause instanceof Error ? cause.message : "Analysis unavailable.");
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      setWorking(false);
    }
  }

  return (
    <section role="dialog" aria-label="Canvas AI Copilot" aria-modal="false"
      data-testid="canvas-ai-copilot"
      className="fixed z-[70] flex flex-col overflow-hidden border border-[var(--line)] bg-[var(--surface-panel)] text-[var(--foreground)] shadow-[0_24px_72px_rgba(0,0,0,0.65)] md:rounded-xl"
      style={windowState.style}>
      <header
        className="flex min-h-14 shrink-0 touch-none select-none items-center justify-between gap-3 border-b border-[var(--line-neutral)] bg-[var(--surface-raised)] px-4"
        onPointerDown={(event) => windowState.startPointer(event, "drag")}
        aria-label="Drag Canvas Copilot window">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div aria-hidden="true"
            className="grid h-8 w-8 shrink-0 place-items-center rounded border border-[var(--line)] bg-[var(--amber-tint)] text-lg text-[var(--amber-soft)]">
            ✦
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold tracking-[0.16em] text-[var(--amber-soft)]">
              CİTEM / COPILOT
            </p>
            <p className="flex items-center gap-1.5 truncate text-[11px] text-[var(--muted-strong)]"
              title={connected ? byok?.model : "NVIDIA NIM"}>
              <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${connected ? "bg-[var(--success)]" : "bg-[var(--danger)]"}`} />
              Canvas analysis · {connected ? "NVIDIA connected" : "NVIDIA not connected"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-[var(--muted-strong)]">
          <button type="button" title="Copilot preferences and BYOK" aria-label="Canvas Copilot settings"
            aria-expanded={showConnection} aria-controls="citem-canvas-copilot-settings"
            className="rounded-lg border border-transparent px-3 py-1.5 text-[11px] font-semibold text-[var(--amber-soft)] hover:border-[var(--line)] hover:bg-[var(--amber-tint)]"
            onClick={() => setShowConnection((value) => !value)}>⚙ Settings</button>
          {!windowState.mobile && <button type="button"
            className="rounded px-2 py-1.5 text-xs hover:bg-[var(--amber-tint)]"
            aria-label={windowState.geometry.minimized ? "Restore Canvas Copilot" : "Minimize Canvas Copilot"}
            onClick={windowState.setMinimized}>
            {windowState.geometry.minimized ? "▢" : "−"}
          </button>}
          {!windowState.mobile && <button type="button"
            className="rounded px-2 py-1.5 text-[11px] hover:bg-[var(--amber-tint)]"
            aria-label={windowState.geometry.docked ? "Undock Canvas Copilot" : "Dock Canvas Copilot"}
            onClick={windowState.setDocked}>
            {windowState.geometry.docked ? "Float" : "Dock"}
          </button>}
          <button type="button" className="rounded px-2 py-1.5 text-base hover:bg-[var(--amber-tint)]"
            aria-label="Close Canvas Copilot" onClick={onClose}>×</button>
        </div>
      </header>

      {!isMinimized && <>
        {showConnection && <div id="citem-canvas-copilot-settings" role="region"
          aria-label="Canvas Copilot preferences"
          data-testid="canvas-copilot-settings-popover"
          className="absolute right-3 top-14 z-20 max-h-[min(75vh,610px)] w-[min(95%,460px)] overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[0_16px_50px_rgba(0,0,0,0.65)]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--amber-soft)]">
              Canvas Copilot preferences
            </h3>
            <button type="button" onClick={() => setShowConnection(false)}
              aria-label="Close Canvas Copilot settings"
              className="rounded px-2 py-1 text-xs text-[var(--muted-strong)] hover:bg-[var(--amber-tint)]">
              Done ×
            </button>
          </div>
          <div className="space-y-3">
            <div className="rounded-lg border border-[var(--line-neutral)] p-3">
              <p className="text-xs font-semibold text-[var(--foreground)]">Context and permissions</p>
              <p className="mt-2 text-xs leading-5 text-[var(--muted-strong)]">
                Only up to 12 selected working notes or Investigation catalog previews
                are sent with explicit per-request consent. This mode does not read
                original PDF pages or perform web research and cannot create canonical CTI.
              </p>
            </div>
            <ByokConnectionPanel scope="user" defaultProviderId="nvidia_nim"
              autoLoad={false} initialStatus={byok ?? undefined}
              onStatusChange={setByok} />
          </div>
        </div>}

        {!connected && <button type="button" onClick={() => setShowConnection(true)}
          className="mx-4 mt-3 shrink-0 rounded-lg border border-[var(--amber-dark)] bg-[var(--amber-tint)] px-3 py-2 text-left text-xs text-[var(--amber-soft)]">
          Connect NVIDIA NIM in Settings
        </button>}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line-neutral)] px-4 py-2">
          <span className="text-xs font-medium text-[var(--muted-strong)]">
            Canvas selection · {selectedItemIds.length} {selectedItemIds.length === 1 ? "card" : "cards"}
          </span>
          <span className="text-[11px] text-[var(--muted)]">
            Human approval required · no automatic writes
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface)]"
          aria-label="Canvas Copilot analysis">
          {result ? <>
            <div className="mx-auto max-w-3xl px-5 pt-5 sm:px-7">
              <div className="ml-auto max-w-[90%] rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--amber-soft)]">
                  Analyst question · selected Canvas
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">{submittedQuestion}</p>
              </div>
            </div>
      {result && <div className="mx-auto max-w-3xl space-y-5 px-5 py-6 sm:px-7">
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
          </> : <div className="flex min-h-56 h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <span aria-hidden="true"
              className="grid h-12 w-12 place-items-center rounded-full border border-[var(--line)] bg-[var(--amber-tint)] text-xl text-[var(--amber-soft)]">✦</span>
            <p className="text-sm font-medium text-[var(--foreground)]">Canvas AI Copilot</p>
            <p className="max-w-sm text-sm leading-relaxed text-[var(--muted-strong)]">
              Ask for alternative hypotheses, falsifiable tests and suggested relationships
              based on the selected Canvas cards. Results are provisional.
            </p>
          </div>}
        </div>

        <form onSubmit={(event) => { void analyze(event); }}
          className="shrink-0 border-t border-[var(--line)] bg-[var(--surface-panel)] px-4 pb-3 pt-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <label className="text-xs text-[var(--muted-strong)]" htmlFor="canvas-assist-language">
              Response language
              <select id="canvas-assist-language" value={language}
                onChange={(event) => setLanguage(event.target.value as "tr" | "en")}
                className="ml-2 min-h-8 rounded border border-[var(--line)] bg-[var(--surface-input)] px-2 text-xs text-[var(--foreground)]">
                <option value="tr">Türkçe</option><option value="en">English</option>
              </select>
            </label>
          </div>
          <label htmlFor="canvas-assist-question"
            className="mb-1.5 block text-xs font-medium text-[var(--muted-strong)]">
            Ask about selected Canvas cards
          </label>
          <div className="flex items-end gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-input)] p-2 focus-within:border-[var(--line-hover)]">
            <textarea id="canvas-assist-question" value={question}
              onChange={(event) => setQuestion(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={2} maxLength={1200}
              placeholder="What hypotheses fit these observations? What would disprove them?"
              className="max-h-40 min-h-16 w-full flex-1 resize-y bg-transparent px-1.5 py-1 text-sm leading-relaxed text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
              disabled={working} />
            <div className="flex shrink-0 flex-col gap-1">
              {working && <button type="button"
                className="rounded border border-[var(--line)] px-3 py-2 text-xs text-[var(--muted-strong)]"
                onClick={() => activeRequest.current?.abort()}>Cancel</button>}
              <button type="submit"
                disabled={working || !consent || question.trim().length < 3 || !selectedItemIds.length}
                className="rounded border border-[var(--amber-strong)] bg-[var(--amber-strong)] px-4 py-2 text-xs font-semibold text-[#171106] hover:bg-[var(--amber-soft)] disabled:opacity-40">
                {working ? "Working…" : "Ask analyst"}
              </button>
            </div>
          </div>
          <label className="mt-2 flex items-start gap-2 text-[11px] leading-5 text-[var(--muted-strong)]">
            <input type="checkbox" checked={consent}
              aria-label="I consent to send selected context to NVIDIA NIM"
              onChange={(event) => setConsent(event.target.checked)} />
            <span>I consent to send only the selected Canvas context and my question to NVIDIA NIM for this request.</span>
          </label>
          {error && <p className="mt-2 text-xs text-[var(--danger)]" role="alert">{error}</p>}
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Enter to send · Shift+Enter for new line · No autonomous edits
          </p>
        </form>
      </>}
      {!windowState.mobile && !windowState.geometry.docked && !isMinimized &&
        <div role="separator" aria-label="Resize Canvas Copilot"
          title="Drag to resize"
          className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize touch-none border-b-2 border-r-2 border-[var(--amber)]"
          onPointerDown={(event) => windowState.startPointer(event, "resize")} />}
    </section>
  );
}
