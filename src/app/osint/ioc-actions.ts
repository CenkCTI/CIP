"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getProvider } from "@/lib/ioc-connectors/registry";
import { synchronizeIocConnection } from "@/lib/ioc-connectors/orchestrator";
import { ensureSyntheticConnection, setIocConnectionEnabled } from "@/lib/ioc-connectors/trusted-workflow-client";
import { configureThreatFoxConnection, disconnectThreatFoxCredential, updateThreatFoxSettings } from "@/lib/ioc-connectors/trusted-workflow-client";
import { authKeySchema } from "@/lib/ioc-connectors/credentials/schema";
import { encryptCredential } from "@/lib/ioc-connectors/credentials/crypto";
import { randomUUID } from "node:crypto";
import { configureOtxConnection,disconnectOtxCredential,updateOtxSettings } from "@/lib/ioc-connectors/trusted-workflow-client";

export type IocActionResult = { success?: string; error?: string };
const idSchema = z.string().uuid();
const safe = { error: "The IOC Inbox action could not be completed safely." };
const refresh = () => revalidatePath("/osint");
const threatFoxSettings = z.object({ lookback: z.coerce.number().int().min(1).max(7), interval: z.coerce.number().int().min(30).max(1440), scheduler: z.boolean() });
const otxLookback=z.coerce.number().int().refine(v=>[30,90,180,365].includes(v));

export async function connectOtx(form:FormData):Promise<IocActionResult>{try{const{user,supabase}=await requireUser();const credential=authKeySchema.safeParse(form.get("api_key")),lookback=otxLookback.safeParse(form.get("bootstrap_lookback_days"));if(!credential.success||!lookback.success)return{error:"Enter a valid OTX API key and bootstrap look-back."};const adapter=getProvider("ALIENVAULT_OTX");if(!adapter?.testConnection)return safe;await adapter.testConnection(credential.data);const{data:existing}=await supabase.from("ioc_provider_connections").select("id").eq("owner_id",user.id).eq("provider_key","ALIENVAULT_OTX").maybeSingle();const connectionId=existing?.id??randomUUID(),encrypted=encryptCredential(credential.data,{ownerId:user.id,connectionId,providerKey:"ALIENVAULT_OTX",keyVersion:1});const{error}=await configureOtxConnection({p_owner_id:user.id,p_connection_id:connectionId,p_ciphertext_b64:encrypted.ciphertext_b64,p_iv_b64:encrypted.iv_b64,p_auth_tag_b64:encrypted.auth_tag_b64,p_key_version:1,p_bootstrap_lookback_days:lookback.data});if(error)return safe;refresh();return{success:"AlienVault OTX credential tested and configured."}}catch{return{error:"AlienVault OTX connection test failed; the credential was not saved."}}}
export async function disconnectOtx(connectionId:string):Promise<IocActionResult>{try{const{user}=await requireUser();if(!idSchema.safeParse(connectionId).success)return safe;const{error}=await disconnectOtxCredential(user.id,connectionId);if(error)return safe;refresh();return{success:"AlienVault OTX credential disconnected; history and Pulse provenance were preserved."}}catch{return safe}}
export async function saveOtxSettings(connectionId:string,form:FormData):Promise<IocActionResult>{try{const{user}=await requireUser(),lookback=otxLookback.safeParse(form.get("bootstrap_lookback_days"));if(!idSchema.safeParse(connectionId).success||!lookback.success)return safe;const{error}=await updateOtxSettings(user.id,connectionId,lookback.data);if(error)return safe;refresh();return{success:"AlienVault OTX bootstrap look-back updated."}}catch{return safe}}

export async function connectThreatFox(form:FormData):Promise<IocActionResult>{try{const{user,supabase}=await requireUser();const credential=authKeySchema.safeParse(form.get("auth_key"));const settings=threatFoxSettings.safeParse({lookback:form.get("lookback_days"),interval:form.get("sync_interval_minutes"),scheduler:form.get("scheduler_enabled")==="on"});if(!credential.success||!settings.success)return{error:"Enter a valid Auth-Key and bounded ThreatFox settings."};const adapter=getProvider("THREATFOX");if(!adapter?.testConnection)return safe;await adapter.testConnection(credential.data);const{data:existing}=await supabase.from("ioc_provider_connections").select("id").eq("owner_id",user.id).eq("provider_key","THREATFOX").maybeSingle();const connectionId=existing?.id??randomUUID(),encrypted=encryptCredential(credential.data,{ownerId:user.id,connectionId,providerKey:"THREATFOX",keyVersion:1});const{error}=await configureThreatFoxConnection({p_owner_id:user.id,p_connection_id:connectionId,p_ciphertext_b64:encrypted.ciphertext_b64,p_iv_b64:encrypted.iv_b64,p_auth_tag_b64:encrypted.auth_tag_b64,p_key_version:encrypted.key_version,p_lookback_days:settings.data.lookback,p_scheduler_enabled:settings.data.scheduler,p_sync_interval_minutes:settings.data.interval});if(error)return safe;refresh();return{success:"ThreatFox credential tested and configured."};}catch{return{error:"ThreatFox connection test failed; the credential was not saved."};}}
export async function disconnectThreatFox(connectionId:string):Promise<IocActionResult>{try{const{user}=await requireUser();if(!idSchema.safeParse(connectionId).success)return safe;const{error}=await disconnectThreatFoxCredential(user.id,connectionId);if(error)return safe;refresh();return{success:"ThreatFox credential disconnected; history and provenance were preserved."};}catch{return safe;}}
export async function saveThreatFoxSettings(connectionId:string,form:FormData):Promise<IocActionResult>{try{const{user}=await requireUser();const parsed=threatFoxSettings.safeParse({lookback:form.get("lookback_days"),interval:form.get("sync_interval_minutes"),scheduler:form.get("scheduler_enabled")==="on"});if(!idSchema.safeParse(connectionId).success||!parsed.success)return safe;const{error}=await updateThreatFoxSettings(user.id,connectionId,parsed.data.lookback,parsed.data.scheduler,parsed.data.interval);if(error)return safe;refresh();return{success:"ThreatFox settings updated."};}catch{return safe;}}

