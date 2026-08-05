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

export const createStandaloneProfileWorkflow = (parameters: Parameters) =>
  techIntRpc<string>("create_standalone_intel_profile", parameters);
export const createInvestigationProfileWorkflow = (parameters: Parameters) =>
  techIntRpc<{ profile_id: string; refresh: TechIntRefreshCounts }>(
    "create_investigation_intel_profile",
    parameters,
  );
export const updateProfileDefinitionWorkflow = (parameters: Parameters) =>
  techIntRpc<string | null>("update_intel_profile_definition", parameters);
export const setProfileStatusWorkflow = (parameters: Parameters) =>
  techIntRpc<string | null>("set_intel_profile_status", parameters);
export const addExplicitItemWorkflow = (parameters: Parameters) =>
  techIntRpc<string>("add_explicit_intel_profile_item", parameters);
export const transitionItemWorkflow = (parameters: Parameters) =>
  techIntRpc<string | null>("transition_intel_profile_item", parameters);
export const refreshInvestigationProfileWorkflow = (parameters: Parameters) =>
  techIntRpc<TechIntRefreshCounts>("refresh_investigation_intel_profile", parameters);

export type TechIntRefreshCounts = {
  added: number;
  already_present: number;
  preserved_exclusions: number;
  preserved_removals: number;
  pending_suggestions: number;
  skipped: number;
};
