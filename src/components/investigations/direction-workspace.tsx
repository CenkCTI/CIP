"use client";

import Link from "next/link";
import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";

import {
  createInformationGap,
  createSupportingQuestion,
  createWorkingKnowledge,
  deleteInformationGap,
  deleteSupportingQuestion,
  linkWorkingKnowledgeSupport,
  moveInformationGap,
  moveSupportingQuestion,
  moveWorkingKnowledge,
  unlinkWorkingKnowledgeSupport,
  updateInformationGap,
  updateInvestigationDecisionContext,
  updateInvestigationLifecycle,
  updateInvestigationRequirement,
  updateInvestigationScope,
  updateSupportingQuestion,
  updateWorkingKnowledge,
  withdrawWorkingKnowledge,
} from "@/app/projects/direction-actions";
import {
  investigationGapStatuses,
  investigationQuestionStatuses,
  workingKnowledgeStates,
  type InformationGap,
  type SupportingQuestion,
  type WorkingKnowledge,
  type WorkingKnowledgeSupport,
} from "@/lib/investigations/direction-schema";
import {
  investigationStatuses,
  priorities,
  type Project,
} from "@/lib/projects/schema";

type DirectionState = {
  project: Project;
  questions: SupportingQuestion[];
  gaps: InformationGap[];
  workingKnowledge: WorkingKnowledge[];
  support: WorkingKnowledgeSupport[];
  sourceOptions: Array<{
    id: string;
    title: string;
    source_type: string;
    publisher: string | null;
    verification_state: string;
  }>;
  evidenceOptions: Array<{
    id: string;
    title: string;
    type: string;
    collection_date: string | null;
  }>;
  related: Array<{
    id: string;
    name: string;
    research_question: string | null;
    updated_at: string;
    score: number;
    reasons: string[];
  }>;
};

type SummaryState = {
  ownerLabel: string;
  counts: Record<string, number>;
};

type ActionResult = {
  success?: string;
  error?: string;
};

const splitLines = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

const field = (data: FormData, name: string) => String(data.get(name) ?? "");

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : date.toLocaleDateString();
}

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function Panel({
  eyebrow,
  title,
  action,
  children,
  className = "",
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-900/20 pb-3">
        <div>
          <p className="citem-label">{eyebrow}</p>
          <h3 className="mt-1 text-base font-semibold text-stone-100">{title}</h3>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SmallButton({
  children,
  onClick,
  disabled,
  title,
  danger = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      className={`rounded border px-2.5 py-1.5 text-xs font-medium ${
        danger
          ? "border-red-900/40 text-red-300 hover:bg-red-950/20"
          : "border-stone-800 text-stone-400 hover:border-amber-900/40 hover:text-stone-200"
      }`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type={type}
    >
      {children}
    </button>
  );
}

function StatusBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border border-amber-900/30 bg-amber-950/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-300">
      {children}
    </span>
  );
}

function ScopeChips({ values }: { values: string[] }) {
  if (!values.length) return <span className="text-sm text-stone-600">Not set</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <span
          className="rounded border border-amber-900/25 bg-black/10 px-2.5 py-1 text-xs text-stone-300"
          key={value}
        >
          {value}
        </span>
      ))}
    </div>
  );
}

function EditorBox({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded border border-amber-900/25 bg-black/15 p-4">
      {children}
    </div>
  );
}

