"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { SubmitButton } from "@/components/form-status";
import {
  addAttributionClue,
  addAttributionClueReference,
  clearAttributionCell,
  saveAttributionCellImpact,
  saveInvestigationAssessment,
  saveInvestigationHypothesis,
} from "@/app/projects/[id]/attribution-actions";

type R = Record<string, unknown>;
type Reference = { type: string; label: string; href: string };
type State = { error?: string; success?: string };
type StatefulAction = (state: State, formData: FormData) => Promise<State>;
type Panel =
  | { kind: "hypothesis"; row?: R }
  | { kind: "clue" }
  | { kind: "clue-detail"; clue: R }
  | null;

const s = (value: unknown) => String(value ?? "");
const input = "w-full rounded border border-stone-700 bg-stone-950 p-2";

function impactSymbol(impact: unknown) {
  if (impact === "SUPPORTS") return "+";
  if (impact === "CONTRADICTS") return "−";
  if (impact === "NEUTRAL") return "~";
  return "?";
}

function impactTone(impact: unknown) {
  if (impact === "SUPPORTS")
    return "text-emerald-300 border-emerald-900/70 bg-emerald-950/20";
  if (impact === "CONTRADICTS")
    return "text-red-300 border-red-900/70 bg-red-950/20";
  if (impact === "NEUTRAL")
    return "text-amber-200 border-amber-900/70 bg-amber-950/20";
  return "text-stone-500 border-stone-800 bg-black/10";
}

