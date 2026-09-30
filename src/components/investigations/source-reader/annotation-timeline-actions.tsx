"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createTimelineEventFromAnnotation,
  linkAnnotationToTimelineEvent,
} from "@/app/projects/[id]/timeline-actions";
import { TimelineTimeInputs } from "@/components/timeline/timeline-event-modal";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "");
type Precision = "EXACT" | "DAY" | "MONTH" | "YEAR" | "APPROXIMATE" | "RANGE";

function suggestedTitle(annotation: Row) {
  const selected = text(annotation.selected_text).replace(/\s+/g, " ").trim();
  if (!selected) return "Source observation";
  const firstSentence = selected.split(/(?<=[.!?])\s+/)[0] || selected;
  return firstSentence.slice(0, 177) + (firstSentence.length > 177 ? "…" : "");
}

export function AnnotationTimelineActions({
  projectId,
  sourceId,
  annotation,
  events,
  links,
}: {
  projectId: string;
  sourceId: string;
  annotation: Row;
  events: Row[];
  links: Row[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "create" | "link">("idle");
  const [precision, setPrecision] = useState<Precision>("DAY");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  const linkedIds = new Set(links.map((link) => text(link.timeline_event_id)));
  const availableEvents = events.filter((event) => !linkedIds.has(text(event.id)));

  return (
    <div className="mt-3 border-t border-stone-800 pt-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <span className="citem-label">Timeline</span>
        <div className="flex gap-2">
          <button className="text-xs text-amber-300" type="button" onClick={() => setMode(mode === "create" ? "idle" : "create")}>
            + Event
          </button>
          <button className="text-xs text-stone-400" type="button" onClick={() => setMode(mode === "link" ? "idle" : "link")}>
            Link existing
          </button>
        </div>
      </div>

      {links.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {links.map((link) => (
            <Link
              key={text(link.id)}
              className="citem-badge hover:border-amber-700 hover:text-amber-200"
              href={`/projects/${projectId}/timeline/${text(link.timeline_event_id)}`}
            >
              {text(link.timeline_events?.event_name) || "Timeline event"}
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-stone-600">Not yet processed into Timeline.</p>
      )}

      {mode === "create" ? (
        <form
          className="mt-3 space-y-2 rounded border border-amber-900/40 bg-amber-950/10 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("description", text(annotation.selected_text) || text(annotation.comment));
            fd.set("basis", "OBSERVED");
            fd.set("activity_phase", "UNKNOWN");
            fd.set("assessment_status", "RECORDED");
            fd.set("confidence", "MEDIUM");
            fd.set("analyst_rationale", "");
            startTransition(async () => {
              const result = await createTimelineEventFromAnnotation(
                projectId,
                sourceId,
                text(annotation.id),
                fd,
              );
              setMessage(result);
              if (result.success) {
                setMode("idle");
                router.refresh();
              }
            });
          }}
        >
          <input
            className="field min-h-10 py-2 text-sm"
            name="event_name"
            required
            maxLength={180}
            defaultValue={suggestedTitle(annotation)}
            placeholder="What happened?"
          />
          <TimelineTimeInputs precision={precision} onPrecisionChange={setPrecision} compact />
          <button className="citem-button w-full min-h-10 py-2" disabled={pending}>
            {pending ? "Adding…" : "Add to Timeline"}
          </button>
        </form>
      ) : null}

      {mode === "link" ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const eventId = text(fd.get("event_id"));
            startTransition(async () => {
              const result = await linkAnnotationToTimelineEvent(
                projectId,
                sourceId,
                text(annotation.id),
                eventId,
              );
              setMessage(result);
              if (result.success) {
                setMode("idle");
                router.refresh();
              }
            });
          }}
        >
          <select className="field min-h-10 py-2 text-sm" name="event_id" required defaultValue="">
            <option value="">Select Timeline event</option>
            {availableEvents.map((event) => (
              <option key={text(event.id)} value={text(event.id)}>
                {text(event.event_name)}
              </option>
            ))}
          </select>
          <button className="citem-button min-h-10 px-3 py-2" disabled={pending || !availableEvents.length}>
            Link
          </button>
        </form>
      ) : null}

      {message.error ? <p className="mt-2 text-xs text-red-300">{message.error}</p> : null}
      {message.success ? <p className="mt-2 text-xs text-emerald-300">{message.success}</p> : null}
    </div>
  );
}