export function InvestigationDirectionWorkspace({ project }: { project: Project }) {
  const [data, setData] = useState<DirectionState | null>(null);
  const [summary, setSummary] = useState<SummaryState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editPanel, setEditPanel] = useState<
    "requirement" | "context" | "scope" | "lifecycle" | null
  >(null);

  const load = useCallback(async () => {
    const [directionResponse, summaryResponse] = await Promise.all([
      fetch(`/api/projects/${encodeURIComponent(project.id)}/direction`, {
        cache: "no-store",
        credentials: "same-origin",
      }),
      fetch(`/api/projects/${encodeURIComponent(project.id)}/investigation-summary`, {
        cache: "no-store",
        credentials: "same-origin",
      }),
    ]);

    if (!directionResponse.ok) throw new Error("Direction workspace is unavailable.");
    const next = (await directionResponse.json()) as DirectionState;
    setData(next);
    if (summaryResponse.ok) setSummary((await summaryResponse.json()) as SummaryState);
  }, [project.id]);

  useEffect(() => {
    let mounted = true;
    void load().catch(() => {
      if (mounted) setLoadError("Unable to load Stage 1 direction data. Apply migration 053 and try again.");
    });
    return () => {
      mounted = false;
    };
  }, [load]);

  const run = useCallback(
    (operation: () => Promise<ActionResult>, after?: () => void) => {
      setNotice(null);
      startTransition(() => {
        void (async () => {
          const result = await operation();
          setNotice(result);
          if (!result.error) {
            after?.();
            await load();
          }
        })();
      });
    },
    [load],
  );

  const current = data?.project ?? project;
  const activeKnowledge = useMemo(
    () => (data?.workingKnowledge ?? []).filter((item) => item.state === "ACTIVE"),
    [data?.workingKnowledge],
  );
  const retiredKnowledge = useMemo(
    () => (data?.workingKnowledge ?? []).filter((item) => item.state !== "ACTIVE"),
    [data?.workingKnowledge],
  );

  const supportByKnowledge = useMemo(() => {
    const map = new Map<string, WorkingKnowledgeSupport[]>();
    for (const item of data?.support ?? []) {
      const list = map.get(item.knowledge_id) ?? [];
      list.push(item);
      map.set(item.knowledge_id, list);
    }
    return map;
  }, [data?.support]);

  if (loadError) {
    return <div className="citem-direction-workspace text-sm text-red-300">{loadError}</div>;
  }

  if (!data) {
    return (
      <div className="citem-direction-workspace rounded border border-amber-900/20 bg-black/10 p-5 text-sm text-stone-500">
        Loading Investigation direction…
      </div>
    );
  }

  function submitRequirement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(
      () =>
        updateInvestigationRequirement(project.id, {
          name: field(form, "name"),
          research_question: field(form, "research_question"),
          purpose: field(form, "purpose"),
        }),
      () => setEditPanel(null),
    );
  }

  function submitContext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(
      () =>
        updateInvestigationDecisionContext(project.id, {
          intended_consumer: field(form, "intended_consumer"),
          decision_context: field(form, "decision_context"),
          expected_product_type: field(form, "expected_product_type"),
        }),
      () => setEditPanel(null),
    );
  }

  function submitScope(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(
      () =>
        updateInvestigationScope(project.id, {
          scope_geography: splitLines(form.get("scope_geography")),
          scope_sectors: splitLines(form.get("scope_sectors")),
          scope_activity_types: splitLines(form.get("scope_activity_types")),
          scope_actors: splitLines(form.get("scope_actors")),
          scope_technologies: splitLines(form.get("scope_technologies")),
          scope_time_start: field(form, "scope_time_start") || null,
          scope_time_end: field(form, "scope_time_end") || null,
          out_of_scope: field(form, "out_of_scope"),
        }),
      () => setEditPanel(null),
    );
  }

  function submitLifecycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const due = field(form, "due_at");
    run(
      () =>
        updateInvestigationLifecycle(project.id, {
          investigation_status: field(form, "investigation_status"),
          priority: field(form, "priority"),
          due_at: due ? new Date(due).toISOString() : null,
        }),
      () => setEditPanel(null),
    );
  }

  return (
    <div className="citem-direction-workspace space-y-4">
      <style jsx global>{`
        .card:has(> .citem-direction-workspace) {
          grid-column: 1 / -1;
          overflow: visible;
          border-color: transparent;
          background: transparent;
          box-shadow: none;
          padding: 0;
        }
        .card:has(> .citem-direction-workspace)::after { display: none; }
        .card:has(> .citem-direction-workspace) > h2:first-child { display: none; }
      `}</style>

      <header className="rounded border border-amber-900/30 bg-[linear-gradient(135deg,rgba(185,130,47,0.09),rgba(0,0,0,0.10)_42%,rgba(17,21,24,0.94))] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="citem-label">CİTEM / Stage 1 · Direction</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-100">
              {current.name}
            </h2>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
              <StatusBadge>{current.investigation_status}</StatusBadge>
              <span>{current.priority} priority</span>
              <span>·</span>
              <span>Due {formatDate(current.due_at)}</span>
              <span>·</span>
              <span>Updated {formatDate(current.updated_at)}</span>
              <span>·</span>
              <span>{summary?.ownerLabel ?? "Current analyst"}</span>
            </div>
          </div>
          <SmallButton onClick={() => setEditPanel(editPanel === "lifecycle" ? null : "lifecycle")}>Lifecycle</SmallButton>
        </div>
        {editPanel === "lifecycle" ? (
          <EditorBox>
            <form className="grid gap-4 md:grid-cols-3" onSubmit={submitLifecycle}>
              <label className="text-sm text-stone-300">
                Status
                <select className="field mt-1" defaultValue={current.investigation_status} name="investigation_status">
                  {investigationStatuses.map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
              <label className="text-sm text-stone-300">
                Priority
                <select className="field mt-1" defaultValue={current.priority} name="priority">
                  {priorities.map((value) => <option key={value}>{value}</option>)}
                </select>
                <span className="mt-1 block text-xs text-stone-500">Work urgency, not threat severity.</span>
              </label>
              <label className="text-sm text-stone-300">
                Intelligence deadline
                <input className="field mt-1" defaultValue={toDateTimeLocal(current.due_at)} name="due_at" type="datetime-local" />
              </label>
              <div className="flex justify-end gap-2 md:col-span-3">
                <SmallButton onClick={() => setEditPanel(null)}>Cancel</SmallButton>
                <SmallButton disabled={isPending} type="submit">Save</SmallButton>
              </div>
            </form>
          </EditorBox>
        ) : null}
      </header>

      {notice ? (
        <div
          className={`rounded border px-4 py-3 text-sm ${
            notice.error
              ? "border-red-900/40 bg-red-950/15 text-red-300"
              : "border-emerald-900/30 bg-emerald-950/10 text-emerald-300"
          }`}
          role={notice.error ? "alert" : "status"}
        >
          {notice.error ?? notice.success}
        </div>
      ) : null}

      <section className="overflow-hidden rounded border border-amber-900/30 bg-[linear-gradient(135deg,rgba(185,130,47,0.07),transparent_48%)]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-amber-900/20 px-5 py-4">
          <div>
            <p className="citem-label">Intelligence requirement</p>
            <h3 className="mt-1 text-base font-semibold text-stone-100">What must be understood?</h3>
          </div>
          <SmallButton onClick={() => setEditPanel(editPanel === "requirement" ? null : "requirement")}>Edit</SmallButton>
        </div>
        <div className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.55fr)]">
          <div>
            <p className="citem-label">Primary intelligence question</p>
            <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-stone-200">
              {current.research_question || "No primary intelligence question defined."}
            </p>
          </div>
          <div className="border-l-0 border-amber-900/20 lg:border-l lg:pl-5">
            <p className="citem-label">Purpose / objective</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-400">
              {current.purpose || "Purpose has not been defined yet."}
            </p>
          </div>
        </div>
        {editPanel === "requirement" ? (
          <div className="border-t border-amber-900/20 px-5 pb-5">
            <EditorBox>
              <form className="space-y-4" onSubmit={submitRequirement}>
                <label className="block text-sm text-stone-300">
                  Investigation title
                  <input className="field mt-1" defaultValue={current.name} maxLength={120} name="name" required />
                </label>
                <label className="block text-sm text-stone-300">
                  Primary intelligence question
                  <textarea className="field mt-1 min-h-28" defaultValue={current.research_question ?? ""} maxLength={2000} name="research_question" required />
                </label>
                <label className="block text-sm text-stone-300">
                  Purpose / objective
                  <textarea className="field mt-1 min-h-24" defaultValue={current.purpose ?? ""} maxLength={2000} name="purpose" required />
                </label>
                <div className="flex justify-end gap-2">
                  <SmallButton onClick={() => setEditPanel(null)}>Cancel</SmallButton>
                  <SmallButton disabled={isPending} type="submit">Save requirement</SmallButton>
                </div>
              </form>
            </EditorBox>
          </div>
        ) : null}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          action={<SmallButton onClick={() => setEditPanel(editPanel === "context" ? null : "context")}>Edit</SmallButton>}
          eyebrow="Decision context"
          title="Who will use the answer?"
        >
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="citem-label">Intended consumer</dt>
              <dd className="mt-1 text-stone-300">{current.intended_consumer || "Not specified"}</dd>
            </div>
            <div>
              <dt className="citem-label">Decision / intelligence use</dt>
              <dd className="mt-1 whitespace-pre-wrap leading-6 text-stone-300">{current.decision_context || "Decision context can be added when the intended use is known."}</dd>
            </div>
            <div>
              <dt className="citem-label">Expected product</dt>
              <dd className="mt-1 text-stone-300">{current.expected_product_type || "Not specified"}</dd>
            </div>
          </dl>
          {editPanel === "context" ? (
            <EditorBox>
              <form className="space-y-4" onSubmit={submitContext}>
                <label className="block text-sm text-stone-300">
                  Intended consumer
                  <input className="field mt-1" defaultValue={current.intended_consumer ?? ""} maxLength={500} name="intended_consumer" placeholder="CTI lead, strategic analyst, SOC leadership…" />
                </label>
                <label className="block text-sm text-stone-300">
                  Decision / intelligence use
                  <textarea className="field mt-1 min-h-24" defaultValue={current.decision_context ?? ""} maxLength={4000} name="decision_context" />
                </label>
                <label className="block text-sm text-stone-300">
                  Expected product
                  <input className="field mt-1" defaultValue={current.expected_product_type ?? ""} list="expected-product-suggestions" maxLength={160} name="expected_product_type" />
                  <datalist id="expected-product-suggestions">
                    <option value="Operational Threat Assessment" />
                    <option value="Current Intelligence Brief" />
                    <option value="Threat Actor Assessment" />
                    <option value="Campaign Assessment" />
                    <option value="Warning Note" />
                    <option value="Technical Intelligence Note" />
                  </datalist>
                </label>
                <div className="flex justify-end gap-2">
                  <SmallButton onClick={() => setEditPanel(null)}>Cancel</SmallButton>
                  <SmallButton disabled={isPending} type="submit">Save context</SmallButton>
                </div>
              </form>
            </EditorBox>
          ) : null}
        </Panel>

        <Panel
          action={<SmallButton onClick={() => setEditPanel(editPanel === "scope" ? null : "scope")}>Edit</SmallButton>}
          eyebrow="Scope"
          title="Research boundaries"
        >
          <div className="space-y-4">
            <div><p className="citem-label">Geography</p><div className="mt-2"><ScopeChips values={current.scope_geography} /></div></div>
            <div><p className="citem-label">Sectors / target environment</p><div className="mt-2"><ScopeChips values={current.scope_sectors} /></div></div>
            <div><p className="citem-label">Activity / threat types</p><div className="mt-2"><ScopeChips values={current.scope_activity_types} /></div></div>
            <div><p className="citem-label">Actors / activity clusters</p><div className="mt-2"><ScopeChips values={current.scope_actors} /></div></div>
            <div><p className="citem-label">Technologies / environments</p><div className="mt-2"><ScopeChips values={current.scope_technologies} /></div></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><p className="citem-label">Time start</p><p className="mt-1 text-sm text-stone-300">{current.scope_time_start || "Not set"}</p></div>
              <div><p className="citem-label">Time end</p><p className="mt-1 text-sm text-stone-300">{current.scope_time_end || "Not set"}</p></div>
            </div>
            <div><p className="citem-label">Explicitly out of scope</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-300">{current.out_of_scope || "No explicit exclusions defined."}</p></div>
          </div>
          {editPanel === "scope" ? (
            <EditorBox>
              <form className="space-y-4" onSubmit={submitScope}>
                <p className="text-xs leading-5 text-stone-500">One item per line. Scope guides collection; it never blocks an analyst from following a relevant lead.</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-stone-300">Geography<textarea className="field mt-1 min-h-20" defaultValue={current.scope_geography.join("\n")} name="scope_geography" /></label>
                  <label className="text-sm text-stone-300">Sectors<textarea className="field mt-1 min-h-20" defaultValue={current.scope_sectors.join("\n")} name="scope_sectors" /></label>
                  <label className="text-sm text-stone-300">Activity types<textarea className="field mt-1 min-h-20" defaultValue={current.scope_activity_types.join("\n")} name="scope_activity_types" /></label>
                  <label className="text-sm text-stone-300">Actors / clusters<textarea className="field mt-1 min-h-20" defaultValue={current.scope_actors.join("\n")} name="scope_actors" /></label>
                  <label className="text-sm text-stone-300">Technologies<textarea className="field mt-1 min-h-20" defaultValue={current.scope_technologies.join("\n")} name="scope_technologies" /></label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm text-stone-300">Start<input className="field mt-1" defaultValue={current.scope_time_start ?? ""} name="scope_time_start" type="date" /></label>
                    <label className="text-sm text-stone-300">End<input className="field mt-1" defaultValue={current.scope_time_end ?? ""} name="scope_time_end" type="date" /></label>
                  </div>
                </div>
                <label className="block text-sm text-stone-300">Explicitly out of scope<textarea className="field mt-1 min-h-20" defaultValue={current.out_of_scope ?? ""} maxLength={2000} name="out_of_scope" /></label>
                <div className="flex justify-end gap-2">
                  <SmallButton onClick={() => setEditPanel(null)}>Cancel</SmallButton>
                  <SmallButton disabled={isPending} type="submit">Save scope</SmallButton>
                </div>
              </form>
            </EditorBox>
          ) : null}
        </Panel>
      </div>

      <Panel eyebrow="Intelligence questions" title="Primary + supporting questions">
        <div className="rounded border border-amber-900/20 bg-black/10 p-4">
          <p className="citem-label">Primary</p>
          <p className="mt-2 text-sm leading-6 text-stone-200">{current.research_question}</p>
        </div>
        <div className="mt-4 space-y-3">
          {data.questions.length ? data.questions.map((question, index) => (
            <details className="rounded border border-stone-800/70 bg-black/10 p-3" key={question.id}>
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <span className="font-mono text-amber-400">?</span>
                  <div><p className="text-sm leading-6 text-stone-300">{question.question}</p><div className="mt-2"><StatusBadge>{question.status}</StatusBadge></div></div>
                </div>
                <span className="text-xs text-stone-600">Edit</span>
              </summary>
              <div className="mt-4 border-t border-stone-800/70 pt-4">
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    run(() => updateSupportingQuestion(project.id, { id: question.id, question: field(form, "question"), status: field(form, "status") }));
                  }}
                >
                  <textarea className="field min-h-20" defaultValue={question.question} name="question" />
                  <div className="flex flex-wrap items-center gap-2">
                    <select className="field max-w-xs" defaultValue={question.status} name="status">{investigationQuestionStatuses.map((value) => <option key={value}>{value}</option>)}</select>
                    <SmallButton disabled={index === 0 || isPending} onClick={() => run(() => moveSupportingQuestion(project.id, { id: question.id, direction: "UP" }))}>↑</SmallButton>
                    <SmallButton disabled={index === data.questions.length - 1 || isPending} onClick={() => run(() => moveSupportingQuestion(project.id, { id: question.id, direction: "DOWN" }))}>↓</SmallButton>
                    <SmallButton disabled={isPending} type="submit">Save</SmallButton>
                    <SmallButton danger disabled={isPending} onClick={() => run(() => deleteSupportingQuestion(project.id, { id: question.id }))}>Delete</SmallButton>
                  </div>
                </form>
              </div>
            </details>
          )) : <p className="text-sm text-stone-500">No supporting questions yet. Add them when the primary question needs decomposition.</p>}
        </div>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            const formElement = event.currentTarget;
            const form = new FormData(formElement);
            run(() => createSupportingQuestion(project.id, { question: field(form, "question") }), () => formElement.reset());
          }}
        >
          <input className="field" name="question" placeholder="Add a supporting intelligence question" />
          <button className="citem-button shrink-0" disabled={isPending} type="submit">Add question</button>
        </form>
      </Panel>

      <Panel eyebrow="Current understanding" title="Working knowledge and information gaps">
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded border border-stone-800/70 bg-black/10 p-4">
            <div className="flex items-center justify-between gap-3"><div><p className="citem-label">Working knowledge</p><p className="mt-1 text-xs text-stone-500">Working context, not automatically verified fact.</p></div><span className="text-xs text-stone-600">{activeKnowledge.length} active</span></div>
            <div className="mt-4 space-y-3">
              {activeKnowledge.length ? activeKnowledge.map((item, index) => {
                const supports = supportByKnowledge.get(item.id) ?? [];
                return (
                  <details className="rounded border border-stone-800/70 p-3" key={item.id}>
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-start gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-stone-500" /><div className="min-w-0"><p className="text-sm leading-6 text-stone-300">{item.statement}</p><p className="mt-1 text-xs text-stone-600">{supports.length} support link{supports.length === 1 ? "" : "s"}</p></div></div>
                    </summary>
                    <div className="mt-4 space-y-4 border-t border-stone-800/70 pt-4">
                      <form
                        className="space-y-3"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const form = new FormData(event.currentTarget);
                          run(() => updateWorkingKnowledge(project.id, { id: item.id, statement: field(form, "statement"), state: field(form, "state") }));
                        }}
                      >
                        <textarea className="field min-h-20" defaultValue={item.statement} name="statement" />
                        <div className="flex flex-wrap gap-2">
                          <select className="field max-w-xs" defaultValue={item.state} name="state">{workingKnowledgeStates.map((value) => <option key={value}>{value}</option>)}</select>
                          <SmallButton disabled={index === 0 || isPending} onClick={() => run(() => moveWorkingKnowledge(project.id, { id: item.id, direction: "UP" }))}>↑</SmallButton>
                          <SmallButton disabled={index === activeKnowledge.length - 1 || isPending} onClick={() => run(() => moveWorkingKnowledge(project.id, { id: item.id, direction: "DOWN" }))}>↓</SmallButton>
                          <SmallButton disabled={isPending} type="submit">Save</SmallButton>
                          <SmallButton danger disabled={isPending} onClick={() => run(() => withdrawWorkingKnowledge(project.id, { id: item.id }))}>Withdraw</SmallButton>
                        </div>
                      </form>

                      <div>
                        <p className="citem-label">Support</p>
                        <div className="mt-2 space-y-2">
                          {supports.length ? supports.map((support) => {
                            const source = data.sourceOptions.find((option) => option.id === support.source_id);
                            const evidence = data.evidenceOptions.find((option) => option.id === support.evidence_id);
                            return (
                              <div className="flex items-start justify-between gap-3 rounded border border-stone-800/60 px-3 py-2" key={support.id}>
                                <div><p className="text-xs text-stone-300">{source ? `Source · ${source.title}` : evidence ? `Evidence · ${evidence.title}` : "Linked support"}</p>{support.analyst_note ? <p className="mt-1 text-xs text-stone-600">{support.analyst_note}</p> : null}</div>
                                <SmallButton disabled={isPending} onClick={() => run(() => unlinkWorkingKnowledgeSupport(project.id, { id: support.id }))}>Unlink</SmallButton>
                              </div>
                            );
                          }) : <p className="text-xs text-stone-600">No Source or Evidence linked. Unlinked working knowledge remains valid as analyst context.</p>}
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <form
                            className="space-y-2"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const formElement = event.currentTarget;
                              const form = new FormData(formElement);
                              const sourceId = field(form, "source_id");
                              if (!sourceId) return;
                              run(() => linkWorkingKnowledgeSupport(project.id, { knowledge_id: item.id, source_id: sourceId, evidence_id: null, analyst_note: field(form, "analyst_note") }), () => formElement.reset());
                            }}
                          >
                            <select className="field" name="source_id" defaultValue=""><option value="">Link a Source…</option>{data.sourceOptions.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}</select>
                            <input className="field" maxLength={2000} name="analyst_note" placeholder="Optional analyst note" />
                            <SmallButton disabled={isPending} type="submit">Link source</SmallButton>
                          </form>
                          <form
                            className="space-y-2"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const formElement = event.currentTarget;
                              const form = new FormData(formElement);
                              const evidenceId = field(form, "evidence_id");
                              if (!evidenceId) return;
                              run(() => linkWorkingKnowledgeSupport(project.id, { knowledge_id: item.id, source_id: null, evidence_id: evidenceId, analyst_note: field(form, "analyst_note") }), () => formElement.reset());
                            }}
                          >
                            <select className="field" name="evidence_id" defaultValue=""><option value="">Link Evidence…</option>{data.evidenceOptions.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}</select>
                            <input className="field" maxLength={2000} name="analyst_note" placeholder="Optional analyst note" />
                            <SmallButton disabled={isPending} type="submit">Link evidence</SmallButton>
                          </form>
                        </div>
                      </div>
                    </div>
                  </details>
                );
              }) : <p className="text-sm text-stone-500">No working knowledge recorded yet.</p>}
            </div>
            <form
              className="mt-4 flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                const formElement = event.currentTarget;
                const form = new FormData(formElement);
                run(() => createWorkingKnowledge(project.id, { statement: field(form, "statement") }), () => formElement.reset());
              }}
            >
              <input className="field" name="statement" placeholder="Add working knowledge" />
              <button className="citem-button shrink-0" disabled={isPending} type="submit">Add</button>
            </form>
            {retiredKnowledge.length ? (
              <details className="mt-4 border-t border-stone-800/70 pt-3">
                <summary className="cursor-pointer text-xs text-stone-500">Retired working knowledge ({retiredKnowledge.length})</summary>
                <div className="mt-3 space-y-2">{retiredKnowledge.map((item) => <div className="rounded border border-stone-800/60 p-3" key={item.id}><div className="flex items-start justify-between gap-2"><p className="text-sm text-stone-500">{item.statement}</p><StatusBadge>{item.state}</StatusBadge></div></div>)}</div>
              </details>
            ) : null}
          </section>

          <section className="rounded border border-stone-800/70 bg-black/10 p-4">
            <div className="flex items-center justify-between gap-3"><div><p className="citem-label">Information gaps</p><p className="mt-1 text-xs text-stone-500">Unknowns that may later drive Collection.</p></div><span className="text-xs text-stone-600">{data.gaps.length} total</span></div>
            <div className="mt-4 space-y-3">
              {data.gaps.length ? data.gaps.map((gap, index) => (
                <details className="rounded border border-stone-800/70 p-3" key={gap.id}>
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3"><div className="flex gap-3"><span className="font-mono text-amber-400">?</span><div><p className="text-sm leading-6 text-stone-300">{gap.description}</p><div className="mt-2"><StatusBadge>{gap.status}</StatusBadge></div></div></div><span className="text-xs text-stone-600">Edit</span></summary>
                  <form
                    className="mt-4 space-y-3 border-t border-stone-800/70 pt-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      run(() => updateInformationGap(project.id, { id: gap.id, description: field(form, "description"), status: field(form, "status") }));
                    }}
                  >
                    <textarea className="field min-h-20" defaultValue={gap.description} name="description" />
                    <div className="flex flex-wrap gap-2">
                      <select className="field max-w-xs" defaultValue={gap.status} name="status">{investigationGapStatuses.map((value) => <option key={value}>{value}</option>)}</select>
                      <SmallButton disabled={index === 0 || isPending} onClick={() => run(() => moveInformationGap(project.id, { id: gap.id, direction: "UP" }))}>↑</SmallButton>
                      <SmallButton disabled={index === data.gaps.length - 1 || isPending} onClick={() => run(() => moveInformationGap(project.id, { id: gap.id, direction: "DOWN" }))}>↓</SmallButton>
                      <SmallButton disabled={isPending} type="submit">Save</SmallButton>
                      <SmallButton danger disabled={isPending} onClick={() => run(() => deleteInformationGap(project.id, { id: gap.id }))}>Delete</SmallButton>
                    </div>
                  </form>
                </details>
              )) : <p className="text-sm text-stone-500">No information gaps recorded yet.</p>}
            </div>
            <form
              className="mt-4 flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                const formElement = event.currentTarget;
                const form = new FormData(formElement);
                run(() => createInformationGap(project.id, { description: field(form, "description") }), () => formElement.reset());
              }}
            >
              <input className="field" name="description" placeholder="Add an information gap" />
              <button className="citem-button shrink-0" disabled={isPending} type="submit">Add gap</button>
            </form>
          </section>
        </div>
      </Panel>

      <Panel eyebrow="Related intelligence" title="Potentially relevant previous Investigations">
        {data.related.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.related.map((candidate) => (
              <Link className="rounded border border-stone-800/70 bg-black/10 p-4 hover:border-amber-900/35" href={`/projects/${candidate.id}`} key={candidate.id}>
                <p className="font-medium text-stone-200">{candidate.name}</p>
                {candidate.research_question ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-stone-500">{candidate.research_question}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">{candidate.reasons.map((reason) => <span className="rounded border border-stone-800 px-2 py-1 text-[10px] text-stone-500" key={reason}>{reason}</span>)}</div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-stone-500">No related Investigation candidates were found from deterministic scope, tag, title, and question overlap. Nothing is linked automatically.</p>
        )}
      </Panel>

      <Panel eyebrow="Investigation content" title="Existing workspace records">
        {summary ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(summary.counts).map(([label, count]) => (
              <div className="rounded border border-stone-800/70 bg-black/10 p-3" key={label}>
                <p className="text-xs text-stone-500">{label}</p>
                <p className="mt-1 text-lg font-semibold text-stone-200">{count}</p>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-stone-500">Workspace counts are loading independently.</p>}
        {current.current_assessment ? (
          <div className="mt-4 rounded border border-stone-800/70 bg-black/10 p-4">
            <p className="citem-label">Existing current assessment</p>
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-stone-400">{current.current_assessment}</p>
            <p className="mt-2 text-xs text-stone-600">Assessment remains a later analytical stage and is not required by Direction.</p>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
