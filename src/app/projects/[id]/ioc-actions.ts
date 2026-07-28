"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  isCanonicalIndicatorConflict,
  mapIndicatorImportError,
} from "@/lib/cti/import-errors";
import {
  MAX_BULK_IOC_INPUT_CHARS,
  parseBulkIndicatorInput,
  type BulkIocClassification,
  type ParsedBulkIocRow,
} from "@/lib/cti/indicators";
import {
  buildRelationshipRpcPayload,
  confidenceLevels,
  formObj,
  indicatorSchema,
  parseRelationshipSelections,
} from "@/lib/cti-schema";
import { requireOwnedProject } from "@/lib/projects/ownership";

const optionalDate = z.preprocess(
  (value) => (value === "" || value == null ? null : value),
  z
    .union([z.string(), z.null()])
    .refine(
      (value) =>
        value === null ||
        (typeof value === "string" && !Number.isNaN(new Date(value).getTime())),
      "Use a valid observed time.",
    )
    .transform((value) =>
      value === null ? null : new Date(value).toISOString(),
    ),
);

const bulkMetadataSchema = z
  .object({
    text: z.string().max(MAX_BULK_IOC_INPUT_CHARS),
    confidence: z.enum(confidenceLevels).default("MEDIUM"),
    sourceLabel: z.string().trim().max(500).optional().default(""),
    tags: z
      .array(z.string().trim().min(1).max(40))
      .max(12)
      .default([]),
    observedAt: optionalDate.default(null),
    analystNote: z.string().trim().max(5000).optional().default(""),
    addObservationsForExisting: z.boolean().default(true),
  })
  .strict();

export type BulkIocInput = z.input<typeof bulkMetadataSchema>;

type ExistingIndicator = {
  id: string;
  type: string;
  normalized_value: string;
};
type BulkSummary = Record<BulkIocClassification, number>;
type FormState = { error?: string; success?: string };
type ImportRpcOutcome = {
  ok?: boolean;
  error?: string;
  indicator_id?: string;
  indicator_created?: boolean;
  observation_created?: boolean;
};

type PreviewSuccess = {
  ok: true;
  rows: ParsedBulkIocRow[];
  summary: BulkSummary;
};
type PreviewFailure = { ok: false; error: string };
export type BulkIocPreviewResult = PreviewSuccess | PreviewFailure;

export type BulkIocImportResult =
  | {
      ok: true;
      indicatorsCreated: number;
      existingIndicatorsMatched: number;
      observationsCreated: number;
      duplicateRowsSkipped: number;
      invalidRowsSkipped: number;
      unsupportedRowsSkipped: number;
      conflictsEncountered: number;
    }
  | { ok: false; error: string };