export async function ensureSyntheticIocConnection(): Promise<IocActionResult> {
  try {
    const { user } = await requireUser();
    const adapter = getProvider("TEST_SYNTHETIC");
    if (!adapter) return { error: "The synthetic provider is not enabled." };
    const { error } = await ensureSyntheticConnection(user.id);
    if (error) return safe;
    refresh();
    return { success: "TEST / SYNTHETIC provider enabled. It is local deterministic test data, not live intelligence." };
  } catch { return safe; }
}

export async function syncIocProviderConnection(connectionId: string): Promise<IocActionResult> {
  try {
    const { user, supabase } = await requireUser();
    if (!idSchema.safeParse(connectionId).success) return safe;
    const { data } = await supabase.from("ioc_provider_connections").select("id,provider_key,enabled,archived_at,last_checked_at").eq("id", connectionId).eq("owner_id", user.id).maybeSingle();
    if (!data) return { error: "The provider connection was not found." };
    if (!data.enabled || data.archived_at) return { error: "The provider connection is disabled." };
    if (["THREATFOX","ALIENVAULT_OTX"].includes(data.provider_key)) { const { data: recent } = await supabase.from("ioc_ingestion_runs").select("started_at").eq("owner_id",user.id).eq("provider_connection_id",connectionId).eq("trigger_type","MANUAL").order("started_at",{ascending:false}).limit(1).maybeSingle(); if(recent&&Date.now()-new Date(recent.started_at).valueOf()<300_000)return { error: "SYNC_COOLDOWN: wait five minutes before another manual provider sync." }; }
    if (!getProvider(data.provider_key)) return { error: "The provider is not configured on this server." };
    const result = await synchronizeIocConnection(user.id, connectionId);
    refresh();
    return result;
  } catch { return safe; }
}

export async function changeIocConnectionState(connectionId: string, enabled: boolean): Promise<IocActionResult> {
  try {
    const { user } = await requireUser();
    if (!idSchema.safeParse(connectionId).success || typeof enabled !== "boolean") return safe;
    const { error } = await setIocConnectionEnabled(user.id, connectionId, enabled);
    if (error) return safe;
    refresh();
    return { success: enabled ? "Test provider enabled." : "Test provider paused." };
  } catch { return safe; }
}

export async function triageIocCandidate(candidateId: string, action: string): Promise<IocActionResult> {
  try {
    const { supabase } = await requireUser();
    const parsed = z.enum(["REVIEW", "DISMISS", "RESTORE"]).safeParse(action);
    if (!idSchema.safeParse(candidateId).success || !parsed.success) return safe;
    const { error } = await supabase.rpc("triage_ioc_candidate", { p_candidate_id: candidateId, p_action: parsed.data });
    if (error) return { error: "That candidate transition is not available." };
    refresh();
    return { success: "Candidate triage updated." };
  } catch { return safe; }
}

export async function acceptIocCandidate(candidateId: string, form: FormData): Promise<IocActionResult> {
  try {
    const { supabase } = await requireUser();
    const parsed = z.object({ candidate: idSchema, project: idSchema, note: z.string().max(5000), severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).nullable() }).safeParse({
      candidate: candidateId, project: form.get("project_id"), note: String(form.get("note") ?? ""), severity: form.get("severity") || null,
    });
    if (!parsed.success) return { error: "Choose an owned Investigation and complete the required fields." };
    const { error } = await supabase.rpc("accept_ioc_candidate", { p_candidate_id: parsed.data.candidate, p_project_id: parsed.data.project, p_note: parsed.data.note, p_cve_severity: parsed.data.severity });
    if (error) return { error: "The candidate could not be accepted." };
    refresh();
    revalidatePath(`/projects/${parsed.data.project}`);
    return { success: "Candidate accepted into the Investigation." };
  } catch { return safe; }
}
