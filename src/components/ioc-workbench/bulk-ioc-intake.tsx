"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  importBulkIndicators,
  previewBulkIndicators,
  type BulkIocImportResult,
  type BulkIocInput,
  type BulkIocPreviewResult,
} from "@/app/projects/[id]/ioc-actions";
import {
  MAX_BULK_IOC_INPUT_CHARS,
  MAX_BULK_IOC_LINES,
} from "@/lib/cti/indicators";
import { confidenceLevels } from "@/lib/cti-schema";

const classificationLabels = {
  NEW: "New",
  DUPLICATE_IN_INPUT: "Duplicate in input",
  ALREADY_EXISTS: "Already exists",
  INVALID: "Invalid",
  UNSUPPORTED_CVE: "Use CVE module",
} as const;

function tone(classification: keyof typeof classificationLabels) {
  if (classification === "NEW") return "secure";
  if (
    classification === "INVALID" ||
    classification === "UNSUPPORTED_CVE"
  ) {
    return "critical";
  }
  return "attention";
}

export function BulkIocIntake({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [confidence, setConfidence] = useState<(typeof confidenceLevels)[number]>(
    "MEDIUM",
  );
  const [sourceLabel, setSourceLabel] = useState("");
  const [tags, setTags] = useState("");
  const [observedAt, setObservedAt] = useState("");
  const [analystNote, setAnalystNote] = useState("");
  const [addExistingObservations, setAddExistingObservations] = useState(true);
  const [preview, setPreview] = useState<BulkIocPreviewResult | null>(null);
  const [importResult, setImportResult] =
    useState<BulkIocImportResult | null>(null);

  const input = useMemo<BulkIocInput>(
    () => ({
      text,
      confidence,
      sourceLabel,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      observedAt: observedAt || null,
      analystNote,
      addObservationsForExisting: addExistingObservations,
    }),
    [
      addExistingObservations,
      analystNote,
      confidence,
      observedAt,
      sourceLabel,
      tags,
      text,
    ],
  );

  function invalidatePreview() {
    setPreview(null);
    setImportResult(null);
  }

  function runPreview() {
    setImportResult(null);
    startTransition(() => {
      void previewBulkIndicators(projectId, input).then(setPreview);
    });
  }

  function runImport() {
    startTransition(() => {
      void importBulkIndicators(projectId, input).then((result) => {
        setImportResult(result);
        if (result.ok) {
          setPreview(null);
          router.refresh();
        }
      });
    });
  }

  const canImport =
    preview?.ok &&
    preview.rows.some((row) =>
      ["NEW", "ALREADY_EXISTS"].includes(row.classification),
    );

  return (
    <section className="mb-5 rounded border border-amber-900/30 bg-black/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="citem-label">IOC Workbench / Bulk intake</p>
          <h3 className="mt-2 text-lg font-semibold text-stone-100">
            Preview before import
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">
            One candidate per line. Preview performs no write and never fetches,
            resolves, visits, or scans an IOC. Import repeats type detection,
            normalization, validation, and duplicate checks on the server.
          </p>
        </div>
        <span className="citem-badge">Max {MAX_BULK_IOC_LINES} lines</span>
      </div>

      <div className="mt-4 grid gap-4">
        <label className="block text-sm text-stone-300">
          Mixed IOC input
          <textarea
            className="field mt-1 min-h-52 font-mono text-xs"
            value={text}
            maxLength={MAX_BULK_IOC_INPUT_CHARS}
            onChange={(event) => {
              setText(event.currentTarget.value);
              invalidatePreview();
            }}
            placeholder={[
              "secure-energy[.]example",
              "hxxps://secure-energy[.]example/login",
              "192.0.2.10",
              "2001:db8::10",
              "44d88612fea8a8f36de82e1278abb02f",
            ].join("\n")}
          />
          <span className="mt-1 block text-xs text-stone-500">
            {text.length.toLocaleString()} /{" "}
            {MAX_BULK_IOC_INPUT_CHARS.toLocaleString()} characters
          </span>
        </label>

        <fieldset className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <legend className="citem-label mb-2">Shared observation metadata</legend>
          <label className="block text-sm text-stone-300">
            Confidence
            <select
              className="field mt-1"
              value={confidence}
              onChange={(event) => {
                setConfidence(
                  event.currentTarget.value as (typeof confidenceLevels)[number],
                );
                invalidatePreview();
              }}
            >
              {confidenceLevels.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-stone-300">
            Source label
            <input
              className="field mt-1"
              value={sourceLabel}
              maxLength={500}
              onChange={(event) => {
                setSourceLabel(event.currentTarget.value);
                invalidatePreview();
              }}
              placeholder="Analyst collection, vendor report…"
            />
          </label>
          <label className="block text-sm text-stone-300">
            Observed at
            <input
              className="field mt-1"
              type="datetime-local"
              value={observedAt}
              onChange={(event) => {
                setObservedAt(event.currentTarget.value);
                invalidatePreview();
              }}
            />
          </label>
          <label className="block text-sm text-stone-300">
            Tags
            <input
              className="field mt-1"
              value={tags}
              onChange={(event) => {
                setTags(event.currentTarget.value);
                invalidatePreview();
              }}
              placeholder="phishing, credential-theft"
            />
          </label>
          <label className="block text-sm text-stone-300 md:col-span-2">
            Analyst note
            <textarea
              className="field mt-1 min-h-24"
              value={analystNote}
              maxLength={5000}
              onChange={(event) => {
                setAnalystNote(event.currentTarget.value);
                invalidatePreview();
              }}
            />
          </label>
          <label className="flex items-start gap-2 text-sm text-stone-300 md:col-span-2 xl:col-span-3">
            <input
              className="mt-1"
              type="checkbox"
              checked={addExistingObservations}
              onChange={(event) => {
                setAddExistingObservations(event.currentTarget.checked);
                invalidatePreview();
              }}
            />
            <span>
              Add a new observation when a canonical IOC already exists. The
              Indicator is not duplicated; only the newly observed form and
              metadata are preserved.
            </span>
          </label>
        </fieldset>

        <div className="flex flex-wrap gap-3">
          <button
            className="citem-button-ghost"
            type="button"
            disabled={pending || !text.trim()}
            onClick={runPreview}
          >
            {pending ? "Checking…" : "1. Preview IOC intake"}
          </button>
          {canImport ? (
            <button
              className="citem-button"
              type="button"
              disabled={pending}
              onClick={runImport}
            >
              {pending ? "Importing…" : "2. Confirm valid import"}
            </button>
          ) : null}
        </div>
      </div>

      {preview && !preview.ok ? (
        <p className="mt-4 text-sm text-red-300" role="alert">
          {preview.error}
        </p>
      ) : null}

      {preview?.ok ? (
        <div className="mt-5">
          <div className="flex flex-wrap gap-2" aria-label="IOC preview summary">
            <span className="citem-badge" data-tone="secure">
              {preview.summary.NEW} valid new
            </span>
            <span className="citem-badge" data-tone="attention">
              {preview.summary.ALREADY_EXISTS} already exist
            </span>
            <span className="citem-badge" data-tone="attention">
              {preview.summary.DUPLICATE_IN_INPUT} duplicate in input
            </span>
            <span className="citem-badge" data-tone="critical">
              {preview.summary.INVALID} invalid
            </span>
            <span className="citem-badge" data-tone="critical">
              {preview.summary.UNSUPPORTED_CVE} CVE module
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-left text-xs">
              <thead className="text-stone-500">
                <tr className="border-b border-stone-800">
                  <th className="p-2">Line</th>
                  <th className="p-2">Observed value</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Canonical value</th>
                  <th className="p-2">Safe display</th>
                  <th className="p-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr
                    className="border-b border-stone-900 align-top"
                    key={`${row.lineNumber}:${row.observedValue}`}
                  >
                    <td className="p-2 text-stone-500">{row.lineNumber}</td>
                    <td className="max-w-64 break-all p-2 font-mono text-stone-200">
                      {row.observedValue}
                    </td>
                    <td className="p-2 text-stone-300">
                      {row.detectedType ?? "—"}
                      {row.hashAlgorithm ? ` / ${row.hashAlgorithm}` : ""}
                    </td>
                    <td className="max-w-72 break-all p-2 font-mono text-stone-400">
                      {row.canonicalValue ?? "—"}
                    </td>
                    <td className="max-w-72 break-all p-2 font-mono text-stone-400">
                      {row.defangedValue ?? "—"}
                    </td>
                    <td className="p-2">
                      <span
                        className="citem-badge"
                        data-tone={tone(row.classification)}
                      >
                        {classificationLabels[row.classification]}
                      </span>
                      {row.validationMessage ? (
                        <p className="mt-2 max-w-64 leading-5 text-stone-500">
                          {row.validationMessage}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {importResult ? (
        importResult.ok ? (
          <div className="mt-5 rounded border border-emerald-900/40 bg-emerald-950/10 p-3 text-sm text-stone-300">
            <p className="font-semibold text-emerald-300">Import completed</p>
            <p className="mt-2 leading-6">
              {importResult.indicatorsCreated} Indicators created ·{" "}
              {importResult.existingIndicatorsMatched} existing matched ·{" "}
              {importResult.observationsCreated} observations created ·{" "}
              {importResult.duplicateRowsSkipped} duplicate rows skipped ·{" "}
              {importResult.invalidRowsSkipped} invalid skipped ·{" "}
              {importResult.unsupportedRowsSkipped} unsupported skipped ·{" "}
              {importResult.conflictsEncountered} conflicts
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {importResult.error}
          </p>
        )
      ) : null}
    </section>
  );
}