function summarizeBulkIocRows(rows: ParsedBulkIocRow[]): BulkSummary {
  return rows.reduce<BulkSummary>(
    (summary, row) => {
      summary[row.classification] += 1;
      return summary;
    },
    {
      NEW: 0,
      DUPLICATE_IN_INPUT: 0,
      ALREADY_EXISTS: 0,
      INVALID: 0,
      UNSUPPORTED_CVE: 0,
    },
  );
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function markExistingIndicators(
  supabase: Awaited<ReturnType<typeof requireOwnedProject>>["supabase"],
  projectId: string,
  rows: ParsedBulkIocRow[],
) {
  const candidates = rows.filter(
    (row) =>
      row.classification === "NEW" &&
      row.detectedType !== null &&
      row.canonicalValue !== null,
  );
  const existing = new Map<string, string>();

  for (const type of ["IP", "DOMAIN", "URL", "HASH", "EMAIL"] as const) {
    const values = candidates
      .filter((row) => row.detectedType === type)
      .map((row) => row.canonicalValue as string);

    for (const valueChunk of chunk([...new Set(values)], 75)) {
      if (!valueChunk.length) continue;
      const { data, error } = await supabase
        .from("indicators")
        .select("id,type,normalized_value")
        .eq("project_id", projectId)
        .eq("type", type)
        .in("normalized_value", valueChunk)
        .returns<ExistingIndicator[]>();

      if (error) throw new Error("IOC duplicate check failed");
      for (const indicator of data ?? []) {
        existing.set(
          `${indicator.type}:${indicator.normalized_value}`,
          indicator.id,
        );
      }
    }
  }

  return rows.map((row) => {
    if (
      row.classification !== "NEW" ||
      !row.detectedType ||
      !row.canonicalValue
    ) {
      return row;
    }
    const id = existing.get(`${row.detectedType}:${row.canonicalValue}`);
    return id
      ? {
          ...row,
          classification: "ALREADY_EXISTS" as const,
          existingIndicatorId: id,
          validationMessage:
            "This canonical IOC already exists in the Investigation.",
        }
      : row;
  });
}

async function preparePreview(projectId: string, input: BulkIocInput) {
  const parsedInput = bulkMetadataSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false as const,
      error:
        parsedInput.error.issues[0]?.message ?? "Invalid bulk IOC request.",
    };
  }

  const context = await requireOwnedProject(projectId);
  let parsedRows: ParsedBulkIocRow[];
  try {
    parsedRows = parseBulkIndicatorInput(parsedInput.data.text).rows;
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Bulk IOC parsing failed.",
    };
  }

  try {
    const rows = await markExistingIndicators(
      context.supabase,
      context.projectId,
      parsedRows,
    );
    return {
      ok: true as const,
      context,
      metadata: parsedInput.data,
      rows,
      summary: summarizeBulkIocRows(rows),
    };
  } catch {
    return {
      ok: false as const,
      error: "Existing Indicators could not be checked safely.",
    };
  }
}

export async function createManualIndicator(
  projectId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const context = await requireOwnedProject(projectId);
    const observedValue = String(formData.get("value") ?? "");
    const parsedIndicator = indicatorSchema.safeParse(formObj(formData));
    if (!parsedIndicator.success) {
      return {
        error:
          parsedIndicator.error.issues[0]?.message ?? "Invalid Indicator input.",
      };
    }

    const relationships = parseRelationshipSelections(formData);
    if (!relationships.success) return { error: relationships.error };

    const indicator = parsedIndicator.data;
    const { data, error } = await context.supabase.rpc(
      "import_indicator_observation",
      {
        p_project_id: context.projectId,
        p_value: indicator.value,
        p_type: indicator.type,
        p_confidence: indicator.confidence,
        p_source: indicator.source,
        p_tags: indicator.tags,
        p_first_seen: indicator.first_seen,
        p_observed_value: observedValue,
        p_observed_at: indicator.first_seen,
        p_origin_kind: "MANUAL",
        p_source_label: indicator.source,
        p_analyst_note: indicator.analyst_rationale ?? "",
        p_add_observation_when_existing: false,
      },
    );
    const outcome = data as ImportRpcOutcome | null;

    if (error || !outcome?.ok || !outcome.indicator_id) {
      return { error: mapIndicatorImportError(error, outcome?.error) };
    }
    if (!outcome.indicator_created) {
      return {
        error: "A matching Indicator already exists in this Investigation.",
      };
    }

    const indicatorId = outcome.indicator_id;
    const { error: assessmentError } = await context.supabase
      .from("indicators")
      .update({
        status: indicator.status,
        analyst_rationale: indicator.analyst_rationale,
        current_relevance: indicator.current_relevance,
        last_seen: indicator.last_seen,
      })
      .eq("project_id", context.projectId)
      .eq("id", indicatorId);

    if (assessmentError) {
      await context.supabase
        .from("indicators")
        .delete()
        .eq("project_id", context.projectId)
        .eq("id", indicatorId);
      return { error: "Indicator assessment could not be saved." };
    }

    const { data: relationshipResult, error: relationshipError } =
      await context.supabase.rpc("replace_cti_relationships", {
        p_project_id: context.projectId,
        p_entity_id: indicatorId,
        ...buildRelationshipRpcPayload("indicators", relationships.data),
      });
    const relationshipOutcome = relationshipResult as
      | { ok?: boolean; error?: string }
      | null;

    if (relationshipError || !relationshipOutcome?.ok) {
      await context.supabase
        .from("indicators")
        .delete()
        .eq("project_id", context.projectId)
        .eq("id", indicatorId);
      return { error: "Indicator relationships could not be saved." };
    }

    revalidatePath(`/projects/${context.projectId}`);
    return { success: "Indicator and manual observation created." };
  } catch {
    return { error: "Investigation not found." };
  }
}

