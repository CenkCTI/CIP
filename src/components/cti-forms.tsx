"use client";
import { useActionState } from "react";
import { createCti, deleteCti, updateCti } from "@/app/actions";

import {
  confidenceLevels,
  ctiTabs,
  cveSeverities,
  exploitStatuses,
  indicatorTypes,
} from "@/lib/cti-schema";

type Tab = (typeof ctiTabs)[number];
type Row = Record<string, unknown>;
const s = (v: unknown) => String(v ?? "");
const csv = (v: unknown) => (Array.isArray(v) ? v.join(", ") : "");
const labels = {
  actors: "Threat Actor",
  campaigns: "Campaign",
  indicators: "Indicator",
  malware: "Malware",
  cves: "CVE",
  mitre: "MITRE Technique",
};
export function CtiForm({
  tab,
  projectId,
  row,
  options,
  selected,
}: {
  tab: Tab;
  projectId: string;
  row?: Row;
  options: Record<string, Row[]>;
  selected?: Record<string, string[]>;
}) {
  const action = row
    ? updateCti.bind(null, tab, projectId, s(row.id))
    : createCti.bind(null, tab, projectId);
  const [state, formAction] = useActionState(action, {
    error: "",
    success: "",
  });
  return (
    <form
      action={formAction}
      className="space-y-3 rounded border border-slate-800 p-3"
    >
      <h3 className="font-semibold text-white">
        {row ? "Edit" : "New"} {labels[tab]}
      </h3>
      {fields(tab, row)}
      <Relationships tab={tab} options={options} selected={selected} />
      {state.error && (
        <p role="alert" className="text-sm text-red-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-sm text-emerald-300">{state.success}</p>
      )}
      <button className="rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950">
        {row ? "Save" : "Create"}
      </button>
    </form>
  );
}
function Text({
  name,
  label,
  row,
  area,
  type = "text",
}: {
  name: string;
  label: string;
  row?: Row;
  area?: boolean;
  type?: string;
}) {
  return (
    <label className="block text-sm text-slate-300">
      {label}
      {area ? (
        <textarea
          className="field mt-1"
          name={name}
          defaultValue={s(row?.[name])}
        />
      ) : (
        <input
          className="field mt-1"
          type={type}
          name={name}
          defaultValue={
            Array.isArray(row?.[name]) ? csv(row?.[name]) : s(row?.[name])
          }
        />
      )}
    </label>
  );
}
function Select({
  name,
  label,
  values,
  row,
}: {
  name: string;
  label: string;
  values: readonly string[];
  row?: Row;
}) {
  return (
    <label className="block text-sm text-slate-300">
      {label}
      <select className="field mt-1" name={name} defaultValue={s(row?.[name])}>
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}
function fields(tab: Tab, row?: Row) {
  if (tab === "actors")
    return (
      <>
        <Text name="name" label="Name" row={row} />
        <Text name="aliases" label="Aliases (comma-separated)" row={row} />
        <Text name="country" label="Country" row={row} />
        <Text name="motivations" label="Motivations" row={row} />
        <Text name="description" label="Description" row={row} area />
        <Text name="known_ttps" label="Known TTPs" row={row} area />
        <Text name="references" label="References" row={row} />
      </>
    );
  if (tab === "campaigns")
    return (
      <>
        <Text name="name" label="Name" row={row} />
        <Text name="description" label="Description" row={row} area />
        <Text name="start_date" label="Start date" type="date" row={row} />
        <Text name="end_date" label="End date" type="date" row={row} />
        <Text name="targets" label="Targets" row={row} />
      </>
    );
  if (tab === "indicators")
    return (
      <>
        <Text name="value" label="Value" row={row} />
        <Select name="type" label="Type" values={indicatorTypes} row={row} />
        <Select
          name="confidence"
          label="Confidence"
          values={confidenceLevels}
          row={row}
        />
        <Text name="source" label="Source" row={row} />
        <Text name="tags" label="Tags" row={row} />
        <Text
          name="first_seen"
          label="First seen"
          type="datetime-local"
          row={row}
        />
        <Text
          name="last_seen"
          label="Last seen"
          type="datetime-local"
          row={row}
        />
      </>
    );
  if (tab === "malware")
    return (
      <>
        <Text name="name" label="Name" row={row} />
        <Text name="family" label="Family" row={row} />
        <Text
          name="hashes"
          label="Hashes JSON"
          row={{ hashes: JSON.stringify(row?.hashes ?? {}) }}
        />
        <Text name="description" label="Description" row={row} area />
        <Text name="behavior" label="Behavior" row={row} area />
      </>
    );
  if (tab === "cves")
    return (
      <>
        <Text name="cve_id" label="CVE ID" row={row} />
        <Select
          name="severity"
          label="Severity"
          values={cveSeverities}
          row={row}
        />
        <Text name="description" label="Description" row={row} area />
        <Text name="affected_product" label="Affected product" row={row} />
        <Select
          name="exploit_status"
          label="Exploit status"
          values={exploitStatuses}
          row={row}
        />
        <Text name="references" label="References" row={row} />
      </>
    );
  return (
    <>
      <Text name="technique_id" label="Technique ID" row={row} />
      <Text name="technique_name" label="Technique name" row={row} />
      <Text name="tactic" label="Tactic" row={row} />
      <Text name="description" label="Description" row={row} area />
    </>
  );
}
function Relationships({
  tab,
  options,
  selected,
}: {
  tab: Tab;
  options: Record<string, Row[]>;
  selected?: Record<string, string[]>;
}) {
  const map: Record<Tab, string[]> = {
    actors: ["malware_ids", "indicator_ids", "mitre_technique_ids"],
    campaigns: [
      "threat_actor_ids",
      "malware_ids",
      "indicator_ids",
      "mitre_technique_ids",
    ],
    indicators: ["threat_actor_ids", "campaign_ids", "malware_ids"],
    malware: [
      "threat_actor_ids",
      "campaign_ids",
      "indicator_ids",
      "cve_ids",
      "mitre_technique_ids",
    ],
    cves: ["malware_ids"],
    mitre: ["threat_actor_ids", "campaign_ids", "malware_ids"],
  };
  return (
    <fieldset className="grid gap-2 md:grid-cols-2">
      <legend className="text-sm font-semibold text-cyan-200">
        Relationships
      </legend>
      {map[tab].map((k) => (
        <label key={k} className="text-sm text-slate-300">
          {k.replaceAll("_", " ")}
          <select
            className="field mt-1 h-28"
            name={k}
            multiple
            defaultValue={selected?.[k] ?? []}
          >
            {(options[k] ?? []).map((o) => (
              <option key={s(o.id)} value={s(o.id)}>
                {s(o.name || o.value || o.cve_id || o.technique_id)}
              </option>
            ))}
          </select>
        </label>
      ))}
    </fieldset>
  );
}
export function CtiDelete({
  tab,
  projectId,
  row,
}: {
  tab: Tab;
  projectId: string;
  row: Row;
}) {
  const name = s(row.name || row.value || row.cve_id || row.technique_id);
  return (
    <form
      action={deleteCti.bind(null, tab, projectId, s(row.id), name)}
      className="mt-3 rounded border border-red-900 p-3"
    >
      <p className="text-sm text-red-200">
        Delete {name}. Related CTI links will be removed.
      </p>
      <input
        className="field my-2"
        name="confirm"
        placeholder={`Type ${name}`}
      />
      <button className="rounded bg-red-500 px-3 py-2 text-sm font-semibold text-white">
        Delete
      </button>
    </form>
  );
}
