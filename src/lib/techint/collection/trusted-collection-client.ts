import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  collectionClaimSchema,
  collectionCountersSchema,
  collectionIssueSchema,
  collectionTriggerSchema,
  sourceKeySchema,
  sourceStatusSchema,
} from "./schema";

const collectorConfigurationSchema = z.object({
  agent_id: z.uuid(),
  enabled: z.boolean(),
  poll_interval_seconds: z.number().int().min(30).max(3600),
  token: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
});

const collectorTickSchema = z.object({
  agent_id: z.uuid(),
  owner_id: z.uuid(),
  enabled: z.boolean(),
  due: z.boolean(),
  poll_interval_seconds: z.number().int().min(30).max(3600),
  wait_seconds: z.number().int().nonnegative(),
});

function trustedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("TechINT collection trusted workflow is not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function rpc(name: string, parameters: Record<string, unknown>) {
  const { data, error } = await trustedClient().rpc(name, parameters);
  if (error) throw new Error("TECHINT_COLLECTION_RPC_FAILED");
  return data;
}

export async function enableTechnicalSourceWorkflow(input: {
  actorId: string;
  sourceKey: z.infer<typeof sourceKeySchema>;
  settings: Record<string, unknown>;
  intervalMinutes: number;
}) {
  const data = await rpc("enable_technical_source", {
    p_actor: input.actorId,
    p_source: input.sourceKey,
    p_settings: input.settings,
    p_interval_minutes: input.intervalMinutes,
  });
  return z.uuid().parse(data);
}

export async function setTechnicalSourceStatusWorkflow(input: {
  actorId: string;
  connectionId: string;
  status: z.infer<typeof sourceStatusSchema>;
}) {
  const data = await rpc("set_technical_source_status", {
    p_actor: input.actorId,
    p_connection_id: input.connectionId,
    p_status: input.status,
  });
  return sourceStatusSchema.parse(data);
}

export async function updateTechnicalSourceSettingsWorkflow(input: {
  actorId: string;
  connectionId: string;
  settings: Record<string, unknown>;
  intervalMinutes: number;
}) {
  const data = await rpc("update_technical_source_settings", {
    p_actor: input.actorId,
    p_connection_id: input.connectionId,
    p_settings: input.settings,
    p_interval_minutes: input.intervalMinutes,
  });
  return z.uuid().parse(data);
}

export async function claimManualTechnicalCollection(input: {
  actorId: string;
  connectionId: string;
  trigger?: z.infer<typeof collectionTriggerSchema>;
}) {
  const data = await rpc("claim_manual_technical_collection", {
    p_actor: input.actorId,
    p_connection_id: input.connectionId,
    p_trigger: input.trigger ?? "MANUAL",
  });
  return collectionClaimSchema.parse(data);
}

export async function claimDueTechnicalCollections(limit: number) {
  const data = await rpc("claim_due_technical_collections", { p_limit: limit });
  return z.array(collectionClaimSchema).parse(data ?? []);
}

export async function claimDueTechnicalCollectionsForOwner(ownerId: string, limit: number) {
  const data = await rpc("claim_due_technical_collections_for_owner", {
    p_owner: z.uuid().parse(ownerId),
    p_limit: z.number().int().min(1).max(10).parse(limit),
  });
  return z.array(collectionClaimSchema).parse(data ?? []);
}

export async function configureTechnicalCollectorWorkflow(input: {
  actorId: string;
  enabled: boolean;
  pollIntervalSeconds: number;
  rotateToken?: boolean;
  label?: string;
}) {
  const data = await rpc("configure_technical_collector", {
    p_actor: z.uuid().parse(input.actorId),
    p_enabled: input.enabled,
    p_poll_interval_seconds: z.number().int().min(30).max(3600).parse(input.pollIntervalSeconds),
    p_rotate_token: input.rotateToken ?? false,
    p_label: z.string().trim().min(1).max(100).parse(input.label ?? "Desktop collector"),
  });
  return collectorConfigurationSchema.parse(data);
}

export async function beginTechnicalCollectorTick(token: string) {
  const parsed = z.string().regex(/^[a-f0-9]{64}$/).safeParse(token);
  if (!parsed.success) return null;
  const { data, error } = await trustedClient().rpc("begin_technical_collector_tick", { p_token: parsed.data });
  if (error) {
    if (error.code === "28000" || String(error.message).includes("COLLECTOR_UNAUTHORIZED")) return null;
    throw new Error("TECHINT_COLLECTOR_RPC_FAILED");
  }
  return collectorTickSchema.parse(data);
}

export async function finishTechnicalCollectorTick(input: {
  agentId: string;
  claimed: number;
  succeeded: number;
  failed: number;
  errorCode?: string | null;
}) {
  const data = await rpc("finish_technical_collector_tick", {
    p_agent_id: z.uuid().parse(input.agentId),
    p_claimed: z.number().int().min(0).max(10).parse(input.claimed),
    p_succeeded: z.number().int().min(0).max(10).parse(input.succeeded),
    p_failed: z.number().int().min(0).max(10).parse(input.failed),
    p_error_code: input.errorCode ? z.string().min(1).max(100).parse(input.errorCode) : null,
  });
  return z.boolean().parse(data);
}

export async function completeTechnicalCollection(input: {
  runId: string;
  leaseToken: string;
  proposedCursor: Record<string, unknown>;
  counters: z.infer<typeof collectionCountersSchema>;
  issues: z.infer<typeof collectionIssueSchema>[];
}) {
  const data = await rpc("complete_technical_collection_run", {
    p_run_id: input.runId,
    p_lease_token: input.leaseToken,
    p_proposed_cursor: input.proposedCursor,
    p_counters: collectionCountersSchema.parse(input.counters),
    p_issues: z.array(collectionIssueSchema).max(100).parse(input.issues),
  });
  return z.object({ run_id: z.uuid(), status: z.literal("SUCCEEDED"), issues_created: z.number().int().nonnegative() }).parse(data);
}

export async function failTechnicalCollection(input: {
  runId: string;
  leaseToken: string;
  errorCode: string;
  errorMessage: string;
  counters: z.infer<typeof collectionCountersSchema>;
  issues: z.infer<typeof collectionIssueSchema>[];
}) {
  const data = await rpc("fail_technical_collection_run", {
    p_run_id: input.runId,
    p_lease_token: input.leaseToken,
    p_error_code: input.errorCode.slice(0, 100),
    p_error_message: input.errorMessage.slice(0, 500),
    p_counters: collectionCountersSchema.parse(input.counters),
    p_issues: z.array(collectionIssueSchema).max(100).parse(input.issues),
  });
  return z.object({ run_id: z.uuid(), status: z.literal("FAILED") }).parse(data);
}
