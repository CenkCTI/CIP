import "server-only";

import { createClient } from "@supabase/supabase-js";

type Parameters = Record<string, unknown>;

function trustedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("TechINT trusted workflow is not configured.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function techIntRpc<T>(name: string, parameters: Parameters) {
  const { data, error } = await trustedClient().rpc(name, parameters);
  return { data: data as T | null, error };
}

function parameterUuid(parameters: Parameters, key: string) {
  const value = parameters[key];
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

async function projectProfileBestEffort(parameters: Parameters, profileId: string | null | undefined) {
  const actorId = parameterUuid(parameters, "p_actor");
  if (!actorId || !profileId) return;
  try {
    await techIntRpc("evaluate_technical_profile", { p_actor: actorId, p_profile_id: profileId });
  } catch {
    // Profile mutation remains authoritative; Phase 2.3E is a derived projection and can be retried.
  }
}

export async function createStandaloneProfileWorkflow(parameters: Parameters) {
  const result = await techIntRpc<string>("create_standalone_intel_profile", parameters);
  if (!result.error) await projectProfileBestEffort(parameters, result.data);
  return result;
}

export async function createInvestigationProfileWorkflow(parameters: Parameters) {
  const result = await techIntRpc<{ profile_id: string; refresh: TechIntRefreshCounts }>(
    "create_investigation_intel_profile",
    parameters,
  );
  if (!result.error) await projectProfileBestEffort(parameters, result.data?.profile_id);
  return result;
}

export async function updateProfileDefinitionWorkflow(parameters: Parameters) {
  const result = await techIntRpc<string | null>("update_intel_profile_definition", parameters);
  if (!result.error) await projectProfileBestEffort(parameters, parameterUuid(parameters, "p_profile_id"));
  return result;
}

export async function setProfileStatusWorkflow(parameters: Parameters) {
  const result = await techIntRpc<string | null>("set_intel_profile_status", parameters);
  if (!result.error) await projectProfileBestEffort(parameters, parameterUuid(parameters, "p_profile_id"));
  return result;
}

export async function addExplicitItemWorkflow(parameters: Parameters) {
  const result = await techIntRpc<string>("add_explicit_intel_profile_item", parameters);
  if (!result.error) await projectProfileBestEffort(parameters, parameterUuid(parameters, "p_profile_id"));
  return result;
}

export async function transitionItemWorkflow(parameters: Parameters) {
  const result = await techIntRpc<string | null>("transition_intel_profile_item", parameters);
  if (!result.error) await projectProfileBestEffort(parameters, parameterUuid(parameters, "p_profile_id"));
  return result;
}

export async function refreshInvestigationProfileWorkflow(parameters: Parameters) {
  const result = await techIntRpc<TechIntRefreshCounts>("refresh_investigation_intel_profile", parameters);
  if (!result.error) await projectProfileBestEffort(parameters, parameterUuid(parameters, "p_profile_id"));
  return result;
}

export type TechIntRefreshCounts = {
  added: number;
  already_present: number;
  preserved_exclusions: number;
  preserved_removals: number;
  pending_suggestions: number;
  skipped: number;
};
