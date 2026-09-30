"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createTimelineEventV2,
  updateTimelineEventV2,
  type TimelineActionState,
} from "@/app/projects/[id]/timeline-actions";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "");

const phases = [
  "UNKNOWN",
  "INFRASTRUCTURE_PREPARATION",
  "TARGETING",
  "DELIVERY",
  "INITIAL_ACCESS",
  "EXECUTION",
  "PERSISTENCE",
  "COMMAND_AND_CONTROL",
  "COLLECTION",
  "EXFILTRATION",
  "IMPACT",
  "INFRASTRUCTURE_CHANGE",
  "OTHER",
] as const;

type Precision = "EXACT" | "DAY" | "MONTH" | "YEAR" | "APPROXIMATE" | "RANGE";

function dateValue(value: unknown, precision: Precision) {
  const raw = text(value);
  if (!raw) return "";
  if (precision === "EXACT") return raw.slice(0, 16);
  if (precision === "DAY" || precision === "APPROXIMATE" || precision === "RANGE") {
    return raw.slice(0, 10);
  }
  if (precision === "MONTH") return raw.slice(0, 7);
  if (precision === "YEAR") return raw.slice(0, 4);
  return "";
}

export function TimelineTimeInputs({
  precision,
  onPrecisionChange,
  event = {},
  compact = false,
}: {
  precision: Precision;
  onPrecisionChange: (precision: Precision) => void;
  event?: Row;
  compact?: boolean;
}) {
  const inputClass = compact ? "field min-h-10 py-2 text-sm" : "field";

  return (
    <div className={compact ? "grid gap-2" : "grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]"}>
      <label className="grid gap-1">
        <span className="citem-label">Time precision</span>
        <select
          className={inputClass}
          name="time_precision"
          value={precision}
          onChange={(e) => onPrecisionChange(e.currentTarget.value as Precision)}
        >
          <option value="EXACT">Exact date / time</option>
          <option value="DAY">Day</option>
          <option value="MONTH">Month</option>
          <option value="YEAR">Year</option>
          <option value="APPROXIMATE">Approximate</option>
          <option value="RANGE">Date range</option>
        </select>
      </label>

      <div className={precision === "RANGE" ? "grid gap-2 md:grid-cols-2" : "grid gap-2"}>
        <label className="grid gap-1">
          <span className="citem-label">
            {precision === "RANGE" ? "Start" : "When"}
          </span>
          {precision === "EXACT" ? (
            <input
              key="exact"
              className={inputClass}
              type="datetime-local"
              name="event_date"
              required
              defaultValue={dateValue(event.event_date, precision)}
            />
          ) : precision === "MONTH" ? (
            <input
              key="month"
              className={inputClass}
              type="month"
              name="event_date"
              required
              defaultValue={dateValue(event.event_date, precision)}
            />
          ) : precision === "YEAR" ? (
            <input
              key="year"
              className={inputClass}
              type="number"
              name="event_date"
              min="1900"
              max="2200"
              required
              defaultValue={dateValue(event.event_date, precision)}
              placeholder="2024"
            />
          ) : (
            <input
              key={precision}
              className={inputClass}
              type="date"
              name="event_date"
              required
              defaultValue={dateValue(event.event_date, precision)}
            />
          )}
        </label>

        {precision === "RANGE" ? (
          <label className="grid gap-1">
            <span className="citem-label">End</span>
            <input
              className={inputClass}
              type="date"
              name="occurred_end_at"
              required
              defaultValue={text(event.occurred_end_at).slice(0, 10)}
            />
          </label>
        ) : precision === "EXACT" ? (
          <label className="grid gap-1">
            <span className="citem-label">Optional end</span>
            <input
              className={inputClass}
              type="datetime-local"
              name="occurred_end_at"
              defaultValue={text(event.occurred_end_at).slice(0, 16)}
            />
          </label>
        ) : null}

        {precision === "APPROXIMATE" || precision === "RANGE" ? (
          <label className={precision === "RANGE" ? "md:col-span-2 grid gap-1" : "grid gap-1"}>
            <span className="citem-label">
              {precision === "APPROXIMATE" ? "Display wording" : "Optional display wording"}
            </span>
            <input
              className={inputClass}
              name="time_label"
              maxLength={240}
              required={precision === "APPROXIMATE"}
              defaultValue={text(event.time_label)}
              placeholder={precision === "APPROXIMATE" ? "Early February 2022" : "March–April 2024"}
            />
          </label>
        ) : (
          <input type="hidden" name="time_label" value="" />
        )}
      </div>
    </div>
  );
}

