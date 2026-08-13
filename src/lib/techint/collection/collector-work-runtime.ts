import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { reconcileNewTechnicalEntitiesWorkflow } from "@/lib/techint/entities/trusted-client";
import { evaluateTechnicalSignalIntelligenceBatchWorkflow } from "@/lib/techint/intelligence/trusted-client";
import { recordTechnicalSignal } from "@/lib/techint/signals/trusted-signal-client";
import { adapterResultSchema } from "./schema";
import { controlledCollectionError, CollectionError } from "./errors";
import { resolveTechnicalSourceCredential } from "./credentials";
import { getTechnicalSourceAdapter } from "./registry";
import {
  authenticateTechnicalCollector,
  checkpointIncrementalTechnicalCollection,
  completeIncrementalTechnicalCollection,
  failIncrementalTechnicalCollection,
  finishTechnicalCollectorTick,
  getIncrementalTechnicalCollectionWorkClaim,
} from "./trusted-collection-client";
import { emptyCollectionCounters, type CollectionCounters } from "./types";
import { assertLegacyCollectionAllowed, collectionAuthorityEnforced } from "./authority";

export const MAX_COLLECTOR_WORK_UNIT_SIGNALS = 100;
const DEFAULT_WORK_UNIT_SIGNALS = 50;

const workStateSchema = z.object({
  version: z.literal(1),
  snapshotAt: z.iso.datetime({ offset: true }),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  totalSignals: z.number().int().nonnegative().max(2500),
  nextOffset: z.number().int().nonnegative().max(2500),
}).strict();

function unitLimit(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.TECHINT_COLLECTOR_WORK_UNIT_SIGNALS ?? String(DEFAULT_WORK_UNIT_SIGNALS);
  if (!/^\d+$/.test(raw)) return DEFAULT_WORK_UNIT_SIGNALS;
  return Math.min(MAX_COLLECTOR_WORK_UNIT_SIGNALS, Math.max(10, Number(raw)));
}

function stableSnapshotHash(result: z.infer<typeof adapterResultSchema>) {
  const hash = createHash("sha256");
  for (const mapped of result.signals) {
    hash.update(mapped.observation.sourceSystem);
    hash.update("\0");
    hash.update(mapped.observation.sourceRecordKey);
    hash.update("\0");
    hash.update(mapped.observation.sourceRevisionKey ?? "");
    hash.update("\n");
  }
  return hash.digest("hex");
}

function updateDisposition(counters: CollectionCounters, disposition: string) {
  if (disposition === "SUPPORTING") counters.supportingObservations += 1;
  if (disposition === "STALE") counters.staleObservations += 1;
  if (disposition === "CONFLICTING") counters.conflictingObservations += 1;
}

function addCounters(target: CollectionCounters, source: CollectionCounters) {
  for (const key of Object.keys(target) as Array<keyof CollectionCounters>) target[key] += source[key];
  return target;
}

async function recordBoundedBatch(actorId: string, signals: z.infer<typeof adapterResultSchema>["signals"]) {
  const counters = emptyCollectionCounters();
  const signalIds: string[] = [];
  let assertions = 0;
  for (const mapped of signals) {
    let recorded;
    try {
      recorded = await recordTechnicalSignal({ actorId, ...mapped });
    } catch {
      throw new CollectionError("SIGNAL_RECORDING_FAILED", "A bounded Technical Signal work unit could not be recorded.");
    }
    if (recorded.signal_created) counters.signalsCreated += 1;
    if (recorded.observation_created) counters.observationsCreated += 1;
    if (recorded.revision_created) counters.revisionsCreated += 1;
    if (recorded.duplicate_observation) counters.duplicateObservations += 1;
    assertions += recorded.entity_assertions_created;
    signalIds.push(recorded.signal_id);
    updateDisposition(counters, recorded.disposition);
  }

  if (assertions > 0) {
    try {
      await reconcileNewTechnicalEntitiesWorkflow({ p_actor: actorId, p_limit: Math.min(500, Math.max(1, signals.length * 5)) });
    } catch {
      // Derived projection failure does not invalidate durably recorded source truth.
    }
  }
  if (signalIds.length > 0) {
    try {
      await evaluateTechnicalSignalIntelligenceBatchWorkflow({ p_actor: actorId, p_signal_ids: signalIds });
    } catch {
      // Global Priority/Profile projections can be retried independently.
    }
  }
  return counters;
}

export type CollectorWorkUnitResult =
  | { authorized: false }
  | {
      authorized: true;
      enabled: boolean;
      sourceKey: string;
      runId: string;
      done: boolean;
      success: boolean;
      workUnitsCompleted: number;
      processedThisUnit: number;
      nextOffset: number;
      totalSignals: number;
      errorCode: string | null;
    };

