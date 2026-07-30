"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  linkEventEntity,
  linkEventSupport,
  saveClusterMembership,
  saveEventMembership,
  saveReconstruction,
  unlinkEventRecord,
  unlinkHistoricalEventMembership,
} from "@/app/projects/[id]/reconstruction-actions";

type Row = Record<string, unknown>;
type State = { error?: string; success?: string };
type EntityType =
  | "indicator"
  | "infrastructure_cluster"
  | "malware"
  | "cve"
  | "mitre_technique";

const text = (value: unknown) => String(value ?? "");
const dateTime = (value: unknown) => text(value).slice(0, 16);
const membershipStatuses = ["POSSIBLE", "CONFIRMED", "REJECTED", "REMOVED"];

function Submit({ label = "Save" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded bg-cyan-300 px-3 py-2 font-semibold text-slate-950 disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

function ActionForm({
  action,
  children,
}: {
  action: (state: State, formData: FormData) => Promise<State>;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-3 grid gap-3">
      {children}
      {state.error ? <p role="alert" className="text-red-300">{state.error}</p> : null}
      {state.success ? <p className="text-emerald-300">{state.success}</p> : null}
    </form>
  );
}

export function EventMembershipForm({ projectId, eventId, campaigns }: {
  projectId: string;
  eventId: string;
  campaigns: Row[];
}) {
  return (
    <ActionForm action={saveEventMembership.bind(null, projectId, eventId)}>
      <select className="field" name="campaign_id" required>
        <option value="">Select existing Campaign</option>
        {campaigns.map((campaign) => (
          <option key={text(campaign.id)} value={text(campaign.id)}>
            {text(campaign.name)}
          </option>
        ))}
      </select>
      <div className="grid gap-2 md:grid-cols-3">
        <select className="field" name="status">
          {membershipStatuses.map((status) => <option key={status}>{status}</option>)}
        </select>
        <select className="field" name="confidence">
          {["LOW", "MEDIUM", "HIGH"].map((level) => <option key={level}>{level}</option>)}
        </select>
        <input className="field" name="sequence_order" type="number" min="0" placeholder="Optional sequence order" />
      </div>
      <textarea className="field" required name="rationale" placeholder="Campaign membership rationale" />
      <Submit />
    </ActionForm>
  );
}

export function HistoricalMembershipUnlink({ projectId, eventId, membershipId }: {
  projectId: string;
  eventId: string;
  membershipId: string;
}) {
  return (
    <ActionForm action={unlinkHistoricalEventMembership.bind(null, projectId, eventId, membershipId)}>
      <label className="text-xs text-stone-500">
        Type UNLINK to deliberately remove this rejected/removed historical membership.
        <input className="field mt-1" name="confirm" required pattern="UNLINK" />
      </label>
      <Submit label="Unlink historical membership" />
    </ActionForm>
  );
}

function entityLabel(type: EntityType, row: Row) {
  if (type === "indicator") return `${text(row.value)} · ${text(row.type)}`;
  if (type === "cve") return text(row.cve_id);
  if (type === "mitre_technique") return `${text(row.technique_id)} · ${text(row.technique_name)}`;
  return text(row.name);
}

export function EntityLinkForm({ projectId, eventId, options }: {
  projectId: string;
  eventId: string;
  options: Record<EntityType, Row[]>;
}) {
  const [entityType, setEntityType] = useState<EntityType>("indicator");
  return (
    <ActionForm action={linkEventEntity.bind(null, projectId, eventId)}>
      <label>
        <span className="citem-label">Entity type</span>
        <select
          className="field mt-1"
          name="entity_type"
          value={entityType}
          onChange={(event) => setEntityType(event.target.value as EntityType)}
        >
          {Object.keys(options).map((type) => (
            <option key={type} value={type}>{type.replaceAll("_", " ")}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="citem-label">Existing record</span>
        <select className="field mt-1" name="entity_id" required defaultValue="">
          <option value="">Select {entityType.replaceAll("_", " ")}</option>
          {options[entityType].map((row) => (
            <option key={text(row.id)} value={text(row.id)}>{entityLabel(entityType, row)}</option>
          ))}
        </select>
      </label>
      <select className="field" name="role">
        {["SUBJECT", "INFRASTRUCTURE", "PAYLOAD", "TECHNIQUE", "VULNERABILITY", "SUPPORTING_ARTIFACT", "OTHER"].map((role) => <option key={role}>{role}</option>)}
      </select>
      <textarea className="field" name="analyst_note" placeholder="Optional analyst note" />
      <Submit label="Link technical entity" />
    </ActionForm>
  );
}

function SupportForm({ projectId, eventId, type, rows }: {
  projectId: string;
  eventId: string;
  type: "source" | "evidence" | "enrichment_result";
  rows: Row[];
}) {
  const label = type === "source" ? "Source" : type === "evidence" ? "Evidence" : "Enrichment result";
  return (
    <ActionForm action={linkEventSupport.bind(null, projectId, eventId, type)}>
      <select className="field" name="support_id" required defaultValue="">
        <option value="">Select {label}</option>
        {rows.map((row) => (
          <option key={text(row.id)} value={text(row.id)}>
            {type === "enrichment_result"
              ? `${text(row.provider_label_snapshot || row.category)} · ${text(row.queried_at)}`
              : text(row.title)}
          </option>
        ))}
      </select>
      <textarea className="field" name="analyst_note" placeholder={`Optional note for this ${label}`} />
      <Submit label={`Attach ${label}`} />
    </ActionForm>
  );
}

export function SupportLinkForms({ projectId, eventId, sources, evidence, enrichment }: {
  projectId: string;
  eventId: string;
  sources: Row[];
  evidence: Row[];
  enrichment: Row[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div><h3 className="font-semibold">Source</h3><SupportForm projectId={projectId} eventId={eventId} type="source" rows={sources} /></div>
      <div><h3 className="font-semibold">Evidence</h3><SupportForm projectId={projectId} eventId={eventId} type="evidence" rows={evidence} /></div>
      <div><h3 className="font-semibold">Enrichment result</h3><SupportForm projectId={projectId} eventId={eventId} type="enrichment_result" rows={enrichment} /></div>
    </div>
  );
}

export function LinkedRecordUnlink({ projectId, eventId, table, recordId }: {
  projectId: string;
  eventId: string;
  table: "timeline_event_entities" | "timeline_event_support";
  recordId: string;
}) {
  return (
    <ActionForm action={unlinkEventRecord.bind(null, projectId, eventId, table, recordId)}>
      <input type="hidden" name="confirm" value="UNLINK" />
      <Submit label="Unlink" />
    </ActionForm>
  );
}

export function ReconstructionForm({ projectId, campaignId, row = {} }: {
  projectId: string;
  campaignId: string;
  row?: Row;
}) {
  return (
    <ActionForm action={saveReconstruction.bind(null, projectId, campaignId)}>
      <div className="grid gap-2 md:grid-cols-3">
        <select className="field" name="reconstruction_status" defaultValue={text(row.reconstruction_status) || "DRAFT"}><option>DRAFT</option><option>ASSESSED</option></select>
        <select className="field" name="activity_status" defaultValue={text(row.activity_status) || "UNKNOWN"}>{["UNKNOWN", "ACTIVE", "DORMANT", "CONCLUDED"].map((status) => <option key={status}>{status}</option>)}</select>
        <select className="field" name="confidence" defaultValue={text(row.confidence) || "MEDIUM"}>{["LOW", "MEDIUM", "HIGH"].map((level) => <option key={level}>{level}</option>)}</select>
      </div>
      <textarea className="field" name="operational_objective" defaultValue={text(row.operational_objective)} placeholder="Operational objective" />
      <textarea className="field" name="current_assessment" defaultValue={text(row.current_assessment)} placeholder="Current analyst assessment" />
      <textarea className="field" name="next_expected_activity" defaultValue={text(row.next_expected_activity)} placeholder="Bounded near-term expectation, not certainty" />
      <textarea className="field" name="key_uncertainties" defaultValue={text(row.key_uncertainties)} placeholder="Missing or disputed analytical points" />
      <div className="grid gap-2 md:grid-cols-3">
        <input className="field" aria-label="First observed" type="datetime-local" name="first_observed_at" defaultValue={dateTime(row.first_observed_at)} />
        <input className="field" aria-label="Last observed" type="datetime-local" name="last_observed_at" defaultValue={dateTime(row.last_observed_at)} />
        <input className="field" aria-label="Assessed at" type="datetime-local" name="assessed_at" defaultValue={dateTime(row.assessed_at)} />
      </div>
      <Submit />
    </ActionForm>
  );
}

export function ClusterMembershipForm({ projectId, campaignId, clusters }: {
  projectId: string;
  campaignId: string;
  clusters: Row[];
}) {
  return (
    <ActionForm action={saveClusterMembership.bind(null, projectId, campaignId)}>
      <select className="field" name="infrastructure_cluster_id" required defaultValue="">
        <option value="">Select existing Infrastructure Cluster</option>
        {clusters.map((cluster) => <option key={text(cluster.id)} value={text(cluster.id)}>{text(cluster.name)}</option>)}
      </select>
      <div className="grid gap-2 md:grid-cols-2">
        <select className="field" name="status">{membershipStatuses.map((status) => <option key={status}>{status}</option>)}</select>
        <select className="field" name="confidence">{["LOW", "MEDIUM", "HIGH"].map((level) => <option key={level}>{level}</option>)}</select>
      </div>
      <textarea className="field" required name="rationale" placeholder="Campaign-specific rationale" />
      <div className="grid gap-2 md:grid-cols-2">
        <input className="field" aria-label="Cluster first observed" name="first_observed_at" type="datetime-local" />
        <input className="field" aria-label="Cluster last observed" name="last_observed_at" type="datetime-local" />
      </div>
      <Submit />
    </ActionForm>
  );
}
