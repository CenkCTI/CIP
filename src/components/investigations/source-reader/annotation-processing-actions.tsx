"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createAnnotationOutput,
  linkAnnotationOutput,
  setAnnotationProcessingState,
  unlinkAnnotationOutput,
} from "@/app/projects/[id]/source-processing-actions";
import { AnnotationTimelineActions } from "@/components/investigations/source-reader/annotation-timeline-actions";
import { extractIndicatorCandidatesFromText } from "@/lib/processing/indicator-extraction";
import {
  mappingOrigins,
  type AnnotationProcessingState,
  type MappingOrigin,
  type ProcessingActionState,
  type ProcessingDestination,
} from "@/lib/processing/types";

type Row = Record<string, unknown>;
type ProcessingOptions = {
  indicator: Row[];
  malware: Row[];
  cve: Row[];
  mitre: Row[];
  campaign: Row[];
  actor: Row[];
};

const text = (value: unknown) => String(value ?? "");

const destinationLabels: Record<ProcessingDestination | "timeline", string> = {
  timeline: "Timeline Event",
  indicator: "Indicator / IOC",
  malware: "Malware",
  cve: "CVE",
  mitre: "MITRE ATT&CK",
  campaign: "Campaign identity",
  actor: "Threat Actor identity",
  attribution_claim: "Attribution Claim",
};

function optionLabel(destination: ProcessingDestination, row: Row) {
  if (destination === "indicator") return `${text(row.type)} · ${text(row.value)}`;
  if (destination === "malware") return text(row.name);
  if (destination === "cve") return `${text(row.cve_id)} · ${text(row.severity)}`;
  if (destination === "mitre") return `${text(row.technique_id)} · ${text(row.technique_name)}`;
  if (destination === "campaign") return text(row.name);
  if (destination === "actor") {
    const aliases = Array.isArray(row.aliases)
      ? row.aliases.map(text).filter(Boolean)
      : [];
    return aliases.length
      ? `${text(row.name)} · ${aliases.slice(0, 2).join(", ")}`
      : text(row.name);
  }
  return "";
}

function outputHref(
  projectId: string,
  sourceId: string,
  annotationId: string,
  output: Row,
) {
  const type = text(output.output_type);
  if (type === "INDICATOR")
    return `/projects/${projectId}/indicators/${text(output.indicator_id)}`;
  if (type === "MALWARE")
    return `/projects/${projectId}/malware/${text(output.malware_id)}`;
  if (type === "CVE")
    return `/projects/${projectId}/cves/${text(output.cve_id)}`;
  if (type === "MITRE_TECHNIQUE")
    return `/projects/${projectId}/mitre/${text(output.mitre_technique_id)}`;
  if (type === "CAMPAIGN")
    return `/projects/${projectId}/campaigns/${text(output.campaign_id)}`;
  if (type === "THREAT_ACTOR")
    return `/projects/${projectId}/actors/${text(output.threat_actor_id)}`;
  return `/projects/${projectId}/sources/${sourceId}?annotation=${annotationId}`;
}

function defaultOrigin(destination: ProcessingDestination): MappingOrigin {
  return destination === "mitre" || destination === "actor"
    ? "ANALYST_MAPPED"
    : "SOURCE_EXPLICIT";
}

