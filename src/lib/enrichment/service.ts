import "server-only";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { IndicatorType } from "@/lib/cti/indicators";
import {
  EnrichmentError,
  mapEnrichmentDatabaseError,
  safeEnrichmentError,
} from "@/lib/enrichment/errors";
import { getEnrichmentConfig, getEnrichmentProvider } from "@/lib/enrichment/registry";
import { providerResponseSchema } from "@/lib/enrichment/types";
import { requireOwnedProject } from "@/lib/projects/ownership";

const uuidSchema = z.string().uuid();
type Context = Awaited<ReturnType<typeof requireOwnedProject>>;
type RunRow = { id: string };
type SourceRow = { id: string };

export type EnrichmentExecutionResult =
  | {
      ok: true;
      runId: string;
      status: "SUCCEEDED" | "PARTIAL";
      resultCount: number;
      sourceId: string;
    }
  | {
      ok: false;
      runId?: string;
      code: string;
      error: string;
    };

async function insertRun(
  context: Context,
  input: {
    indicatorId: string;
    providerId: string;
    providerLabel: string;
    indicatorType: IndicatorType;
    indicatorValue: string;
    synthetic: boolean;
    status?: "PENDING" | "FAILED";
    safeCode?: string;
    safeMessage?: string;
  },
) {
  const now = new Date().toISOString();
  const { data, error } = await context.supabase
    .from("enrichment_runs")
    .insert({
      project_id: context.projectId,
      indicator_id: input.indicatorId,
      provider_id: input.providerId,
      provider_label_snapshot: input.providerLabel,
      indicator_type_snapshot: input.indicatorType,
      indicator_value_snapshot: input.indicatorValue,
      status: input.status ?? "PENDING",
      is_synthetic: input.synthetic,
      requested_by: context.user.id,
      requested_at: now,
      completed_at: input.status === "FAILED" ? now : null,
      safe_error_code: input.safeCode ?? null,
      safe_error_message: input.safeMessage ?? null,
    })
    .select("id")
    .single<RunRow>();
  if (error || !data) throw mapEnrichmentDatabaseError(error);
  return data.id;
}

async function failKnownRun(context: Context, runId: string, error: EnrichmentError) {
  await context.supabase
    .from("enrichment_runs")
    .update({
      status: "FAILED",
      completed_at: new Date().toISOString(),
      safe_error_code: error.safeCode,
      safe_error_message: error.message,
    })
    .eq("project_id", context.projectId)
    .eq("id", runId);
}

async function createRecordedFailure(
  context: Context,
  input: {
    indicatorId: string;
    providerId: string;
    providerLabel: string;
    indicatorType: IndicatorType;
    indicatorValue: string;
    synthetic: boolean;
    failure: EnrichmentError;
  },
): Promise<EnrichmentExecutionResult> {
  try {
    const runId = await insertRun(context, {
      ...input,
      status: "FAILED",
      safeCode: input.failure.safeCode,
      safeMessage: input.failure.message,
    });
    revalidatePath(`/projects/${context.projectId}/indicators/${input.indicatorId}`);
    return { ok: false, runId, code: input.failure.safeCode, error: input.failure.message };
  } catch (error) {
    const safe = safeEnrichmentError(error);
    return { ok: false, code: safe.safeCode, error: safe.message };
  }
}

async function createOrReuseProviderSource(
  context: Context,
  provider: ReturnType<typeof getEnrichmentProvider>,
) {
  const externalKey = `enrichment-provider:${provider.id}`;
  const existing = await context.supabase
    .from("sources")
    .select("id")
    .eq("project_id", context.projectId)
    .eq("external_key", externalKey)
    .maybeSingle<SourceRow>();
  if (existing.error) throw mapEnrichmentDatabaseError(existing.error);
  if (existing.data) {
    const { error } = await context.supabase
      .from("sources")
      .update({ archived_at: null })
      .eq("project_id", context.projectId)
      .eq("id", existing.data.id);
    if (error) throw mapEnrichmentDatabaseError(error);
    return existing.data.id;
  }

  const created = await context.supabase
    .from("sources")
    .insert({
      project_id: context.projectId,
      title: provider.displayName,
      source_type: "ENRICHMENT_PROVIDER",
      publisher: provider.displayName,
      reliability: "UNKNOWN",
      origin_kind: "PROVIDER",
      verification_state: "UNVERIFIED",
      description: provider.isSynthetic
        ? "Synthetic test provider identity used for deterministic Phase 2.1B acceptance."
        : "Server-configured enrichment provider identity.",
      analyst_notes: "",
      external_key: externalKey,
      created_by: context.user.id,
    })
    .select("id")
    .single<SourceRow>();
  if (!created.error && created.data) return created.data.id;

  if (created.error?.code === "23505") {
    const raced = await context.supabase
      .from("sources")
      .select("id")
      .eq("project_id", context.projectId)
      .eq("external_key", externalKey)
      .single<SourceRow>();
    if (!raced.error && raced.data) return raced.data.id;
  }
  throw mapEnrichmentDatabaseError(created.error);
}

function safeRawData(value: Record<string, unknown> | null, enabled: boolean, maxBytes: number) {
  if (!enabled || !value) return null;
  const scrubbed = Object.fromEntries(
    Object.entries(value).filter(([key]) => !/(authorization|cookie|token|secret|api[_-]?key|password)/i.test(key)),
  );
  const encoded = JSON.stringify(scrubbed);
  if (Buffer.byteLength(encoded, "utf8") <= maxBytes) return scrubbed;
  return { truncated: true, reason: "Sanitized raw response exceeded the configured byte limit." };
}

