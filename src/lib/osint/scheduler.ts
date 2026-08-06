import "server-only";

import { timingSafeEqual } from "node:crypto";
import { iocSchedulerConfig, runDueIocSyncs, type IocSchedulerConfig } from "@/lib/ioc-connectors/scheduler";
import { ingestClaimedGlobalFeed } from "@/lib/osint/orchestrator";
import { claimDueGlobalFeeds } from "@/lib/research-feeds/trusted-workflow-client";
import { runDueTechnicalCollections, techIntSchedulerConfig, type TechIntSchedulerConfig } from "@/lib/techint/collection/scheduler";

export type SchedulerConfig = {
  enabled: boolean;
  batchSize: number;
  concurrency: number;
  budgetMs: number;
  secret: string;
  ioc?: IocSchedulerConfig;
  techint?: TechIntSchedulerConfig;
};
function integer(value: string | undefined, fallback: number, min: number, max: number) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new Error("INVALID_OSINT_SCHEDULER_CONFIGURATION");
  const result = Number(value);
  if (result < min || result > max) throw new Error("INVALID_OSINT_SCHEDULER_CONFIGURATION");
  return result;
}
export function schedulerConfig(env: NodeJS.ProcessEnv = process.env): SchedulerConfig {
  const enabled = env.OSINT_SCHEDULER_ENABLED === "true";
  if (env.OSINT_SCHEDULER_ENABLED && !["true", "false"].includes(env.OSINT_SCHEDULER_ENABLED)) {
    throw new Error("INVALID_OSINT_SCHEDULER_CONFIGURATION");
  }
  return {
    enabled,
    secret: env.CRON_SECRET ?? "",
    batchSize: integer(env.OSINT_FETCH_BATCH_SIZE, 20, 1, 20),
    concurrency: integer(env.OSINT_FETCH_CONCURRENCY, 3, 1, 3),
    budgetMs: integer(env.OSINT_SCHEDULER_TIME_BUDGET_MS, 45000, 5000, 45000),
    ioc: iocSchedulerConfig(env),
    techint: techIntSchedulerConfig(env),
  };
}
export function authorizeCron(header: string | null, secret: string) {
  if (!header?.startsWith("Bearer ") || header.includes(",")) return false;
  const supplied = header.slice(7);
  if (!secret || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function runScheduler(config: SchedulerConfig) {
  const emptyIoc = { claimed: 0, succeeded: 0, failed: 0 };
  const emptyTechInt = { claimed: 0, succeeded: 0, failed: 0, disabled: true };
  if (!config.enabled) return { claimed: 0, succeeded: 0, failed: 0, skipped: 0, disabled: true, ioc: emptyIoc, techint: emptyTechInt };
  const started = Date.now();
  let claimed = 0;
  let succeeded = 0;
  let failed = 0;
  while (claimed < config.batchSize && Date.now() - started < config.budgetMs) {
    const count = Math.min(config.concurrency, config.batchSize - claimed);
    const { data, error } = await claimDueGlobalFeeds({ p_limit: count });
    if (error) throw new Error("SCHEDULER_CLAIM_FAILED");
    const batch = data ?? [];
    if (!batch.length) break;
    claimed += batch.length;
    const results = await Promise.all(batch.map(ingestClaimedGlobalFeed));
    for (const result of results) {
      if ("success" in result) succeeded++;
      else failed++;
    }
    if (batch.length < count) break;
  }
  const deadline = started + config.budgetMs;
  const ioc = config.ioc ? await runDueIocSyncs(config.ioc, deadline) : emptyIoc;
  const techint = config.techint ? await runDueTechnicalCollections(config.techint, deadline) : emptyTechInt;
  return { claimed, succeeded, failed, skipped: 0, disabled: false, ...(config.ioc ? { ioc } : {}), ...(config.techint ? { techint } : {}) };
}
