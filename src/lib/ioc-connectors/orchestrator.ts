import "server-only";

import { getProvider } from "./registry";
import { adapterResultSchema } from "./schema";
import { safeIocMessage, type IocErrorCode } from "./errors";
import {
  claimIocConnection,
  completeIocIngestion,
  failIocIngestion,
  type IocClaim,
} from "./trusted-workflow-client";
import { loadCredential } from "./credentials/repository";
import { createAdminClient } from "@/lib/supabase/admin";
import { ThreatFoxError } from "./providers/threatfox/errors";

export type IocSyncResult = { success: string; status: "SUCCEEDED" | "NOT_MODIFIED" } | { error: string };

function errorCode(error: unknown): IocErrorCode {
  if (error instanceof ThreatFoxError) return error.code;
  if (error instanceof Error && error.message === "IOC_CREDENTIAL_DECRYPTION_FAILED") return "IOC_CREDENTIAL_DECRYPTION_FAILED";
  const text = error instanceof Error ? error.message : String(error ?? "");
  if (text.includes("SYNC_ALREADY_RUNNING")) return "SYNC_ALREADY_RUNNING";
  if (text.includes("PROVIDER_DISABLED")) return "PROVIDER_DISABLED";
  if (text.includes("CONNECTION_UNAVAILABLE")) return "CONNECTION_UNAVAILABLE";
  return "PROVIDER_INTERNAL_FAILURE";
}

export async function executeClaimedIocSync(claim: IocClaim): Promise<IocSyncResult> {
  const adapter = getProvider(claim.provider_key);
  if (!adapter) {
    await failIocIngestion({
      p_owner_id: claim.owner_id,
      p_connection_id: claim.connection_id,
      p_run_id: claim.run_id,
      p_lease_token: claim.lease_token,
      p_error_code: "PROVIDER_NOT_CONFIGURED",
      p_error_message: safeIocMessage("PROVIDER_NOT_CONFIGURED"),
    });
    return { error: safeIocMessage("PROVIDER_NOT_CONFIGURED") };
  }

  try {
    let credential: string | undefined;
    if (adapter.credentialRequired) {
      credential = (await loadCredential(claim.owner_id, claim.connection_id, claim.provider_key)) ?? undefined;
      if (!credential) throw new ThreatFoxError("THREATFOX_CREDENTIAL_REQUIRED");
    }
    let settings: Record<string, unknown> = {};
    if (claim.provider_key === "THREATFOX") {
      const { data } = await createAdminClient().from("threatfox_connection_settings").select("lookback_days").eq("owner_id",claim.owner_id).eq("provider_connection_id",claim.connection_id).single();
      settings = { lookback_days: data?.lookback_days ?? 1 };
    }
    const result = adapterResultSchema.parse(await adapter.sync({ ownerId: claim.owner_id, connectionId: claim.connection_id, cursor: claim.cursor_value, settings, credential }));
    const { error } = await completeIocIngestion({
      p_owner_id: claim.owner_id,
      p_connection_id: claim.connection_id,
      p_run_id: claim.run_id,
      p_lease_token: claim.lease_token,
      p_status: result.status,
      p_starting_cursor_version: claim.cursor_version,
      p_next_cursor: result.status === "SUCCEEDED" ? (result.nextCursor ?? null) : null,
      p_items: result.items,
    });
    if (error) throw new Error(error.message);
    return result.status === "NOT_MODIFIED"
      ? { success: "Provider checked; no candidates were modified.", status: "NOT_MODIFIED" }
      : { success: `Provider synchronized; ${result.items.length} normalized observations processed.`, status: "SUCCEEDED" };
  } catch (error) {
    const code = errorCode(error);
    await failIocIngestion({
      p_owner_id: claim.owner_id,
      p_connection_id: claim.connection_id,
      p_run_id: claim.run_id,
      p_lease_token: claim.lease_token,
      p_error_code: code,
      p_error_message: safeIocMessage(code),
    });
    return { error: safeIocMessage(code) };
  }
}

export async function synchronizeIocConnection(ownerId: string, connectionId: string): Promise<IocSyncResult> {
  const { data, error } = await claimIocConnection(ownerId, connectionId, "MANUAL");
  if (error || !data?.[0]) {
    const code = errorCode(error?.message);
    return { error: safeIocMessage(code) };
  }
  return executeClaimedIocSync(data[0]);
}
