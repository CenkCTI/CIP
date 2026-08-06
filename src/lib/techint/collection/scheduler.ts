import "server-only";

import { claimDueTechnicalCollections } from "./trusted-collection-client";
import { runClaimedTechnicalCollection } from "./orchestrator";

export type TechIntSchedulerConfig = {
  enabled: boolean;
  batchSize: number;
  concurrency: number;
};

function integer(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new Error("INVALID_TECHINT_SCHEDULER_CONFIGURATION");
  const parsed = Number(value);
  if (parsed < minimum || parsed > maximum) throw new Error("INVALID_TECHINT_SCHEDULER_CONFIGURATION");
  return parsed;
}

export function techIntSchedulerConfig(env: NodeJS.ProcessEnv = process.env): TechIntSchedulerConfig {
  if (env.TECHINT_SCHEDULER_ENABLED && !["true", "false"].includes(env.TECHINT_SCHEDULER_ENABLED)) {
    throw new Error("INVALID_TECHINT_SCHEDULER_CONFIGURATION");
  }
  return {
    enabled: env.TECHINT_SCHEDULER_ENABLED === "true",
    batchSize: integer(env.TECHINT_SYNC_BATCH_SIZE, 5, 1, 10),
    concurrency: integer(env.TECHINT_SYNC_CONCURRENCY, 2, 1, 4),
  };
}

export async function runDueTechnicalCollections(config: TechIntSchedulerConfig, deadline: number) {
  if (!config.enabled) return { claimed: 0, succeeded: 0, failed: 0, disabled: true };
  let claimed = 0;
  let succeeded = 0;
  let failed = 0;
  while (claimed < config.batchSize && Date.now() < deadline) {
    const count = Math.min(config.concurrency, config.batchSize - claimed);
    const batch = await claimDueTechnicalCollections(count);
    if (!batch.length) break;
    claimed += batch.length;
    const results = await Promise.all(batch.map((claim) => runClaimedTechnicalCollection(claim)));
    for (const result of results) {
      if (result.success) succeeded += 1;
      else failed += 1;
    }
    if (batch.length < count) break;
  }
  return { claimed, succeeded, failed, disabled: false };
}
