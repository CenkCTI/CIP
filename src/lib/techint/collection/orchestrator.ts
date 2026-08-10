import "server-only";

import { reconcileNewTechnicalEntitiesWorkflow } from "@/lib/techint/entities/trusted-client";
import { evaluateTechnicalSignalIntelligenceBatchWorkflow } from "@/lib/techint/intelligence/trusted-client";
import { recordTechnicalSignal } from "@/lib/techint/signals/trusted-signal-client";
import { adapterResultSchema, collectionClaimSchema } from "./schema";
import { controlledCollectionError, CollectionError } from "./errors";
import { resolveTechnicalSourceCredential } from "./credentials";
import { getTechnicalSourceAdapter } from "./registry";
import { completeTechnicalCollection, failTechnicalCollection } from "./trusted-collection-client";
import { emptyCollectionCounters, type CollectionCounters } from "./types";

const POST_SYNC_RECONCILE_BATCH = 500;
const POST_SYNC_RECONCILE_MAX_BATCHES = 10;
const POST_SYNC_INTELLIGENCE_BATCH = 250;

function concurrency(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.TECHINT_COLLECTION_CONCURRENCY ?? "2";
  if (!/^\d+$/.test(raw)) throw new CollectionError("COLLECTION_FAILED", "Invalid collection concurrency configuration.");
  const value = Number(raw);
  if (value < 1 || value > 4) throw new CollectionError("COLLECTION_FAILED", "Invalid collection concurrency configuration.");
  return value;
}

function recorderDiagnosticCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  if ("safeSqlState" in error) {
    const value = (error as { safeSqlState?: unknown }).safeSqlState;
    if (typeof value === "string" && /^[0-9A-Z]{5}$/.test(value)) return `RECORDER_SQLSTATE_${value}`;
  }
  if ("safeRpcCode" in error) {
    const value = (error as { safeRpcCode?: unknown }).safeRpcCode;
    if (typeof value === "string" && /^PGRST[0-9A-Z]{3}$/.test(value)) return `RECORDER_RPC_${value}`;
  }
  if ("stage" in error) {
    const value = (error as { stage?: unknown }).stage;
    if (value === "TRANSPORT") return "RECORDER_TRANSPORT";
    if (value === "RPC_UNCLASSIFIED") return "RECORDER_RPC_UNCLASSIFIED";
    if (value === "RESULT_SCHEMA") return "RECORDER_RESULT_SCHEMA";
  }
  return null;
}

async function mapLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += limit) {
    const settled = await Promise.allSettled(items.slice(index, index + limit).map(worker));
    const rejected = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (rejected) throw rejected.reason;
  }
}

function updateDisposition(counters: CollectionCounters, disposition: string) {
  if (disposition === "SUPPORTING") counters.supportingObservations += 1;
  if (disposition === "STALE") counters.staleObservations += 1;
  if (disposition === "CONFLICTING") counters.conflictingObservations += 1;
}

async function reconcileFreshTechnicalAssertions(actorId: string) {
  let batches = 0;
  let unseenProcessed = 0;
  let resolved = 0;
  let needsReview = 0;
  let entitiesCreated = 0;
  let truncated = false;

  for (let batch = 0; batch < POST_SYNC_RECONCILE_MAX_BATCHES; batch += 1) {
    const result = await reconcileNewTechnicalEntitiesWorkflow({ p_actor: actorId, p_limit: POST_SYNC_RECONCILE_BATCH });
    batches += 1;
    unseenProcessed += result.unseen_processed ?? result.processed;
    resolved += result.resolved;
    needsReview += result.needs_review;
    entitiesCreated += result.entities_created;

    if (result.processed < POST_SYNC_RECONCILE_BATCH) break;
    if (batch === POST_SYNC_RECONCILE_MAX_BATCHES - 1) truncated = true;
  }

  return { batches, unseenProcessed, resolved, needsReview, entitiesCreated, truncated };
}

async function evaluateFreshTechnicalIntelligence(actorId: string, signalIds: string[]) {
  const unique = [...new Set(signalIds)];
  let batches = 0;
  let evaluated = 0;
  let profileMatchesChanged = 0;
  for (let index = 0; index < unique.length; index += POST_SYNC_INTELLIGENCE_BATCH) {
    const ids = unique.slice(index, index + POST_SYNC_INTELLIGENCE_BATCH);
    const result = await evaluateTechnicalSignalIntelligenceBatchWorkflow({ p_actor: actorId, p_signal_ids: ids });
    batches += 1;
    evaluated += result.evaluated;
    profileMatchesChanged += result.profile_matches_changed;
  }
  return { batches, requested: unique.length, evaluated, profileMatchesChanged };
}

