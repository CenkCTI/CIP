import "server-only";

import {
  beginTechnicalCollectorTick,
  claimDueTechnicalCollectionsForOwner,
  finishTechnicalCollectorTick,
} from "./trusted-collection-client";

type TechnicalCollectorRunClaim = {
  runId: string;
  sourceKey: string;
  leaseToken: string;
  leaseExpiresAt: string;
};

export type TechnicalCollectorTickResult =
  | { authorized: false }
  | {
      authorized: true;
      enabled: boolean;
      due: boolean;
      waitSeconds: number;
      claimed: number;
      runs: TechnicalCollectorRunClaim[];
    };

const MAX_COLLECTIONS_PER_TICK = 1;

export async function runTechnicalCollectorTick(token: string): Promise<TechnicalCollectorTickResult> {
  const tick = await beginTechnicalCollectorTick(token);
  if (!tick) return { authorized: false };

  if (!tick.enabled || !tick.due) {
    return {
      authorized: true,
      enabled: tick.enabled,
      due: false,
      waitSeconds: tick.wait_seconds,
      claimed: 0,
      runs: [],
    };
  }

  try {
    const claims = await claimDueTechnicalCollectionsForOwner(tick.owner_id, MAX_COLLECTIONS_PER_TICK);
    if (claims.length === 0) {
      await finishTechnicalCollectorTick({
        agentId: tick.agent_id,
        claimed: 0,
        succeeded: 0,
        failed: 0,
        errorCode: null,
      });
    }
    return {
      authorized: true,
      enabled: true,
      due: true,
      waitSeconds: tick.poll_interval_seconds,
      claimed: claims.length,
      runs: claims.map((claim) => ({
        runId: claim.run_id,
        sourceKey: claim.source_key,
        leaseToken: claim.lease_token,
        leaseExpiresAt: claim.lease_expires_at,
      })),
    };
  } catch {
    await finishTechnicalCollectorTick({
      agentId: tick.agent_id,
      claimed: 0,
      succeeded: 0,
      failed: 0,
      errorCode: "COLLECTOR_CLAIM_FAILED",
    });
    throw new Error("COLLECTOR_CLAIM_FAILED");
  }
}