export async function executeIndicatorEnrichment(
  projectId: string,
  indicatorId: string,
  providerId: string,
): Promise<EnrichmentExecutionResult> {
  try {
    if (!uuidSchema.safeParse(projectId).success || !uuidSchema.safeParse(indicatorId).success) {
      throw new EnrichmentError("AUTHORIZATION", "Investigation or Indicator not found.");
    }
    const context = await requireOwnedProject(projectId);
    const { data: indicator, error: indicatorError } = await context.supabase
      .from("indicators")
      .select("id,type,value,normalized_value")
      .eq("project_id", context.projectId)
      .eq("id", indicatorId)
      .single();
    if (indicatorError || !indicator) {
      throw new EnrichmentError("AUTHORIZATION", "Indicator not found in this Investigation.");
    }

    const provider = getEnrichmentProvider(providerId);
    const indicatorType = String(indicator.type) as IndicatorType;
    const canonicalValue = String(indicator.normalized_value || indicator.value);
    const common = {
      indicatorId,
      providerId: provider.id,
      providerLabel: provider.displayName,
      indicatorType,
      indicatorValue: canonicalValue,
      synthetic: provider.isSynthetic,
    };

    if (!provider.enabled || !provider.configured) {
      return createRecordedFailure(context, {
        ...common,
        failure: new EnrichmentError("PROVIDER_DISABLED", "The enrichment provider is disabled or not configured on the server."),
      });
    }
    if (!provider.supportedIndicatorTypes.includes(indicatorType)) {
      return createRecordedFailure(context, {
        ...common,
        failure: new EnrichmentError("UNSUPPORTED_TYPE", `The provider does not support ${indicatorType} Indicators.`),
      });
    }

    const config = getEnrichmentConfig();
    const { data: latest, error: latestError } = await context.supabase
      .from("enrichment_runs")
      .select("requested_at,status")
      .eq("project_id", context.projectId)
      .eq("indicator_id", indicatorId)
      .eq("provider_id", provider.id)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw mapEnrichmentDatabaseError(latestError);
    if (latest && ["PENDING", "RUNNING"].includes(String(latest.status))) {
      return {
        ok: false,
        code: "ACTIVE_RUN",
        error: "An enrichment run is already active for this Indicator and provider.",
      };
    }
    if (latest && config.cooldownSeconds > 0) {
      const elapsedSeconds = (Date.now() - new Date(String(latest.requested_at)).getTime()) / 1000;
      if (elapsedSeconds < config.cooldownSeconds) {
        return createRecordedFailure(context, {
          ...common,
          failure: new EnrichmentError(
            "COOLDOWN",
            `Wait ${Math.ceil(config.cooldownSeconds - elapsedSeconds)} seconds before running this provider again.`,
          ),
        });
      }
    }

    const runId = await insertRun(context, common);
    const startedAt = new Date().toISOString();
    const running = await context.supabase
      .from("enrichment_runs")
      .update({ status: "RUNNING", started_at: startedAt })
      .eq("project_id", context.projectId)
      .eq("id", runId);
    if (running.error) throw mapEnrichmentDatabaseError(running.error);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), provider.requestTimeoutMs);
      let rawResponse: unknown;
      try {
        rawResponse = await provider.query({
          indicatorType,
          canonicalValue,
          signal: controller.signal,
          context: { projectId: context.projectId, indicatorId, maxResults: 12 },
        });
      } finally {
        clearTimeout(timeout);
      }

      const parsed = providerResponseSchema.safeParse(rawResponse);
      if (!parsed.success) {
        throw new EnrichmentError("MALFORMED_RESPONSE", "The provider returned a response that failed CİTEM's normalized schema validation.");
      }

      const queriedAt = new Date().toISOString();
      const responseHash = createHash("sha256")
        .update(JSON.stringify(parsed.data))
        .digest("hex");
      const sourceId = await createOrReuseProviderSource(context, provider);
      const defaultExpiry = new Date(Date.now() + provider.freshnessSeconds * 1000).toISOString();
      const rows = parsed.data.results.map((result) => ({
        project_id: context.projectId,
        run_id: runId,
        indicator_id: indicatorId,
        source_id: sourceId,
        category: result.category,
        schema_version: result.normalized.schema_version,
        normalized_data: result.normalized,
        provider_observed_at: result.provider_observed_at,
        queried_at: queriedAt,
        expires_at: result.expires_at ?? defaultExpiry,
        confidence: result.confidence,
        response_hash: responseHash,
        safe_raw_data: safeRawData(result.sanitized_raw, config.storeRawResponses, config.maxRawResponseBytes),
      }));

      const inserted = await context.supabase.from("enrichment_results").insert(rows);
      if (inserted.error) throw mapEnrichmentDatabaseError(inserted.error);

      const completed = await context.supabase
        .from("enrichment_runs")
        .update({ status: "SUCCEEDED", completed_at: new Date().toISOString(), safe_error_code: null, safe_error_message: null })
        .eq("project_id", context.projectId)
        .eq("id", runId);
      if (completed.error) throw mapEnrichmentDatabaseError(completed.error);

      revalidatePath(`/projects/${context.projectId}/indicators/${indicatorId}`);
      return { ok: true, runId, status: "SUCCEEDED", resultCount: rows.length, sourceId };
    } catch (error) {
      const safe = safeEnrichmentError(error);
      await failKnownRun(context, runId, safe);
      revalidatePath(`/projects/${context.projectId}/indicators/${indicatorId}`);
      return { ok: false, runId, code: safe.safeCode, error: safe.message };
    }
  } catch (error) {
    const safe = safeEnrichmentError(error);
    return { ok: false, code: safe.safeCode, error: safe.message };
  }
}
