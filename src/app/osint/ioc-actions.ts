"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getProvider } from "@/lib/ioc-connectors/registry";
import { synchronizeIocConnection } from "@/lib/ioc-connectors/orchestrator";
import { ensureSyntheticConnection, setIocConnectionEnabled } from "@/lib/ioc-connectors/trusted-workflow-client";

export type IocActionResult = { success?: string; error?: string };
const idSchema = z.string().uuid();
const safe = { error: "The IOC Inbox action could not be completed safely." };
const refresh = () => revalidatePath("/osint");

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
    const { data } = await supabase.from("ioc_provider_connections").select("id,provider_key,enabled,archived_at").eq("id", connectionId).eq("owner_id", user.id).maybeSingle();
    if (!data) return { error: "The provider connection was not found." };
    if (!data.enabled || data.archived_at) return { error: "The provider connection is disabled." };
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