function CloseableActionForm({
  action,
  onSuccess,
  children,
}: {
  action: StatefulAction;
  onSuccess?: () => void;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(action, {});
  useEffect(() => {
    if (state.success) onSuccess?.();
  }, [state.success, onSuccess]);

  return (
    <form action={formAction} className="space-y-4">
      {children}
      {state.error ? (
        <p role="alert" className="text-sm text-red-300">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function Drawer({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex justify-end">
      <button
        aria-label="Close panel"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        type="button"
      />
      <aside className="relative z-10 h-full w-full max-w-xl overflow-y-auto border-l border-stone-700 bg-stone-950 p-5 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-stone-800 pb-4">
          <div>
            <p className="citem-label">Attribution matrix</p>
            <h3 className="mt-1 text-xl font-semibold text-stone-100">{title}</h3>
            {subtitle ? (
              <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
            ) : null}
          </div>
          <button
            className="rounded border border-stone-700 px-3 py-1.5 text-sm text-stone-300 hover:border-cyan-700 hover:text-cyan-200"
            onClick={onClose}
            type="button"
          >
            Close ×
          </button>
        </div>
        {children}
      </aside>
    </div>,
    document.body,
  );
}

function InvestigationHypothesisForm({
  projectId,
  actors,
  row = {},
  onSuccess,
}: {
  projectId: string;
  actors: R[];
  row?: R;
  onSuccess: () => void;
}) {
  const [subjectKind, setSubjectKind] = useState(
    s(row.subject_kind) || "UNKNOWN_ACTOR",
  );
  return (
    <CloseableActionForm
      action={saveInvestigationHypothesis.bind(
        null,
        projectId,
        s(row.id) || undefined,
      )}
      onSuccess={onSuccess}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <label>
          Title
          <input
            className={input}
            name="title"
            required
            defaultValue={s(row.title)}
          />
        </label>
        <label>
          Subject kind
          <select
            className={input}
            name="subject_kind"
            value={subjectKind}
            onChange={(event) => setSubjectKind(event.target.value)}
          >
            <option>EXISTING_THREAT_ACTOR</option>
            <option>ACTOR_CLASS</option>
            <option>UNKNOWN_ACTOR</option>
            <option>NON_ATTRIBUTION_ALTERNATIVE</option>
          </select>
        </label>
        {subjectKind === "EXISTING_THREAT_ACTOR" ? (
          <label>
            Threat Actor
            <select
              className={input}
              name="threat_actor_id"
              defaultValue={s(row.threat_actor_id)}
            >
              <option value="">Select actor</option>
              {actors.map((actor) => (
                <option key={s(actor.id)} value={s(actor.id)}>
                  {s(actor.name)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="threat_actor_id" value="" />
        )}
        {subjectKind !== "EXISTING_THREAT_ACTOR" ? (
          <label>
            Subject label
            <input
              className={input}
              name="subject_label"
              defaultValue={s(row.subject_label)}
            />
          </label>
        ) : (
          <input type="hidden" name="subject_label" value="" />
        )}
        <label>
          Status
          <select
            className={input}
            name="status"
            defaultValue={s(row.status) || "DRAFT"}
          >
            <option>DRAFT</option>
            <option>ACTIVE</option>
            <option>DISFAVORED</option>
            <option>REJECTED</option>
          </select>
        </label>
        <label>
          Confidence
          <select
            className={input}
            name="confidence"
            defaultValue={s(row.confidence) || "MEDIUM"}
          >
            <option>LOW</option>
            <option>MEDIUM</option>
            <option>HIGH</option>
          </select>
        </label>
      </div>
      <label>
        Proposition
        <textarea
          className={input}
          name="proposition"
          required
          defaultValue={s(row.proposition)}
        />
      </label>
      <details className="rounded border border-stone-800 p-3">
        <summary className="cursor-pointer text-xs text-cyan-300">
          Analytical details
        </summary>
        <div className="mt-3 grid gap-3">
          {[
            ["analytic_rationale", "Analytic rationale"],
            ["key_assumptions", "Key assumptions"],
            ["known_weaknesses", "Known weaknesses"],
            ["information_gaps", "Information gaps"],
            ["status_rationale", "Status rationale"],
          ].map(([name, label]) => (
            <label key={name}>
              {label}
              <textarea
                className={input}
                name={name}
                defaultValue={s(row[name])}
              />
            </label>
          ))}
        </div>
      </details>
      <SubmitButton>
        {row.id ? "Save hypothesis" : "Add hypothesis column"}
      </SubmitButton>
    </CloseableActionForm>
  );
}

function ClueForm({
  projectId,
  onSuccess,
}: {
  projectId: string;
  onSuccess: () => void;
}) {
  return (
    <CloseableActionForm
      action={addAttributionClue.bind(null, projectId)}
      onSuccess={onSuccess}
    >
      <label>
        Clue label
        <input
          className={input}
          name="title"
          required
          placeholder="e.g. Infrastructure overlap"
        />
      </label>
      <label>
        What did you observe?
        <textarea
          className={input}
          name="relevance_note"
          required
          placeholder="State the observable clue without forcing an attribution conclusion."
        />
      </label>
      <SubmitButton>Add clue row</SubmitButton>
    </CloseableActionForm>
  );
}

function ClueReferenceForm({
  projectId,
  clueId,
  options,
}: {
  projectId: string;
  clueId: string;
  options: Record<string, R[]>;
}) {
  const types = Object.keys(options);
  const [referenceType, setReferenceType] = useState(types[0] ?? "evidence");
  const rows = options[referenceType] ?? [];
  return (
    <CloseableActionForm
      action={addAttributionClueReference.bind(null, projectId, clueId)}
    >
      <label className="text-xs text-stone-400">
        Reference type
        <select
          className={input}
          name="reference_type"
          value={referenceType}
          onChange={(event) => setReferenceType(event.target.value)}
        >
          {types.map((type) => (
            <option key={type} value={type}>
              {type.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-stone-400">
        Supporting material
        <select
          className={input}
          name="reference_id"
          required
          defaultValue=""
          key={referenceType}
        >
          <option value="" disabled>
            Select record
          </option>
          {rows.map((row) => (
            <option key={s(row.id)} value={s(row.id)}>
              {s(row.label)}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton>Link supporting material</SubmitButton>
    </CloseableActionForm>
  );
}

function InvestigationAssessmentForm({
  projectId,
  row,
  hypotheses,
}: {
  projectId: string;
  row: R;
  hypotheses: R[];
}) {
  const [conclusion, setConclusion] = useState(
    s(row.conclusion_type) || "UNRESOLVED",
  );
  return (
    <CloseableActionForm action={saveInvestigationAssessment.bind(null, projectId)}>
      <div className="grid gap-3 md:grid-cols-3">
        <label>
          Status
          <select
            className={input}
            name="assessment_status"
            defaultValue={s(row.assessment_status) || "DRAFT"}
          >
            <option>DRAFT</option>
            <option>ASSESSED</option>
          </select>
        </label>
        <label>
          Conclusion
          <select
            className={input}
            name="conclusion_type"
            value={conclusion}
            onChange={(event) => setConclusion(event.target.value)}
          >
            <option>UNRESOLVED</option>
            <option>PREFERRED_HYPOTHESIS</option>
            <option>MULTIPLE_PLAUSIBLE</option>
            <option>INSUFFICIENT_EVIDENCE</option>
            <option>ATTRIBUTION_WITHHELD</option>
          </select>
        </label>
        <label>
          Confidence
          <select
            className={input}
            name="confidence"
            defaultValue={s(row.confidence) || "MEDIUM"}
          >
            <option>LOW</option>
            <option>MEDIUM</option>
            <option>HIGH</option>
          </select>
        </label>
      </div>
      {conclusion === "PREFERRED_HYPOTHESIS" ? (
        <label>
          Preferred hypothesis
          <select
            className={input}
            name="preferred_hypothesis_id"
            defaultValue={s(row.preferred_hypothesis_id)}
          >
            <option value="">Select hypothesis</option>
            {hypotheses.map((hypothesis, index) => (
              <option key={s(hypothesis.id)} value={s(hypothesis.id)}>
                H{index + 1} — {s(hypothesis.title)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="preferred_hypothesis_id" value="" />
      )}
      <label>
        Current judgement
        <textarea
          className={input}
          name="current_judgment"
          defaultValue={s(row.current_judgment)}
        />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label>
          Alternative explanations
          <textarea
            className={input}
            name="alternative_explanations"
            defaultValue={s(row.alternative_explanations)}
          />
        </label>
        <label>
          Key uncertainties
          <textarea
            className={input}
            name="key_uncertainties"
            defaultValue={s(row.key_uncertainties)}
          />
        </label>
      </div>
      <label>
        Discriminating information needed
        <textarea
          className={input}
          name="discriminating_information_needed"
          defaultValue={s(row.discriminating_information_needed)}
        />
      </label>
      <label>
        Assessed at
        <input
          className={input}
          name="assessed_at"
          type="datetime-local"
          defaultValue={s(row.assessed_at).slice(0, 16)}
        />
      </label>
      <SubmitButton>Save judgement</SubmitButton>
    </CloseableActionForm>
  );
}

function MatrixCell({
  projectId,
  hypothesis,
  clue,
  evaluation,
  open,
  onToggle,
  onClose,
}: {
  projectId: string;
  hypothesis: R;
  clue: R;
  evaluation?: R;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [currentImpact, setCurrentImpact] = useState(s(evaluation?.impact));
  const [diagnosticValue, setDiagnosticValue] = useState(
    s(evaluation?.diagnostic_value) || "MEDIUM",
  );
  const [rationale, setRationale] = useState(s(evaluation?.rationale));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hypothesisId = s(hypothesis.id);
  const clueId = s(clue.id);

  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = 272;
    const estimatedHeight = currentImpact ? 390 : 205;
    const left = Math.max(
      12,
      Math.min(rect.left, window.innerWidth - width - 12),
    );
    const below = rect.bottom + 8;
    const top =
      below + estimatedHeight <= window.innerHeight
        ? below
        : Math.max(12, rect.top - estimatedHeight - 8);
    setPosition({ left, top });

    const closeOnViewportMove = () => onClose();
    window.addEventListener("resize", closeOnViewportMove);
    window.addEventListener("scroll", closeOnViewportMove, true);
    return () => {
      window.removeEventListener("resize", closeOnViewportMove);
      window.removeEventListener("scroll", closeOnViewportMove, true);
    };
  }, [open, currentImpact, onClose]);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !buttonRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handlePointer);
    return () => document.removeEventListener("pointerdown", handlePointer);
  }, [open, onClose]);

  async function persistImpact(
    nextImpact: "SUPPORTS" | "CONTRADICTS" | "NEUTRAL",
    nextDiagnostic = diagnosticValue,
    nextRationale = rationale,
  ) {
    if (pending) return;
    const previous = currentImpact;
    setError(null);
    setPending(true);
    setCurrentImpact(nextImpact);
    onClose();
    const formData = new FormData();
    formData.set("diagnostic_value", nextDiagnostic);
    formData.set("rationale", nextRationale);
    const result = await saveAttributionCellImpact(
      projectId,
      hypothesisId,
      clueId,
      nextImpact,
      {},
      formData,
    );
    if (result.error) {
      setCurrentImpact(previous);
      setError(result.error);
    }
    setPending(false);
  }

  async function clearImpact() {
    if (pending) return;
    const previousImpact = currentImpact;
    const previousDiagnostic = diagnosticValue;
    const previousRationale = rationale;
    setError(null);
    setPending(true);
    setCurrentImpact("");
    setDiagnosticValue("MEDIUM");
    setRationale("");
    onClose();
    const result = await clearAttributionCell(
      projectId,
      hypothesisId,
      clueId,
      {},
      new FormData(),
    );
    if (result.error) {
      setCurrentImpact(previousImpact);
      setDiagnosticValue(previousDiagnostic);
      setRationale(previousRationale);
      setError(result.error);
    }
    setPending(false);
  }

  const menu =
    open && position && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[100] w-[17rem] rounded border border-stone-700 bg-stone-950 p-3 text-left shadow-2xl"
            style={{ left: position.left, top: position.top }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-stone-100">
                  Assess this relationship
                </p>
                <p className="mt-1 line-clamp-2 text-[11px] text-stone-500">
                  {s(clue.title)} × {s(hypothesis.title)}
                </p>
              </div>
              <button
                className="text-stone-500 hover:text-stone-200"
                onClick={onClose}
                type="button"
                aria-label="Close relationship menu"
              >
                ×
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              <button
                className="rounded border border-stone-700 px-2 py-1.5 text-left text-xs text-stone-200 hover:border-emerald-700 hover:text-emerald-300 disabled:opacity-50"
                disabled={pending}
                onClick={() => void persistImpact("SUPPORTS")}
                type="button"
              >
                + Supports
              </button>
              <button
                className="rounded border border-stone-700 px-2 py-1.5 text-left text-xs text-stone-200 hover:border-red-700 hover:text-red-300 disabled:opacity-50"
                disabled={pending}
                onClick={() => void persistImpact("CONTRADICTS")}
                type="button"
              >
                − Contradicts
              </button>
              <button
                className="rounded border border-stone-700 px-2 py-1.5 text-left text-xs text-stone-200 hover:border-amber-700 hover:text-amber-200 disabled:opacity-50"
                disabled={pending}
                onClick={() => void persistImpact("NEUTRAL")}
                type="button"
              >
                ~ Neutral
              </button>
              {currentImpact ? (
                <button
                  className="rounded border border-stone-800 px-2 py-1.5 text-left text-xs text-stone-400 hover:border-stone-600 hover:text-stone-200 disabled:opacity-50"
                  disabled={pending}
                  onClick={() => void clearImpact()}
                  type="button"
                >
                  ? Clear / not assessed
                </button>
              ) : null}
            </div>
            {currentImpact ? (
              <details className="mt-3 border-t border-stone-800 pt-3">
                <summary className="cursor-pointer text-xs text-cyan-300">
                  Optional details
                </summary>
                <div className="mt-3 grid gap-3">
                  <label className="text-xs text-stone-400">
                    Diagnostic value
                    <select
                      className={input}
                      value={diagnosticValue}
                      onChange={(event) => setDiagnosticValue(event.target.value)}
                    >
                      <option>LOW</option>
                      <option>MEDIUM</option>
                      <option>HIGH</option>
                    </select>
                  </label>
                  <label className="text-xs text-stone-400">
                    Rationale
                    <textarea
                      className={input}
                      value={rationale}
                      onChange={(event) => setRationale(event.target.value)}
                      placeholder="Why does this clue matter for the hypothesis?"
                    />
                  </label>
                  <button
                    className="rounded bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
                    disabled={pending}
                    onClick={() =>
                      void persistImpact(
                        currentImpact as "SUPPORTS" | "CONTRADICTS" | "NEUTRAL",
                      )
                    }
                    type="button"
                  >
                    Save details
                  </button>
                </div>
              </details>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative flex min-h-12 flex-col items-center justify-center">
      <button
        ref={buttonRef}
        className={`flex h-10 w-10 items-center justify-center rounded border text-lg font-semibold transition hover:border-cyan-600 disabled:opacity-60 ${impactTone(currentImpact)}`}
        disabled={pending}
        onClick={onToggle}
        title={`${s(clue.title)} × ${s(hypothesis.title)} — click to assess`}
        type="button"
      >
        {pending ? "…" : impactSymbol(currentImpact)}
      </button>
      {error ? (
        <p className="mt-1 max-w-32 text-center text-[10px] leading-4 text-red-300">
          {error}
        </p>
      ) : null}
      {menu}
    </div>
  );
}

export function InvestigationAttributionMatrix({
  projectId,
  hypotheses,
  clues,
  evaluations,
  actors,
  referenceOptions,
  assessment,
}: {
  projectId: string;
  hypotheses: R[];
  clues: R[];
  evaluations: R[];
  actors: R[];
  referenceOptions: Record<string, R[]>;
  assessment: R;
}) {
  const matrixScrollRef = useRef<HTMLDivElement>(null);
  const [openCell, setOpenCell] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);

  const closePanel = () => setPanel(null);
  const scrollMatrix = (direction: -1 | 1) => {
    setOpenCell(null);
    matrixScrollRef.current?.scrollBy({
      left: direction * 520,
      behavior: "smooth",
    });
  };

  return (
    <div className="space-y-6">
      <section className="card min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="citem-label">Attribution matrix</p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-100">
              Competing hypotheses × clues
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-400">
              Start with observations, not a preferred actor. Add hypothesis columns
              and clue rows, then click an intersection to classify the relationship.
            </p>
          </div>
          <p className="text-xs text-stone-500">
            + supports · − contradicts · ~ neutral · ? not assessed
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded border border-stone-800 bg-black/10 p-2">
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded border border-cyan-800 px-3 py-2 text-sm text-cyan-300 hover:border-cyan-500"
              onClick={() => setPanel({ kind: "hypothesis" })}
              type="button"
            >
              + Hypothesis
            </button>
            <button
              className="rounded border border-cyan-800 px-3 py-2 text-sm text-cyan-300 hover:border-cyan-500"
              onClick={() => setPanel({ kind: "clue" })}
              type="button"
            >
              + Clue
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-500">
              {hypotheses.length} hypotheses · {clues.length} clues
            </span>
            <button
              aria-label="Scroll hypotheses left"
              className="rounded border border-stone-700 px-3 py-1.5 text-stone-300 hover:border-cyan-700 hover:text-cyan-200"
              onClick={() => scrollMatrix(-1)}
              type="button"
            >
              ←
            </button>
            <button
              aria-label="Scroll hypotheses right"
              className="rounded border border-stone-700 px-3 py-1.5 text-stone-300 hover:border-cyan-700 hover:text-cyan-200"
              onClick={() => scrollMatrix(1)}
              type="button"
            >
              →
            </button>
          </div>
        </div>

        <div
          ref={matrixScrollRef}
          className="mt-4 max-h-[70vh] overflow-auto rounded border border-stone-800"
          onScroll={() => setOpenCell(null)}
        >
          <table className="min-w-max border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-40 min-w-72 border-b border-r border-stone-800 bg-stone-950 p-3 align-bottom">
                  <span className="text-xs uppercase tracking-wider text-stone-500">
                    Clues
                  </span>
                </th>
                {hypotheses.map((hypothesis, index) => (
                  <th
                    className="sticky top-0 z-30 min-w-56 border-b border-r border-stone-800 bg-stone-950 p-3 align-top"
                    key={s(hypothesis.id)}
                  >
                    <button
                      className="w-full text-left"
                      onClick={() => setPanel({ kind: "hypothesis", row: hypothesis })}
                      type="button"
                    >
                      <span className="text-xs text-cyan-400">H{index + 1}</span>
                      <strong className="mt-1 block text-stone-100 hover:text-cyan-200">
                        {s(hypothesis.title)}
                      </strong>
                      <span className="mt-1 block max-w-52 truncate text-xs font-normal text-stone-500">
                        {s(hypothesis.subject_name)} · {s(hypothesis.confidence)}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clues.map((clue) => {
                const references = (clue.references ?? []) as Reference[];
                return (
                  <tr key={s(clue.id)}>
                    <th className="sticky left-0 z-20 min-w-72 border-b border-r border-stone-800 bg-stone-950 p-3 align-top font-normal">
                      <button
                        className="w-full text-left"
                        onClick={() => setPanel({ kind: "clue-detail", clue })}
                        type="button"
                      >
                        <strong className="text-stone-100 hover:text-cyan-200">
                          {s(clue.title)}
                        </strong>
                        <p className="mt-1 max-w-72 whitespace-pre-wrap text-xs leading-5 text-stone-400">
                          {s(clue.relevance_note)}
                        </p>
                        {references.length ? (
                          <div className="mt-2 flex max-w-72 flex-wrap gap-1">
                            {references.slice(0, 3).map((reference, index) => (
                              <span
                                className="citem-badge"
                                key={`${reference.type}-${index}`}
                              >
                                {reference.type}
                              </span>
                            ))}
                            {references.length > 3 ? (
                              <span className="text-[10px] text-stone-500">
                                +{references.length - 3}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="mt-2 block text-[10px] text-stone-600">
                            No supporting material linked yet
                          </span>
                        )}
                      </button>
                    </th>
                    {hypotheses.map((hypothesis) => {
                      const evaluation = evaluations.find(
                        (row) =>
                          s(row.hypothesis_id) === s(hypothesis.id) &&
                          s(row.evidence_item_id) === s(clue.id),
                      );
                      const cellKey = `${s(clue.id)}:${s(hypothesis.id)}`;
                      return (
                        <td
                          className="min-w-56 border-b border-r border-stone-800 p-3 text-center align-middle"
                          key={s(hypothesis.id)}
                        >
                          <MatrixCell
                            projectId={projectId}
                            hypothesis={hypothesis}
                            clue={clue}
                            evaluation={evaluation}
                            open={openCell === cellKey}
                            onToggle={() =>
                              setOpenCell((current) =>
                                current === cellKey ? null : cellKey,
                              )
                            }
                            onClose={() => setOpenCell(null)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!hypotheses.length || !clues.length ? (
            <div className="min-w-[36rem] p-5 text-sm text-stone-500">
              {!hypotheses.length && !clues.length
                ? "Add at least one hypothesis and one clue to start comparing explanations."
                : !hypotheses.length
                  ? "Add a hypothesis column to begin evaluating the existing clues."
                  : "Add a clue row to begin testing the hypotheses."}
            </div>
          ) : null}
        </div>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="citem-label">Current assessment</p>
            <h2 className="mt-2 text-xl font-semibold text-stone-100">
              Analyst judgement
            </h2>
          </div>
          <div className="flex gap-2">
            <span className="citem-badge">
              {s(assessment.assessment_status) || "DRAFT"}
            </span>
            <span className="citem-badge" data-tone="attention">
              {s(assessment.confidence) || "NOT ASSESSED"}
            </span>
          </div>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm text-stone-300">
          {s(assessment.current_judgment) ||
            "No Investigation-level attribution judgement recorded yet."}
        </p>
        <details className="mt-4 rounded border border-stone-800 p-3">
          <summary className="cursor-pointer text-sm text-cyan-300">
            Edit judgement
          </summary>
          <div className="mt-4">
            <InvestigationAssessmentForm
              projectId={projectId}
              row={assessment}
              hypotheses={hypotheses}
            />
          </div>
        </details>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="card">
          <p className="citem-label">Key assumptions</p>
          <div className="mt-3 grid gap-3 text-sm text-stone-300">
            {hypotheses
              .filter((hypothesis) => s(hypothesis.key_assumptions))
              .map((hypothesis, index) => (
                <div key={s(hypothesis.id)}>
                  <strong className="text-xs text-cyan-300">
                    H{index + 1} · {s(hypothesis.title)}
                  </strong>
                  <p className="mt-1 whitespace-pre-wrap">
                    {s(hypothesis.key_assumptions)}
                  </p>
                </div>
              ))}
            {!hypotheses.some((hypothesis) => s(hypothesis.key_assumptions)) ? (
              <p className="text-stone-500">None recorded.</p>
            ) : null}
          </div>
        </article>
        <article className="card">
          <p className="citem-label">Information gaps</p>
          <div className="mt-3 grid gap-3 text-sm text-stone-300">
            {hypotheses
              .filter((hypothesis) => s(hypothesis.information_gaps))
              .map((hypothesis, index) => (
                <div key={s(hypothesis.id)}>
                  <strong className="text-xs text-cyan-300">
                    H{index + 1} · {s(hypothesis.title)}
                  </strong>
                  <p className="mt-1 whitespace-pre-wrap">
                    {s(hypothesis.information_gaps)}
                  </p>
                </div>
              ))}
            {!hypotheses.some((hypothesis) => s(hypothesis.information_gaps)) ? (
              <p className="text-stone-500">None recorded.</p>
            ) : null}
          </div>
        </article>
        <article className="card">
          <p className="citem-label">Alternative explanations</p>
          <p className="mt-3 whitespace-pre-wrap text-sm text-stone-300">
            {s(assessment.alternative_explanations) ||
              "No assessment-level alternatives recorded yet."}
          </p>
        </article>
      </section>

      {panel?.kind === "hypothesis" ? (
        <Drawer
          title={panel.row ? `Edit ${s(panel.row.title)}` : "Add hypothesis"}
          subtitle="Hypotheses are Investigation-scoped competing explanations."
          onClose={closePanel}
        >
          <InvestigationHypothesisForm
            projectId={projectId}
            actors={actors}
            row={panel.row}
            onSuccess={closePanel}
          />
        </Drawer>
      ) : null}

      {panel?.kind === "clue" ? (
        <Drawer
          title="Add clue"
          subtitle="Capture the observation first; link supporting material afterward."
          onClose={closePanel}
        >
          <ClueForm projectId={projectId} onSuccess={closePanel} />
        </Drawer>
      ) : null}

      {panel?.kind === "clue-detail" ? (
        <Drawer
          title={s(panel.clue.title)}
          subtitle={s(panel.clue.relevance_note)}
          onClose={closePanel}
        >
          <div className="space-y-5">
            <section>
              <p className="citem-label">Supporting material</p>
              {((panel.clue.references ?? []) as Reference[]).length ? (
                <ul className="mt-3 grid gap-2 text-sm">
                  {((panel.clue.references ?? []) as Reference[]).map(
                    (reference, index) => (
                      <li
                        className="rounded border border-stone-800 p-3"
                        key={`${reference.href}-${index}`}
                      >
                        <span className="citem-badge">{reference.type}</span>
                        <Link
                          className="mt-2 block text-cyan-300 hover:text-cyan-200"
                          href={reference.href}
                        >
                          {reference.label}
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-stone-500">
                  No supporting material linked yet.
                </p>
              )}
            </section>
            <section className="border-t border-stone-800 pt-5">
              <p className="citem-label">Link material</p>
              <div className="mt-3">
                <ClueReferenceForm
                  projectId={projectId}
                  clueId={s(panel.clue.id)}
                  options={referenceOptions}
                />
              </div>
            </section>
          </div>
        </Drawer>
      ) : null}
    </div>
  );
}
