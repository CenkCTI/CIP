import "server-only";

import {
  beginTechnicalCollectorTick,
  claimDueTechnicalCollectionsForOwner,
  finishTechnicalCollectorTick,
} from "./trusted-collection-client";
import { runClaimedTechnicalCollection } from "./orchestrator";

export type TechnicalCollectorTickResult =
  | { authorized: false }
  | {
      authorized: true;
      enabled: boolean;
      due: boolean;
      waitSeconds: number;
      claimed: number;
      succeeded: number;
      failed: number;
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
      succeeded: 0,
      failed: 0,
    };
  }

  let claimed = 0;
  let succeeded = 0;
  let failed = 0;
  let errorCode: string | null = null;

  try {
    const claims = await claimDueTechnicalCollectionsForOwner(tick.owner_id, MAX_COLLECTIONS_PER_TICK);
    claimed = claims.length;
    for (const claim of claims) {
      const result = await runClaimedTechnicalCollection(claim);
      if (result.success) succeeded += 1;
      else failed += 1;
    }
  } catch {
    errorCode = "COLLECTOR_TICK_FAILED";
  }

  await finishTechnicalCollectorTick({
    agentId: tick.agent_id,
    claimed,
    succeeded,
    failed,
    errorCode,
  });

  return {
    authorized: true,
    enabled: true,
    due: true,
    waitSeconds: tick.poll_interval_seconds,
    claimed,
    succeeded,
    failed,
  };
}
