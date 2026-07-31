import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type IocClaim = {
  owner_id: string;
  connection_id: string;
  run_id: string;
  lease_token: string;
  provider_key: string;
  cursor_value: string | null;
  cursor_version: number | null;
};

type Parameters = Record<string, unknown>;

async function iocRpc<T>(name: string, parameters: Parameters) {
  const { data, error } = await createAdminClient().rpc(name, parameters);
  return { data: data as T | null, error };
}

export const ensureSyntheticConnection = (ownerId: string) =>
  iocRpc("ensure_synthetic_ioc_connection", { p_owner_id: ownerId });
export const setIocConnectionEnabled = (ownerId: string, connectionId: string, enabled: boolean) =>
  iocRpc("set_ioc_connection_enabled", {
    p_owner_id: ownerId,
    p_connection_id: connectionId,
    p_enabled: enabled,
  });
export const claimIocConnection = (ownerId: string, connectionId: string, trigger: "MANUAL" | "TEST") =>
  iocRpc<IocClaim[]>("claim_ioc_connection", {
    p_owner_id: ownerId,
    p_connection_id: connectionId,
    p_trigger: trigger,
  });
export const claimDueIocConnections = (limit: number) =>
  iocRpc<IocClaim[]>("claim_due_ioc_connections", { p_limit: limit });
export const completeIocIngestion = (parameters: Parameters) =>
  iocRpc("complete_ioc_ingestion", parameters);
export const failIocIngestion = (parameters: Parameters) =>
  iocRpc("fail_ioc_ingestion", parameters);
export const configureThreatFoxConnection = (parameters: Parameters) => iocRpc<string>("configure_threatfox_connection", parameters);
export const disconnectThreatFoxCredential = (ownerId:string,connectionId:string) => iocRpc<boolean>("disconnect_threatfox_credential",{p_owner_id:ownerId,p_connection_id:connectionId});
export const updateThreatFoxSettings = (ownerId:string,connectionId:string,lookback:number,scheduler:boolean,interval:number) => iocRpc<boolean>("update_threatfox_settings",{p_owner_id:ownerId,p_connection_id:connectionId,p_lookback_days:lookback,p_scheduler_enabled:scheduler,p_sync_interval_minutes:interval});
