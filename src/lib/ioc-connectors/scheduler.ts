import "server-only";

import { executeClaimedIocSync } from "./orchestrator";
import { claimDueIocConnections } from "./trusted-workflow-client";

export type IocSchedulerConfig = { batchSize: number; concurrency: number };

function boundedInteger(value: string | undefined, fallback: number, maximum: number) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new Error("INVALID_IOC_SCHEDULER_CONFIGURATION");
  const parsed = Number(value);
  if (parsed < 1 || parsed > maximum) throw new Error("INVALID_IOC_SCHEDULER_CONFIGURATION");
  return parsed;
}

export function iocSchedulerConfig(env: NodeJS.ProcessEnv = process.env): IocSchedulerConfig {
  return {
    batchSize: boundedInteger(env.IOC_SYNC_BATCH_SIZE, 10, 20),
    concurrency: boundedInteger(env.IOC_SYNC_CONCURRENCY, 2, 4),
  };
}

export async function runDueIocSyncs(config: IocSchedulerConfig, deadline: number) {
  let claimed = 0;
  let succeeded = 0;
  let failed = 0;
  while (claimed < config.batchSize && Date.now() < deadline) {
    const size = Math.min(config.concurrency, config.batchSize - claimed);
    const { data, error } = await claimDueIocConnections(size);
    if (error) throw new Error("IOC_SCHEDULER_CLAIM_FAILED");
    const claims = data ?? [];
    if (!claims.length) break;
    claimed += claims.length;
    const results = await Promise.all(claims.map(executeClaimedIocSync));
    for (const result of results) {
      if ("success" in result) succeeded++;
      else failed++;
    }
    if (claims.length < size) break;
  }
  return { claimed, succeeded, failed };
}