export async function runClaimedTechnicalCollection(rawClaim: unknown, fetchImpl: typeof fetch = fetch) {
  const claim = collectionClaimSchema.parse(rawClaim);
  const counters = emptyCollectionCounters();
  let entityAssertionsCreated = 0;
  const intelligenceSignalIds = new Set<string>();
  let issues: Array<{ kind: "SKIPPED" | "WARNING" | "ERROR"; code: string; message: string; sourceRecordKey?: string | null }> = [];
  try {
    const adapter = getTechnicalSourceAdapter(claim.source_key);
    const credential = await resolveTechnicalSourceCredential(claim.source_key, claim.owner_id);
    const rawResult = await adapter.collect({
      now: new Date(),
      cursor: claim.cursor,
      settings: claim.settings,
      fetchImpl,
      credential,
    });
    if (rawResult.signals.length > 2500) {
      throw new CollectionError("SIGNAL_LIMIT_EXCEEDED", "The collection signal limit was exceeded.");
    }
    const result = adapterResultSchema.parse(rawResult);
    counters.recordsSeen = result.recordsSeen;
    counters.recordsMapped = result.recordsMapped;
    counters.skippedRecords = result.recordsSeen - result.recordsMapped;
    issues = result.issues;

    await mapLimit(result.signals, concurrency(), async (mapped) => {
      let recorded;
      try {
        recorded = await recordTechnicalSignal({ actorId: claim.owner_id, ...mapped });
      } catch (error) {
        throw new CollectionError(
          "SIGNAL_RECORDING_FAILED",
          "A mapped Technical Signal could not be recorded.",
          mapped.observation.sourceRecordKey,
          recorderDiagnosticCode(error),
        );
      }
      if (recorded.signal_created) counters.signalsCreated += 1;
      if (recorded.observation_created) counters.observationsCreated += 1;
      if (recorded.revision_created) counters.revisionsCreated += 1;
      if (recorded.duplicate_observation) counters.duplicateObservations += 1;
      entityAssertionsCreated += recorded.entity_assertions_created;
      if (recorded.signal_created || recorded.observation_created || recorded.revision_created) intelligenceSignalIds.add(recorded.signal_id);
      updateDisposition(counters, recorded.disposition);
    });

    const completion = await completeTechnicalCollection({
      runId: claim.run_id,
      leaseToken: claim.lease_token,
      proposedCursor: result.nextCursor,
      counters,
      issues,
    });

    // Collection success is authoritative. Entity reconciliation and derived intelligence
    // are post-collection projections and must never turn a completed source run into a failure.
    let entityReconciliation: Awaited<ReturnType<typeof reconcileFreshTechnicalAssertions>> | null = null;
    if (entityAssertionsCreated > 0) {
      try {
        entityReconciliation = await reconcileFreshTechnicalAssertions(claim.owner_id);
      } catch {
        entityReconciliation = null;
      }
    }

    let intelligenceEvaluation: Awaited<ReturnType<typeof evaluateFreshTechnicalIntelligence>> | null = null;
    if (intelligenceSignalIds.size > 0) {
      try {
        intelligenceEvaluation = await evaluateFreshTechnicalIntelligence(claim.owner_id, [...intelligenceSignalIds]);
      } catch {
        intelligenceEvaluation = null;
      }
    }

    return {
      success: true as const,
      ...completion,
      counters,
      entityAssertionsCreated,
      entityReconciliation,
      intelligenceEvaluation,
    };
  } catch (error) {
    const controlled = controlledCollectionError(error);
    counters.failedRecords = Math.max(1, counters.failedRecords);
    if (controlled.sourceRecordKey) {
      const failureIssue = {
        kind: "ERROR" as const,
        code: controlled.diagnosticCode ?? controlled.code,
        message: controlled.message,
        sourceRecordKey: controlled.sourceRecordKey.slice(0, 300),
      };
      issues = [...issues.slice(0, 99), failureIssue];
    }
    try {
      await failTechnicalCollection({
        runId: claim.run_id,
        leaseToken: claim.lease_token,
        errorCode: controlled.code,
        errorMessage: controlled.message,
        counters,
        issues,
      });
    } catch {
      // The original controlled failure remains authoritative; never expose raw RPC details.
    }
    return { success: false as const, error: controlled.code, message: controlled.message, counters };
  }
}