export async function runTechnicalCollectorWorkUnit(input: {
  token: string;
  runId: string;
  leaseToken: string;
  fetchImpl?: typeof fetch;
}): Promise<CollectorWorkUnitResult> {
  const auth = await authenticateTechnicalCollector(input.token);
  if (!auth) return { authorized: false };
  if (!auth.enabled) {
    return {
      authorized: true,
      enabled: false,
      sourceKey: "",
      runId: input.runId,
      done: true,
      success: false,
      workUnitsCompleted: 0,
      processedThisUnit: 0,
      nextOffset: 0,
      totalSignals: 0,
      errorCode: "COLLECTOR_PAUSED",
    };
  }

  let claim: Awaited<ReturnType<typeof getIncrementalTechnicalCollectionWorkClaim>> | null = null;
  try {
    claim = await getIncrementalTechnicalCollectionWorkClaim({
      ownerId: auth.owner_id,
      runId: input.runId,
      leaseToken: input.leaseToken,
    });
    if (collectionAuthorityEnforced()) assertLegacyCollectionAllowed(claim.source_key);
    const previous = Object.keys(claim.work_state).length ? workStateSchema.parse(claim.work_state) : null;
    const snapshotAt = previous?.snapshotAt ?? new Date().toISOString();
    const adapter = getTechnicalSourceAdapter(claim.source_key);
    const credential = await resolveTechnicalSourceCredential(claim.source_key, claim.owner_id);
    const result = adapterResultSchema.parse(await adapter.collect({
      now: new Date(snapshotAt),
      cursor: claim.cursor,
      settings: claim.settings,
      fetchImpl: input.fetchImpl ?? fetch,
      credential,
    }));

    const digest = stableSnapshotHash(result);
    if (previous && (previous.snapshotHash !== digest || previous.totalSignals !== result.signals.length)) {
      throw new CollectionError("COLLECTION_FAILED", "The upstream source snapshot changed during an incremental run.", null, "SOURCE_SNAPSHOT_CHANGED");
    }

    const offset = previous?.nextOffset ?? 0;
    if (offset > result.signals.length) {
      throw new CollectionError("COLLECTION_FAILED", "Incremental work state exceeded the current source snapshot.", null, "INVALID_WORK_OFFSET");
    }

    const batch = result.signals.slice(offset, offset + unitLimit());
    const counters = emptyCollectionCounters();
    if (offset === 0) {
      counters.recordsSeen = result.recordsSeen;
      counters.recordsMapped = result.recordsMapped;
      counters.skippedRecords = result.recordsSeen - result.recordsMapped;
    }
    addCounters(counters, await recordBoundedBatch(claim.owner_id, batch));
    const nextOffset = offset + batch.length;
    const checkpoint = await checkpointIncrementalTechnicalCollection({
      runId: claim.run_id,
      leaseToken: input.leaseToken,
      workState: { version: 1, snapshotAt, snapshotHash: digest, totalSignals: result.signals.length, nextOffset },
      counters,
      issues: offset === 0 ? result.issues : [],
    });

    const done = nextOffset >= result.signals.length;
    if (done) {
      await completeIncrementalTechnicalCollection({ runId: claim.run_id, leaseToken: input.leaseToken, proposedCursor: result.nextCursor });
      try {
        await finishTechnicalCollectorTick({ agentId: auth.agent_id, claimed: 1, succeeded: 1, failed: 0, errorCode: null });
      } catch {
        // Source completion is authoritative even if collector status bookkeeping fails.
      }
    }

    return {
      authorized: true,
      enabled: true,
      sourceKey: claim.source_key,
      runId: claim.run_id,
      done,
      success: true,
      workUnitsCompleted: checkpoint.work_units_completed,
      processedThisUnit: batch.length,
      nextOffset,
      totalSignals: result.signals.length,
      errorCode: null,
    };
  } catch (error) {
    const controlled = error instanceof Error && error.message === "LEASE_EXPIRED"
      ? new CollectionError("LEASE_EXPIRED", "The incremental collection lease expired before the next work unit.")
      : error instanceof Error && error.message === "LEASE_MISMATCH"
        ? new CollectionError("LEASE_MISMATCH", "The incremental collection lease did not match the claimed run.")
        : controlledCollectionError(error);

    if (claim) {
      try {
        await failIncrementalTechnicalCollection({
          runId: claim.run_id,
          leaseToken: input.leaseToken,
          errorCode: controlled.diagnosticCode ?? controlled.code,
          errorMessage: controlled.message,
        });
      } catch {}
      try {
        await finishTechnicalCollectorTick({
          agentId: auth.agent_id,
          claimed: 1,
          succeeded: 0,
          failed: 1,
          errorCode: controlled.diagnosticCode ?? controlled.code,
        });
      } catch {}
    }

    return {
      authorized: true,
      enabled: true,
      sourceKey: claim?.source_key ?? "UNKNOWN_SOURCE",
      runId: claim?.run_id ?? input.runId,
      done: true,
      success: false,
      workUnitsCompleted: claim?.work_units_completed ?? 0,
      processedThisUnit: 0,
      nextOffset: 0,
      totalSignals: 0,
      errorCode: controlled.diagnosticCode ?? controlled.code,
    };
  }
}
