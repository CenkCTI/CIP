"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  linkEventEntity,
  linkEventSupport,
  saveEventMembership,
  unlinkEventRecord,
  unlinkHistoricalEventMembership,
} from "@/app/projects/[id]/reconstruction-actions";
import { unlinkTimelineAnnotation } from "@/app/projects/[id]/timeline-actions";
import { defaultTimelineEntityRole } from "@/lib/timeline/presentation";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "");

function Feedback({ value }: { value: { error?: string; success?: string } }) {
  if (value.error) return <p className="mt-2 text-xs text-red-300">{value.error}</p>;
  if (value.success) return <p className="mt-2 text-xs text-emerald-300">{value.success}</p>;
  return null;
}

export function QuickCampaignLink({
  projectId,
  eventId,
  campaigns,
}: {
  projectId: string;
  eventId: string;
  campaigns: Row[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<{ error?: string; success?: string }>({});

  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("status", "POSSIBLE");
        fd.set("confidence", "LOW");
        fd.set("sequence_order", "");
        startTransition(async () => {
          const result = await saveEventMembership(projectId, eventId, {}, fd);
          setState(result);
          if (result.success) {
            e.currentTarget.reset();
            router.refresh();
          }
        });
      }}
    >
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <select className="field min-h-10 py-2 text-sm" name="campaign_id" required defaultValue="">
          <option value="">Select Campaign</option>
          {campaigns.map((row) => (
            <option key={text(row.id)} value={text(row.id)}>{text(row.name)}</option>
          ))}
        </select>
        <input
          className="field min-h-10 py-2 text-sm"
          name="rationale"
          required
          maxLength={10000}
          placeholder="Why might it belong?"
        />
        <button className="citem-button min-h-10 px-3 py-2" disabled={pending}>
          {pending ? "Linking…" : "Link"}
        </button>
      </div>
      <Feedback value={state} />
    </form>
  );
}

const entityTypes = [
  "indicator",
  "infrastructure_cluster",
  "malware",
  "cve",
  "mitre_technique",
] as const;
type EntityType = (typeof entityTypes)[number];

function entityLabel(type: EntityType, row: Row) {
  if (type === "indicator") return `${text(row.value)} · ${text(row.type)}`;
  if (type === "cve") return text(row.cve_id);
  if (type === "mitre_technique") return `${text(row.technique_id)} · ${text(row.technique_name)}`;
  return text(row.name);
}

export function QuickEntityLink({
  projectId,
  eventId,
  options,
}: {
  projectId: string;
  eventId: string;
  options: Record<EntityType, Row[]>;
}) {
  const router = useRouter();
  const [entityType, setEntityType] = useState<EntityType>("indicator");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<{ error?: string; success?: string }>({});

  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("entity_type", entityType);
        fd.set("role", defaultTimelineEntityRole(entityType));
        fd.set("analyst_note", "");
        startTransition(async () => {
          const result = await linkEventEntity(projectId, eventId, {}, fd);
          setState(result);
          if (result.success) {
            e.currentTarget.reset();
            router.refresh();
          }
        });
      }}
    >
      <div className="grid gap-2 md:grid-cols-[190px_minmax(0,1fr)_auto]">
        <select
          className="field min-h-10 py-2 text-sm"
          value={entityType}
          onChange={(e) => setEntityType(e.currentTarget.value as EntityType)}
        >
          {entityTypes.map((type) => (
            <option key={type} value={type}>{type.replaceAll("_", " ")}</option>
          ))}
        </select>
        <select className="field min-h-10 py-2 text-sm" name="entity_id" required defaultValue="">
          <option value="">Select existing record</option>
          {options[entityType].map((row) => (
            <option key={text(row.id)} value={text(row.id)}>{entityLabel(entityType, row)}</option>
          ))}
        </select>
        <button className="citem-button min-h-10 px-3 py-2" disabled={pending}>
          {pending ? "Linking…" : "Link"}
        </button>
      </div>
      <Feedback value={state} />
    </form>
  );
}

type SupportType = "source" | "evidence" | "enrichment_result";

export function QuickSupportLink({
  projectId,
  eventId,
  sources,
  evidence,
  enrichment,
}: {
  projectId: string;
  eventId: string;
  sources: Row[];
  evidence: Row[];
  enrichment: Row[];
}) {
  const router = useRouter();
  const [type, setType] = useState<SupportType>("source");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<{ error?: string; success?: string }>({});
  const rows = useMemo(
    () => (type === "source" ? sources : type === "evidence" ? evidence : enrichment),
    [type, sources, evidence, enrichment],
  );

  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("analyst_note", "");
        startTransition(async () => {
          const result = await linkEventSupport(projectId, eventId, type, {}, fd);
          setState(result);
          if (result.success) {
            e.currentTarget.reset();
            router.refresh();
          }
        });
      }}
    >
      <div className="grid gap-2 md:grid-cols-[190px_minmax(0,1fr)_auto]">
        <select
          className="field min-h-10 py-2 text-sm"
          value={type}
          onChange={(e) => setType(e.currentTarget.value as SupportType)}
        >
          <option value="source">Source</option>
          <option value="evidence">Evidence</option>
          <option value="enrichment_result">Enrichment result</option>
        </select>
        <select className="field min-h-10 py-2 text-sm" name="support_id" required defaultValue="">
          <option value="">Select existing record</option>
          {rows.map((row) => (
            <option key={text(row.id)} value={text(row.id)}>
              {type === "enrichment_result"
                ? `${text(row.provider_label_snapshot || row.category)} · ${text(row.queried_at)}`
                : text(row.title)}
            </option>
          ))}
        </select>
        <button className="citem-button min-h-10 px-3 py-2" disabled={pending}>
          {pending ? "Linking…" : "Link"}
        </button>
      </div>
      <Feedback value={state} />
    </form>
  );
}

export function QuickRecordUnlink({
  projectId,
  eventId,
  table,
  recordId,
}: {
  projectId: string;
  eventId: string;
  table: "timeline_event_entities" | "timeline_event_support";
  recordId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="text-xs text-stone-500 hover:text-red-300"
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const fd = new FormData();
          fd.set("confirm", "UNLINK");
          const result = await unlinkEventRecord(projectId, eventId, table, recordId, {}, fd);
          if (result.success) router.refresh();
        })
      }
    >
      {pending ? "Removing…" : "Unlink"}
    </button>
  );
}

export function QuickHistoricalMembershipUnlink({
  projectId,
  eventId,
  membershipId,
}: {
  projectId: string;
  eventId: string;
  membershipId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="text-xs text-stone-500 hover:text-red-300"
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const fd = new FormData();
          fd.set("confirm", "UNLINK");
          const result = await unlinkHistoricalEventMembership(projectId, eventId, membershipId, {}, fd);
          if (result.success) router.refresh();
        })
      }
    >
      {pending ? "Removing…" : "Unlink history"}
    </button>
  );
}

export function QuickAnnotationUnlink({
  projectId,
  eventId,
  linkId,
}: {
  projectId: string;
  eventId: string;
  linkId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="text-xs text-stone-500 hover:text-red-300"
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await unlinkTimelineAnnotation(projectId, eventId, linkId);
          if (result.success) router.refresh();
        })
      }
    >
      {pending ? "Removing…" : "Unlink"}
    </button>
  );
}
