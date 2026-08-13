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
import { assertLegacyCollectionAllowed, collectionAuthorityEnforced, LEGACY_COLLECTION_BLOCKED_MESSAGE } from "./authority";

const boundedObject = z.record(z.string(), z.unknown());

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

const collectorAuthSchema = z.object({
  agent_id: z.uuid(),
  owner_id: z.uuid(),
  enabled: z.boolean(),
  poll_interval_seconds: z.number().int().min(30).max(3600),
});

const incrementalWorkClaimSchema = z.object({
  run_id: z.uuid(),
  owner_id: z.uuid(),
  connection_id: z.uuid(),
  source_key: sourceKeySchema,
  settings: boundedObject,
  cursor: boundedObject,
  lease_token: z.string().regex(/^[a-f0-9]{64}$/),
  lease_expires_at: z.string(),
  work_state: boundedObject,
  work_units_completed: z.number().int().nonnegative(),
});

const incrementalCheckpointSchema = z.object({
  run_id: z.uuid(),
  status: z.literal("RUNNING"),
  work_units_completed: z.number().int().positive(),
  issues_created: z.number().int().nonnegative(),
  lease_expires_at: z.string(),
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

async function ownedConnectionSourceKey(ownerId:string,connectionId:string){const {data,error}=await trustedClient().from('technical_source_connections').select('source_key').eq('owner_id',z.uuid().parse(ownerId)).eq('id',z.uuid().parse(connectionId)).maybeSingle();if(error||!data)throw new Error('TECHINT_CONNECTION_NOT_FOUND');return sourceKeySchema.parse(data.source_key);}

export async function enableTechnicalSourceWorkflow(input: {
  actorId: string;
  sourceKey: z.infer<typeof sourceKeySchema>;
  settings: Record<string, unknown>;
  intervalMinutes: number;
}) {
  if(collectionAuthorityEnforced())assertLegacyCollectionAllowed(input.sourceKey);
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
  if(input.status==='ENABLED'&&collectionAuthorityEnforced())assertLegacyCollectionAllowed(await ownedConnectionSourceKey(input.actorId,input.connectionId));
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
  if(collectionAuthorityEnforced())assertLegacyCollectionAllowed(await ownedConnectionSourceKey(input.actorId,input.connectionId));
  const data = await rpc("claim_manual_technical_collection", {
    p_actor: input.actorId,
    p_connection_id: input.connectionId,
    p_trigger: input.trigger ?? "MANUAL",
  });
  return collectionClaimSchema.parse(data);
}

export async function claimDueTechnicalCollections(limit: number) {
  if(collectionAuthorityEnforced())throw new Error(LEGACY_COLLECTION_BLOCKED_MESSAGE);
  const data = await rpc("claim_due_technical_collections", { p_limit: limit });
  return z.array(collectionClaimSchema).parse(data ?? []);
}

export async function claimDueTechnicalCollectionsForOwner(ownerId: string, limit: number) {
  if(collectionAuthorityEnforced())throw new Error(LEGACY_COLLECTION_BLOCKED_MESSAGE);
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
  if(collectionAuthorityEnforced()&&(input.enabled||input.rotateToken))throw new Error(LEGACY_COLLECTION_BLOCKED_MESSAGE);
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

export async function authenticateTechnicalCollector(token: string) {
  const parsed = z.string().regex(/^[a-f0-9]{64}$/).safeParse(token);
  if (!parsed.success) return null;
  const { data, error } = await trustedClient().rpc("authenticate_technical_collector", { p_token: parsed.data });
  if (error) {
    if (error.code === "28000" || String(error.message).includes("COLLECTOR_UNAUTHORIZED")) return null;
    throw new Error("TECHINT_COLLECTOR_RPC_FAILED");
  }
  return collectorAuthSchema.parse(data);
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

export async function getIncrementalTechnicalCollectionWorkClaim(input: {
  ownerId: string;
  runId: string;
  leaseToken: string;
}) {
  const client = trustedClient();
  const { data, error } = await client.rpc("get_incremental_technical_collection_work_claim", {
    p_owner: z.uuid().parse(input.ownerId),
    p_run_id: z.uuid().parse(input.runId),
    p_lease_token: z.string().regex(/^[a-f0-9]{64}$/).parse(input.leaseToken),
  });
  if (error) {
    const message = String(error.message);
    if (message.includes("LEASE_EXPIRED")) throw new Error("LEASE_EXPIRED");
    if (message.includes("LEASE_MISMATCH")) throw new Error("LEASE_MISMATCH");
    throw new Error("TECHINT_COLLECTION_RPC_FAILED");
  }
  const claim=incrementalWorkClaimSchema.parse(data);if(collectionAuthorityEnforced())assertLegacyCollectionAllowed(claim.source_key);return claim;
}

export async function checkpointIncrementalTechnicalCollection(input: {
  runId: string;
  leaseToken: string;
  workState: Record<string, unknown>;
  counters: z.infer<typeof collectionCountersSchema>;
  issues: z.infer<typeof collectionIssueSchema>[];
}) {
  const data = await rpc("checkpoint_incremental_technical_collection_run", {
    p_run_id: z.uuid().parse(input.runId),
    p_lease_token: z.string().regex(/^[a-f0-9]{64}$/).parse(input.leaseToken),
    p_work_state: boundedObject.parse(input.workState),
    p_counters: collectionCountersSchema.parse(input.counters),
    p_issues: z.array(collectionIssueSchema).max(100).parse(input.issues),
  });
  return incrementalCheckpointSchema.parse(data);
}

export async function completeIncrementalTechnicalCollection(input: {
  runId: string;
  leaseToken: string;
  proposedCursor: Record<string, unknown>;
}) {
  const data = await rpc("complete_incremental_technical_collection_run", {
    p_run_id: z.uuid().parse(input.runId),
    p_lease_token: z.string().regex(/^[a-f0-9]{64}$/).parse(input.leaseToken),
    p_proposed_cursor: boundedObject.parse(input.proposedCursor),
  });
  return z.object({ run_id: z.uuid(), status: z.literal("SUCCEEDED"), work_units_completed: z.number().int().nonnegative() }).parse(data);
}

export async function failIncrementalTechnicalCollection(input: {
  runId: string;
  leaseToken: string;
  errorCode: string;
  errorMessage: string;
}) {
  const data = await rpc("fail_incremental_technical_collection_run", {
    p_run_id: z.uuid().parse(input.runId),
    p_lease_token: z.string().regex(/^[a-f0-9]{64}$/).parse(input.leaseToken),
    p_error_code: z.string().min(1).max(100).parse(input.errorCode.slice(0, 100)),
    p_error_message: z.string().min(1).max(500).parse(input.errorMessage.slice(0, 500)),
  });
  return z.object({ run_id: z.uuid(), status: z.literal("FAILED") }).parse(data);
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
