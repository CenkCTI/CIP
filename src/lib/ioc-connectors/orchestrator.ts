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
  if (error instanceof Error && error.message === "ADAPTER_RESULT_CONTRACT_INVALID") return "ADAPTER_RESULT_CONTRACT_INVALID";
  if (error instanceof Error && error.message === "IOC_COMPLETION_FAILED") return "IOC_COMPLETION_FAILED";
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
    const parsedResult = adapterResultSchema.safeParse(await adapter.sync({ ownerId: claim.owner_id, connectionId: claim.connection_id, cursor: claim.cursor_value, settings, credential }));
    if (!parsedResult.success) throw new Error("ADAPTER_RESULT_CONTRACT_INVALID");
    const result = parsedResult.data;
    const { error } = await completeIocIngestion({
      p_owner_id: claim.owner_id,
      p_connection_id: claim.connection_id,
      p_run_id: claim.run_id,
      p_lease_token: claim.lease_token,
      p_status: result.status,
      p_starting_cursor_version: claim.cursor_version,
      p_next_cursor: result.nextCursor ?? null,
      p_items: result.items,
    });
    if (error) throw new Error("IOC_COMPLETION_FAILED");
    return result.status === "NOT_MODIFIED"
      ? { success: `Provider checked; no new observations were available; ${result.diagnostics.already_seen_count} provider records were already seen.`, status: "NOT_MODIFIED" }
      : { success: `Provider synchronized; ${result.diagnostics.mapped_count} new observations processed; ${result.diagnostics.mapping_skipped_count} provider records skipped safely${result.diagnostics.already_seen_count ? `; ${result.diagnostics.already_seen_count} already seen` : ""}.`, status: "SUCCEEDED" };
  } catch (error) {
    const code = errorCode(error);
    const safeMessage = error instanceof ThreatFoxError && error.diagnostics?.received_count !== undefined
      ? `${safeIocMessage(code)} Received ${error.diagnostics.received_count} provider records${code === "THREATFOX_ITEM_LIMIT" ? "; choose a smaller lookback window." : "."}`
      : safeIocMessage(code);
    await failIocIngestion({
      p_owner_id: claim.owner_id,
      p_connection_id: claim.connection_id,
      p_run_id: claim.run_id,
      p_lease_token: claim.lease_token,
      p_error_code: code,
      p_error_message: safeMessage,
    });
    return { error: safeMessage };
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