export async function previewBulkIndicators(
  projectId: string,
  input: BulkIocInput,
): Promise<BulkIocPreviewResult> {
  try {
    const result = await preparePreview(projectId, input);
    if (!result.ok) return result;
    return { ok: true, rows: result.rows, summary: result.summary };
  } catch {
    return { ok: false, error: "Investigation not found." };
  }
}

export async function importBulkIndicators(
  projectId: string,
  input: BulkIocInput,
): Promise<BulkIocImportResult> {
  try {
    const prepared = await preparePreview(projectId, input);
    if (!prepared.ok) return prepared;

    let indicatorsCreated = 0;
    let existingIndicatorsMatched = 0;
    let observationsCreated = 0;
    let conflictsEncountered = 0;

    for (const row of prepared.rows) {
      if (
        !["NEW", "ALREADY_EXISTS"].includes(row.classification) ||
        !row.detectedType ||
        !row.canonicalValue
      ) {
        continue;
      }

      if (
        row.classification === "ALREADY_EXISTS" &&
        !prepared.metadata.addObservationsForExisting
      ) {
        existingIndicatorsMatched += 1;
        continue;
      }

      const { data, error } = await prepared.context.supabase.rpc(
        "import_indicator_observation",
        {
          p_project_id: prepared.context.projectId,
          p_value: row.canonicalValue,
          p_type: row.detectedType,
          p_confidence: prepared.metadata.confidence,
          p_source: prepared.metadata.sourceLabel || null,
          p_tags: prepared.metadata.tags,
          p_first_seen: prepared.metadata.observedAt,
          p_observed_value: row.observedValue,
          p_observed_at: prepared.metadata.observedAt,
          p_origin_kind: "BULK_INTAKE",
          p_source_label: prepared.metadata.sourceLabel || null,
          p_analyst_note: prepared.metadata.analystNote,
          p_add_observation_when_existing:
            prepared.metadata.addObservationsForExisting,
        },
      );
      const outcome = data as ImportRpcOutcome | null;

      if (error) {
        return { ok: false, error: mapIndicatorImportError(error) };
      }
      if (!outcome?.ok) {
        if (isCanonicalIndicatorConflict(outcome?.error)) {
          conflictsEncountered += 1;
          continue;
        }
        return {
          ok: false,
          error: mapIndicatorImportError(null, outcome?.error),
        };
      }

      if (outcome.indicator_created) indicatorsCreated += 1;
      else existingIndicatorsMatched += 1;
      if (outcome.observation_created) observationsCreated += 1;
    }

    revalidatePath(`/projects/${prepared.context.projectId}`);
    return {
      ok: true,
      indicatorsCreated,
      existingIndicatorsMatched,
      observationsCreated,
      duplicateRowsSkipped: prepared.summary.DUPLICATE_IN_INPUT,
      invalidRowsSkipped: prepared.summary.INVALID,
      unsupportedRowsSkipped: prepared.summary.UNSUPPORTED_CVE,
      conflictsEncountered,
    };
  } catch {
    return { ok: false, error: "Investigation not found." };
  }
}
