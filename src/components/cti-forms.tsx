"use client";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { createCti, deleteCti, updateCti } from "@/app/actions";
import {
  confidenceLevels,
  ctiModuleLabels,
  ctiRecordTitle,
  ctiTabs,
  cveSeverities,
  exploitStatuses,
  indicatorTypes,
} from "@/lib/cti-schema";

type Tab = (typeof ctiTabs)[number];
type Row = Record<string, unknown>;
const s = (v: unknown) => String(v ?? "");
const csv = (v: unknown) => (Array.isArray(v) ? v.join(", ") : "");
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
        {row ? "Edit" : "New"} {ctiModuleLabels[tab]}
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
      <Submit>{row ? "Save" : "Create"}</Submit>
    </form>
  );
}
function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60"
    >
      {pending ? "Saving…" : children}
    </button>
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
    <fieldset className="grid gap-3 md:grid-cols-2">
      <legend className="text-sm font-semibold text-cyan-200">
        Relationships
      </legend>
      {map[tab].map((k) => (
        <SearchableChecks
          key={k}
          name={k}
          rows={options[k] ?? []}
          selected={selected?.[k] ?? []}
        />
      ))}
    </fieldset>
  );
}
function SearchableChecks({
  name,
  rows,
  selected,
}: {
  name: string;
  rows: Row[];
  selected: string[];
}) {
  const [q, setQ] = useState("");
  const chosen = new Set(selected);
  const filtered = useMemo(
    () =>
      rows
        .filter((r) =>
          ctiRecordTitle(r).toLowerCase().includes(q.toLowerCase()),
        )
        .sort(
          (a, b) =>
            ctiRecordTitle(a).localeCompare(ctiRecordTitle(b)) ||
            s(a.id).localeCompare(s(b.id)),
        ),
    [rows, q],
  );
  return (
    <div className="rounded border border-slate-800 p-2">
      <label
        className="text-sm font-medium text-slate-300"
        htmlFor={`${name}-search`}
      >
        {name.replaceAll("_", " ")}
      </label>
      <input
        id={`${name}-search`}
        className="field mt-1"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search relationships"
      />
      <p className="mt-1 text-xs text-slate-500">
        {rows.length
          ? `${filtered.length} matching records`
          : "No records available to link."}
      </p>
      <div
        className="mt-2 max-h-44 space-y-1 overflow-y-auto"
        aria-live="polite"
      >
        {filtered.length ? (
          filtered.map((r) => (
            <label
              key={s(r.id)}
              className="flex items-center gap-2 rounded px-2 py-1 text-sm text-slate-300 hover:bg-slate-800"
            >
              <input
                type="checkbox"
                name={name}
                value={s(r.id)}
                defaultChecked={chosen.has(s(r.id))}
              />
              <span>{ctiRecordTitle(r)}</span>
            </label>
          ))
        ) : (
          <p className="text-sm text-slate-500">No matching records.</p>
        )}
      </div>
    </div>
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
  const name = ctiRecordTitle(row);
  const deleteAction = async (
    _: { error?: string; success?: string },
    fd: FormData,
  ) => deleteCti(tab, projectId, s(row.id), name, fd);
  const [state, action] = useActionState(deleteAction, {});
  return (
    <form action={action} className="mt-3 rounded border border-red-900 p-3">
      <p className="text-sm text-red-200">
        Delete {name}. Related CTI links will be removed.
      </p>
      <input
        className="field my-2"
        name="confirm"
        placeholder={`Type ${name}`}
      />
      {state.error && (
        <p role="alert" className="text-sm text-red-300">
          {state.error}
        </p>
      )}
      <Submit>Delete</Submit>
    </form>
  );
}