export function TimelineEventModal({
  projectId,
  event,
  triggerLabel,
}: {
  projectId: string;
  event?: Row;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const editing = Boolean(event?.id);
  const initialPrecision = (text(event?.time_precision) || "DAY") as Precision;
  const [precision, setPrecision] = useState<Precision>(initialPrecision);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<TimelineActionState>({});

  function close() {
    if (pending) return;
    setOpen(false);
    setState({});
    setPrecision(initialPrecision);
  }

  return (
    <>
      <button
        className={editing ? "citem-button-ghost" : "citem-button"}
        type="button"
        onClick={() => setOpen(true)}
      >
        {triggerLabel ?? (editing ? "Edit event" : "+ New event")}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) close();
          }}
        >
          <section
            className="w-full max-w-3xl overflow-hidden rounded-lg border border-amber-900/40 bg-[#0f1417] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={editing ? "Edit Timeline event" : "Create Timeline event"}
          >
            <header className="flex items-start justify-between gap-4 border-b border-stone-800 px-5 py-4">
              <div>
                <p className="citem-label">Timeline</p>
                <h2 className="mt-1 text-xl font-semibold text-stone-100">
                  {editing ? "Edit event" : "Record an event"}
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  Keep the event factual. Deeper reconstruction stays optional.
                </p>
              </div>
              <button className="citem-button-ghost min-h-0 px-3 py-1.5" type="button" onClick={close}>
                Close
              </button>
            </header>

            <form
              className="max-h-[78vh] space-y-4 overflow-y-auto p-5"
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                startTransition(async () => {
                  const result = editing
                    ? await updateTimelineEventV2(projectId, text(event?.id), formData)
                    : await createTimelineEventV2(projectId, formData);
                  setState(result);
                  if (result.success) {
                    setOpen(false);
                    router.refresh();
                  }
                });
              }}
            >
              <label className="grid gap-1">
                <span className="citem-label">What happened?</span>
                <input
                  className="field text-base"
                  name="event_name"
                  maxLength={180}
                  required
                  defaultValue={text(event?.event_name)}
                  placeholder="APT28 targeted Polish government institutions"
                />
              </label>

              <TimelineTimeInputs
                precision={precision}
                onPrecisionChange={setPrecision}
                event={event}
              />

              <label className="grid gap-1">
                <span className="citem-label">Short description</span>
                <textarea
                  className="field min-h-24"
                  name="description"
                  maxLength={10000}
                  defaultValue={text(event?.description)}
                  placeholder="Record what the source or observation says. Avoid interpretation here."
                />
              </label>

              <details className="rounded border border-stone-800 bg-black/15 p-3">
                <summary className="cursor-pointer text-sm font-medium text-amber-300">
                  Advanced details
                </summary>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="citem-label">Basis</span>
                    <select className="field" name="basis" defaultValue={text(event?.basis) || "OBSERVED"}>
                      <option value="OBSERVED">Observed</option>
                      <option value="INFERRED">Inferred</option>
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="citem-label">Attack / activity phase</span>
                    <select className="field" name="activity_phase" defaultValue={text(event?.activity_phase) || "UNKNOWN"}>
                      {phases.map((phase) => (
                        <option key={phase} value={phase}>{phase.replaceAll("_", " ")}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="citem-label">Assessment state</span>
                    <select className="field" name="assessment_status" defaultValue={text(event?.assessment_status) || "RECORDED"}>
                      <option value="RECORDED">Recorded</option>
                      <option value="ASSESSED">Assessed</option>
                      <option value="DISPUTED">Disputed</option>
                      <option value="RETRACTED">Retracted</option>
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="citem-label">Inference confidence</span>
                    <select className="field" name="confidence" defaultValue={text(event?.confidence) || "MEDIUM"}>
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                  </label>
                  <label className="grid gap-1 md:col-span-2">
                    <span className="citem-label">Analyst rationale</span>
                    <textarea
                      className="field min-h-20"
                      name="analyst_rationale"
                      maxLength={10000}
                      defaultValue={text(event?.analyst_rationale)}
                      placeholder="Required for inferred, disputed or retracted events."
                    />
                  </label>
                </div>
              </details>

              {state.error ? <p className="text-sm text-red-300">{state.error}</p> : null}

              <div className="flex justify-end gap-2 border-t border-stone-800 pt-4">
                <button className="citem-button-ghost" type="button" onClick={close}>
                  Cancel
                </button>
                <button className="citem-button" type="submit" disabled={pending}>
                  {pending ? "Saving…" : editing ? "Save event" : "Add to Timeline"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