function StatusBadge({ state }: { state: AnnotationProcessingState }) {
  const tone =
    state === "PROCESSED"
      ? "border-emerald-900/70 bg-emerald-950/20 text-emerald-300"
      : state === "IGNORED"
        ? "border-stone-700 bg-stone-950/60 text-stone-500"
        : "border-amber-900/70 bg-amber-950/10 text-amber-300";
  return (
    <span
      className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${tone}`}
    >
      {state}
    </span>
  );
}

function CreateFields({
  destination,
  annotation,
  candidate,
}: {
  destination: ProcessingDestination;
  annotation: Row;
  candidate?: { observedValue: string; canonicalValue: string; type: string } | null;
}) {
  const excerpt = text(annotation.selected_text) || text(annotation.comment);
  const cve = excerpt.match(/CVE-\d{4}-\d{4,}/i)?.[0]?.toUpperCase() ?? "";
  const technique =
    excerpt.match(/\bT\d{4}(?:\.\d{3})?\b/i)?.[0]?.toUpperCase() ?? "";

  if (destination === "indicator") {
    return (
      <>
        <div className="grid gap-2 md:grid-cols-[150px_minmax(0,1fr)]">
          <label className="grid gap-1">
            <span className="citem-label">Type</span>
            <select
              className="field"
              name="type"
              defaultValue={candidate?.type ?? "DOMAIN"}
            >
              {["IP", "CIDR", "DOMAIN", "URL", "HASH", "EMAIL", "FILE", "REGISTRY"].map(
                (type) => (
                  <option key={type}>{type}</option>
                ),
              )}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="citem-label">Observed value</span>
            <input
              className="field font-mono"
              name="value"
              required
              defaultValue={candidate?.observedValue ?? ""}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
        </div>
        <details className="rounded border border-stone-800 bg-black/10 p-3">
          <summary className="cursor-pointer text-xs text-stone-500">
            Temporal context
          </summary>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <label className="grid gap-1">
              <span className="citem-label">First seen</span>
              <input className="field" name="first_seen" type="datetime-local" />
            </label>
            <label className="grid gap-1">
              <span className="citem-label">Last seen</span>
              <input className="field" name="last_seen" type="datetime-local" />
            </label>
          </div>
        </details>
      </>
    );
  }

  if (destination === "malware") {
    return (
      <>
        <label className="grid gap-1">
          <span className="citem-label">Malware / tool name</span>
          <input className="field" name="name" required maxLength={180} />
        </label>
        <label className="grid gap-1">
          <span className="citem-label">Family / classification</span>
          <input className="field" name="family" maxLength={180} />
        </label>
        <label className="grid gap-1">
          <span className="citem-label">Description</span>
          <textarea
            className="field min-h-20"
            name="description"
            defaultValue={excerpt}
          />
        </label>
        <details className="rounded border border-stone-800 bg-black/10 p-3">
          <summary className="cursor-pointer text-xs text-stone-500">
            Technical details
          </summary>
          <div className="mt-3 grid gap-2">
            <textarea
              className="field min-h-20"
              name="behavior"
              placeholder="Reported technical behavior…"
            />
            {["md5", "sha1", "sha256"].map((algorithm) => (
              <input
                key={algorithm}
                className="field font-mono"
                name={algorithm}
                placeholder={algorithm.toUpperCase()}
              />
            ))}
          </div>
        </details>
      </>
    );
  }

  if (destination === "cve") {
    return (
      <>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="grid gap-1">
            <span className="citem-label">CVE ID</span>
            <input
              className="field font-mono"
              name="cve_id"
              required
              defaultValue={cve}
            />
          </label>
          <label className="grid gap-1">
            <span className="citem-label">Severity</span>
            <select className="field" name="severity" required defaultValue="">
              <option value="" disabled>
                Select only if known
              </option>
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((severity) => (
                <option key={severity}>{severity}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="grid gap-1">
          <span className="citem-label">Affected product</span>
          <input className="field" name="affected_product" maxLength={300} />
        </label>
        <label className="grid gap-1">
          <span className="citem-label">Description</span>
          <textarea
            className="field min-h-20"
            name="description"
            defaultValue={excerpt}
          />
        </label>
        <label className="grid gap-1">
          <span className="citem-label">Exploit status</span>
          <select className="field" name="exploit_status" defaultValue="NONE">
            {["NONE", "POC", "WEAPONIZED", "ACTIVE_EXPLOITATION"].map(
              (status) => (
                <option key={status}>{status}</option>
              ),
            )}
          </select>
        </label>
        <p className="text-xs leading-5 text-stone-600">
          Legacy CVE records require severity. Do not invent it: if severity is not
          supported by the source/reference context, link an existing CVE or leave
          creation for later normalization.
        </p>
      </>
    );
  }

  if (destination === "mitre") {
    return (
      <>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="grid gap-1">
            <span className="citem-label">Technique ID</span>
            <input
              className="field font-mono"
              name="technique_id"
              required
              defaultValue={technique}
            />
          </label>
          <label className="grid gap-1">
            <span className="citem-label">Technique name</span>
            <input className="field" name="technique_name" required />
          </label>
        </div>
        <label className="grid gap-1">
          <span className="citem-label">Tactic</span>
          <input
            className="field"
            name="tactic"
            required
            placeholder="e.g. Defense Evasion"
          />
        </label>
        <label className="grid gap-1">
          <span className="citem-label">Description</span>
          <textarea
            className="field min-h-20"
            name="description"
            defaultValue={excerpt}
          />
        </label>
        <label className="grid gap-1">
          <span className="citem-label">Mapping origin</span>
          <select
            className="field"
            name="mapping_origin"
            defaultValue="ANALYST_MAPPED"
          >
            {mappingOrigins.map((origin) => (
              <option key={origin}>{origin}</option>
            ))}
          </select>
        </label>
      </>
    );
  }

  if (destination === "campaign") {
    return (
      <>
        <label className="grid gap-1">
          <span className="citem-label">
            Source-reported Campaign / activity name
          </span>
          <input className="field" name="name" required maxLength={180} />
        </label>
        <label className="grid gap-1">
          <span className="citem-label">Source-derived description</span>
          <textarea
            className="field min-h-24"
            name="description"
            defaultValue={excerpt}
          />
        </label>
        <p className="text-xs leading-5 text-stone-600">
          Create this only when the source explicitly identifies the Campaign or
          named activity. Correlating separate events into one Campaign belongs to
          Operational Picture analysis.
        </p>
      </>
    );
  }

  if (destination === "actor") {
    return (
      <>
        <label className="grid gap-1">
          <span className="citem-label">Canonical tracked name</span>
          <input className="field" name="name" required maxLength={180} />
        </label>
        <label className="grid gap-1">
          <span className="citem-label">Aliases</span>
          <input
            className="field"
            name="aliases"
            placeholder="Forest Blizzard, Fancy Bear"
          />
        </label>
        <label className="grid gap-1">
          <span className="citem-label">Reported country / association</span>
          <input className="field" name="country" />
        </label>
        <label className="grid gap-1">
          <span className="citem-label">Factual profile description</span>
          <textarea
            className="field min-h-24"
            name="description"
            defaultValue={excerpt}
          />
        </label>
        <p className="text-xs leading-5 text-stone-600">
          This records an identity/profile only. It does not attribute the current
          activity to that actor.
        </p>
      </>
    );
  }

  return (
    <>
      <label className="grid gap-1">
        <span className="citem-label">Actor wording used by the source</span>
        <input
          className="field"
          name="claimed_actor_text"
          required
          maxLength={500}
        />
      </label>
      <label className="grid gap-1">
        <span className="citem-label">Claim summary</span>
        <textarea
          className="field min-h-24"
          name="claim_summary"
          required
          defaultValue={excerpt}
        />
      </label>
    </>
  );
}

export function AnnotationProcessingActions({
  projectId,
  sourceId,
  annotation,
  events,
  timelineLinks,
  outputs,
  options,
}: {
  projectId: string;
  sourceId: string;
  annotation: Row;
  events: Row[];
  timelineLinks: Row[];
  outputs: Row[];
  options: ProcessingOptions;
}) {
  const router = useRouter();
  const state = (text(annotation.processing_state) ||
    "UNPROCESSED") as AnnotationProcessingState;
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState<
    ProcessingDestination | "timeline"
  >("timeline");
  const [selectedTarget, setSelectedTarget] = useState("");
  const [origin, setOrigin] = useState<MappingOrigin>("SOURCE_EXPLICIT");
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const [ignoreReason, setIgnoreReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<ProcessingActionState>({});
  const excerpt = text(annotation.selected_text) || text(annotation.comment);
  const candidates = useMemo(
    () => extractIndicatorCandidatesFromText(excerpt),
    [excerpt],
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const candidate = candidates[candidateIndex] ?? null;

  const existing =
    destination === "timeline" || destination === "attribution_claim"
      ? []
      : options[destination];

  function runState(next: AnnotationProcessingState, note = "") {
    startTransition(async () => {
      const result = await setAnnotationProcessingState(
        projectId,
        sourceId,
        text(annotation.id),
        next,
        note,
      );
      setMessage(result);
      if (result.success) {
        setIgnoreOpen(false);
        setIgnoreReason("");
        router.refresh();
      }
    });
  }

  function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (destination === "timeline") return;
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createAnnotationOutput(
        projectId,
        sourceId,
        text(annotation.id),
        destination,
        formData,
      );
      setMessage(result);
      if (result.success) router.refresh();
    });
  }

  function linkExisting() {
    if (
      destination === "timeline" ||
      destination === "attribution_claim" ||
      !selectedTarget
    )
      return;
    startTransition(async () => {
      const result = await linkAnnotationOutput(
        projectId,
        sourceId,
        text(annotation.id),
        destination,
        selectedTarget,
        origin,
      );
      setMessage(result);
      if (result.success) {
        setSelectedTarget("");
        router.refresh();
      }
    });
  }

  return (
    <div
      className="mt-3 border-t border-stone-800 pt-3"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="citem-label">Processing</span>
          <StatusBadge state={state} />
        </div>
        <button
          className="text-xs font-medium text-amber-300 hover:text-amber-200"
          type="button"
          onClick={() => setOpen(true)}
        >
          Process / Extract
        </button>
      </div>

      {timelineLinks.length || outputs.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {timelineLinks.map((link) => (
            <Link
              key={text(link.id)}
              className="citem-badge hover:border-amber-700 hover:text-amber-200"
              href={`/projects/${projectId}/timeline/${text(link.timeline_event_id)}`}
            >
              Timeline ·{" "}
              {text((link.timeline_events as Row)?.event_name) || "Event"}
            </Link>
          ))}
          {outputs.map((output) => (
            <span
              className="inline-flex max-w-full items-center gap-1 rounded border border-stone-800 bg-black/10 px-2 py-1 text-[11px] text-stone-400"
              key={text(output.id)}
            >
              <Link
                className="max-w-52 truncate hover:text-amber-200"
                href={outputHref(
                  projectId,
                  sourceId,
                  text(annotation.id),
                  output,
                )}
              >
                {text(output.target_label)}
              </Link>
              <button
                className="text-stone-700 hover:text-red-300"
                type="button"
                aria-label="Unlink annotation output"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await unlinkAnnotationOutput(
                      projectId,
                      sourceId,
                      text(annotation.id),
                      text(output.id),
                    );
                    setMessage(result);
                    if (result.success) router.refresh();
                  })
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-stone-600">
          No structured outputs yet. Processing state remains analyst-controlled.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {state === "UNPROCESSED" ? (
          <>
            <button
              className="citem-button-ghost min-h-0 px-2.5 py-1.5 text-xs"
              type="button"
              disabled={pending}
              onClick={() => runState("PROCESSED")}
            >
              Mark processed
            </button>
            <button
              className="min-h-0 px-2 py-1 text-xs text-stone-500 hover:text-stone-300"
              type="button"
              onClick={() => setIgnoreOpen((current) => !current)}
            >
              Ignore
            </button>
          </>
        ) : (
          <button
            className="citem-button-ghost min-h-0 px-2.5 py-1.5 text-xs"
            type="button"
            disabled={pending}
            onClick={() => runState("UNPROCESSED")}
          >
            Reopen
          </button>
        )}
      </div>

      {ignoreOpen ? (
        <div className="mt-2 grid gap-2 rounded border border-stone-800 bg-black/10 p-2">
          <textarea
            className="field min-h-16 text-xs"
            value={ignoreReason}
            onChange={(event) => setIgnoreReason(event.currentTarget.value)}
            placeholder="Why is this annotation not relevant for structured processing?"
            maxLength={4000}
          />
          <button
            className="citem-button-ghost min-h-0 justify-self-start px-2.5 py-1.5 text-xs"
            type="button"
            disabled={pending || !ignoreReason.trim()}
            onClick={() => runState("IGNORED", ignoreReason)}
          >
            Confirm ignore
          </button>
        </div>
      ) : null}

      {annotation.processing_note ? (
        <p className="mt-2 text-[11px] leading-5 text-stone-600">
          Processing note: {text(annotation.processing_note)}
        </p>
      ) : null}
      {message.error ? (
        <p className="mt-2 text-xs text-red-300">{message.error}</p>
      ) : null}
      {message.success ? (
        <p className="mt-2 text-xs text-emerald-300">{message.success}</p>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <section
            className="w-full max-w-4xl overflow-hidden rounded-lg border border-amber-900/40 bg-[#0f1417] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Process source annotation"
          >
            <header className="flex items-start justify-between gap-4 border-b border-stone-800 p-4">
              <div>
                <p className="citem-label">Stage 3 · Processing</p>
                <h2 className="mt-1 text-xl font-semibold text-stone-100">
                  Process source annotation
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-500">
                  Structure what the source reports. Reliability, corroboration,
                  Campaign reconstruction and attribution judgement remain later
                  analytical work.
                </p>
              </div>
              <button
                className="citem-button-ghost min-h-0 px-3 py-1.5"
                type="button"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </header>

            <div className="grid max-h-[82vh] overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)]">
              <aside className="overflow-y-auto border-b border-stone-800 p-4 lg:border-b-0 lg:border-r">
                <p className="citem-label">Source wording</p>
                <blockquote className="mt-2 max-h-40 overflow-y-auto border-l-2 border-amber-800/60 pl-3 text-xs leading-5 text-stone-500">
                  {excerpt ||
                    "Region annotation — no extracted text. Use the analyst note and source page as context."}
                </blockquote>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-stone-700">
                  Page {text(annotation.page_number) || "—"} ·{" "}
                  {text(annotation.annotation_type)}
                </p>

                <p className="citem-label mt-5">Destination</p>
                <div className="mt-2 grid gap-1">
                  {([
                    "timeline",
                    "indicator",
                    "malware",
                    "cve",
                    "mitre",
                    "campaign",
                    "actor",
                    "attribution_claim",
                  ] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={
                        "rounded border px-3 py-2 text-left text-xs transition " +
                        (destination === item
                          ? "border-amber-900/60 bg-amber-950/10 text-amber-200"
                          : "border-transparent text-stone-500 hover:border-stone-800 hover:text-stone-300")
                      }
                      onClick={() => {
                        setDestination(item);
                        setSelectedTarget("");
                        if (
                          item !== "timeline" &&
                          item !== "attribution_claim"
                        ) {
                          setOrigin(defaultOrigin(item));
                        }
                      }}
                    >
                      {destinationLabels[item]}
                    </button>
                  ))}
                </div>
              </aside>

              <main className="overflow-y-auto p-4">
                {destination === "timeline" ? (
                  <div>
                    <p className="citem-label">Temporal record</p>
                    <p className="mt-1 text-xs leading-5 text-stone-600">
                      Create a new event or attach this exact annotation to an
                      existing event. CITEM never merges events automatically.
                    </p>
                    <AnnotationTimelineActions
                      projectId={projectId}
                      sourceId={sourceId}
                      annotation={annotation}
                      events={events}
                      links={timelineLinks}
                    />
                  </div>
                ) : (
                  <div className="space-y-5">
                    {destination === "indicator" && candidates.length ? (
                      <section className="rounded border border-stone-800 bg-black/10 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="citem-label">Detected candidates</p>
                            <p className="mt-1 text-xs text-stone-600">
                              Suggestions only — nothing is saved automatically.
                            </p>
                          </div>
                          <span className="font-mono text-xs text-stone-600">
                            {candidates.length}
                          </span>
                        </div>
                        <div className="mt-3 flex max-h-32 flex-wrap gap-2 overflow-y-auto">
                          {candidates.map((item, index) => (
                            <button
                              className={
                                "rounded border px-2 py-1 font-mono text-[11px] " +
                                (candidateIndex === index
                                  ? "border-amber-800/70 bg-amber-950/10 text-amber-200"
                                  : "border-stone-800 text-stone-500")
                              }
                              type="button"
                              key={`${item.type}:${item.canonicalValue}`}
                              onClick={() => setCandidateIndex(index)}
                            >
                              {item.type} · {item.observedValue}
                            </button>
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {destination !== "attribution_claim" ? (
                      <section className="rounded border border-stone-800 bg-black/10 p-3">
                        <p className="citem-label">Link existing</p>
                        <p className="mt-1 text-xs leading-5 text-stone-600">
                          This records provenance only. It does not create a new
                          semantic relationship between the entities.
                        </p>
                        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_190px_auto]">
                          <select
                            className="field"
                            value={selectedTarget}
                            onChange={(event) =>
                              setSelectedTarget(event.currentTarget.value)
                            }
                          >
                            <option value="">
                              Select an existing {destinationLabels[destination]}
                            </option>
                            {existing.map((row) => (
                              <option key={text(row.id)} value={text(row.id)}>
                                {optionLabel(destination, row)}
                              </option>
                            ))}
                          </select>
                          <select
                            className="field"
                            value={origin}
                            onChange={(event) =>
                              setOrigin(
                                event.currentTarget.value as MappingOrigin,
                              )
                            }
                          >
                            {mappingOrigins.map((item) => (
                              <option key={item}>{item}</option>
                            ))}
                          </select>
                          <button
                            className="citem-button"
                            type="button"
                            disabled={pending || !selectedTarget}
                            onClick={linkExisting}
                          >
                            Link
                          </button>
                        </div>
                      </section>
                    ) : null}

                    <form
                      key={`${destination}:${candidate?.canonicalValue ?? ""}`}
                      className="space-y-3 rounded border border-stone-800 bg-black/10 p-3"
                      onSubmit={submitCreate}
                    >
                      <div>
                        <p className="citem-label">Create new</p>
                        <p className="mt-1 text-xs leading-5 text-stone-600">
                          Raw source wording is preserved automatically in the
                          processing provenance ledger.
                        </p>
                      </div>

                      <CreateFields
                        destination={destination}
                        annotation={annotation}
                        candidate={candidate}
                      />

                      {destination === "attribution_claim" ? (
                        <>
                          <label className="grid gap-1">
                            <span className="citem-label">
                              Canonical actor, only if this is a name mapping
                            </span>
                            <select
                              className="field"
                              name="canonical_threat_actor_id"
                              defaultValue=""
                            >
                              <option value="">
                                Keep source actor text only
                              </option>
                              {options.actor.map((row) => (
                                <option key={text(row.id)} value={text(row.id)}>
                                  {optionLabel("actor", row)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="grid gap-1">
                            <span className="citem-label">Mapping origin</span>
                            <select
                              className="field"
                              name="mapping_origin"
                              defaultValue="SOURCE_EXPLICIT"
                            >
                              {mappingOrigins.map((item) => (
                                <option key={item}>{item}</option>
                              ))}
                            </select>
                          </label>
                        </>
                      ) : null}

                      <button className="citem-button" disabled={pending}>
                        {pending
                          ? "Saving…"
                          : `Create ${destinationLabels[destination]}`}
                      </button>
                    </form>
                  </div>
                )}

                {message.error ? (
                  <p className="mt-3 text-sm text-red-300">{message.error}</p>
                ) : null}
                {message.success ? (
                  <p className="mt-3 text-sm text-emerald-300">
                    {message.success}
                  </p>
                ) : null}
              </main>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
