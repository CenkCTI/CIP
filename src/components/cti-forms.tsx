"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { createCti, deleteCti, updateCti } from "@/app/actions";
import { createManualIndicator } from "@/app/projects/[id]/ioc-actions";
import { BulkIocIntake } from "@/components/ioc-workbench/bulk-ioc-intake";
import {
  confidenceLevels,
  ctiModuleLabels,
  ctiRecordTitle,
  ctiTabs,
  cveSeverities,
  exploitStatuses,
  formatDateInput,
  formatDateTimeLocalInput,
  indicatorStatuses,
  indicatorTypes,
} from "@/lib/cti-schema";

type Tab = (typeof ctiTabs)[number];
type Row = Record<string, unknown>;
const s = (value: unknown) => String(value ?? "");
const csv = (value: unknown) => (Array.isArray(value) ? value.join(", ") : "");

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
    : tab === "indicators"
      ? createManualIndicator.bind(null, projectId)
      : createCti.bind(null, tab, projectId);
  const [state, formAction] = useActionState(action, {
    error: "",
    success: "",
  });

  return (
    <>
      {tab === "indicators" && !row ? (
        <BulkIocIntake projectId={projectId} />
      ) : null}

      <form
        action={formAction}
        className="space-y-3 rounded border border-slate-800 p-3"
      >
        <h3 className="font-semibold text-white">
          {row ? "Edit" : "New"} {ctiModuleLabels[tab]}
        </h3>
        {tab === "indicators" && !row ? (
          <p className="text-xs leading-5 text-stone-500">
            Single Indicator creation remains available below the bulk IOC intake
            workflow.
          </p>
        ) : null}
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
    </>
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
  maxLength,
  help,
}: {
  name: string;
  label: string;
  row?: Row;
  area?: boolean;
  type?: string;
  maxLength?: number;
  help?: string;
}) {
  return (
    <label className="block text-sm text-slate-300">
      {label}
      {area ? (
        <textarea
          className="field mt-1"
          name={name}
          maxLength={maxLength}
          defaultValue={s(row?.[name])}
        />
      ) : (
        <input
          className="field mt-1"
          type={type}
          name={name}
          maxLength={maxLength}
          defaultValue={formatFieldValue(row?.[name], type)}
        />
      )}
      {help ? (
        <span className="mt-1 block text-xs leading-5 text-stone-500">
          {help}
        </span>
      ) : null}
    </label>
  );
}

function formatFieldValue(value: unknown, type: string) {
  if (Array.isArray(value)) return csv(value);
  if (type === "date") return formatDateInput(value);
  if (type === "datetime-local") return formatDateTimeLocalInput(value);
  return s(value);
}

function Select({
  name,
  label,
  values,
  row,
  help,
}: {
  name: string;
  label: string;
  values: readonly string[];
  row?: Row;
  help?: string;
}) {
  return (
    <label className="block text-sm text-slate-300">
      {label}
      <select className="field mt-1" name={name} defaultValue={s(row?.[name])}>
        {values.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      {help ? (
        <span className="mt-1 block text-xs leading-5 text-stone-500">
          {help}
        </span>
      ) : null}
    </label>
  );
}

function fields(tab: Tab, row?: Row) {
  if (tab === "actors") {
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
  }
  if (tab === "campaigns") {
    return (
      <>
        <Text name="name" label="Name" row={row} />
        <Text name="description" label="Description" row={row} area />
        <Text name="start_date" label="Start date" type="date" row={row} />
        <Text name="end_date" label="End date" type="date" row={row} />
        <Text name="targets" label="Targets" row={row} />
      </>
    );
  }
  if (tab === "indicators") {
    return (
      <>
        <Text name="value" label="Canonical value" row={row} />
        <Select name="type" label="Type" values={indicatorTypes} row={row} />
        <div className="grid gap-3 md:grid-cols-2">
          <Select
            name="status"
            label="Indicator status"
            values={indicatorStatuses}
            row={row ?? { status: "UNVERIFIED" }}
            help="The analyst’s present verdict about the Indicator."
          />
          <Select
            name="confidence"
            label="Confidence"
            values={confidenceLevels}
            row={row ?? { confidence: "MEDIUM" }}
            help="How strong the supporting information is. Status and confidence are separate judgments."
          />
        </div>
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
        <Text
          name="analyst_rationale"
          label="Analyst rationale"
          row={row}
          area
          maxLength={5000}
          help="Why the current status and confidence are justified."
        />
        <Text
          name="current_relevance"
          label="Current relevance"
          row={row}
          area
          maxLength={2000}
          help="How this IOC currently matters to the Investigation."
        />
      </>
    );
  }
  if (tab === "malware") {
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
  }
  if (tab === "cves") {
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
  }
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
      {map[tab].map((name) => (
        <SearchableChecks
          key={name}
          name={name}
          rows={options[name] ?? []}
          selected={selected?.[name] ?? []}
        />
      ))}
    </fieldset>
  );
}

export function SearchableChecks({
  name,
  rows,
  selected,
}: {
  name: string;
  rows: Row[];
  selected: string[];
}) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => [...new Set(selected)]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filtered = useMemo(
    () =>
      rows
        .filter((row) =>
          ctiRecordTitle(row).toLowerCase().includes(query.toLowerCase()),
        )
        .sort(
          (left, right) =>
            ctiRecordTitle(left).localeCompare(ctiRecordTitle(right)) ||
            s(left.id).localeCompare(s(right.id)),
        ),
    [rows, query],
  );

  function toggle(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return [...next];
    });
  }

  return (
    <div className="rounded border border-slate-800 p-2">
      {selectedIds.map((id) => (
        <input
          key={id}
          type="hidden"
          name={name}
          value={id}
          data-testid={`${name}-hidden`}
        />
      ))}
      <label
        className="text-sm font-medium text-slate-300"
        htmlFor={`${name}-search`}
      >
        {name.replaceAll("_", " ")}
      </label>
      <input
        id={`${name}-search`}
        className="field mt-1"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
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
          filtered.map((row) => {
            const id = s(row.id);
            return (
              <label
                key={id}
                className="flex items-center gap-2 rounded px-2 py-1 text-sm text-slate-300 hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  checked={selectedSet.has(id)}
                  onChange={(event) => toggle(id, event.currentTarget.checked)}
                />
                <span>{ctiRecordTitle(row)}</span>
              </label>
            );
          })
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
    formData: FormData,
  ) => deleteCti(tab, projectId, s(row.id), name, formData);
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
