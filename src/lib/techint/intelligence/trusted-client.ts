import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  technicalIntelligenceBatchResultSchema,
  technicalProfileEvaluationResultSchema,
  technicalProfileMatchLifecycleResultSchema,
} from "./schema";

type Parameters = Record<string, unknown>;

function trustedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("TechINT intelligence workflow is not configured.");
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function rpc<T>(name: string, parameters: Parameters, schema: z.ZodType<T>): Promise<T> {
  const { data, error } = await trustedClient().rpc(name, parameters);
  if (error) throw new Error("TechINT intelligence workflow failed safely.");
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error("TechINT intelligence workflow returned an invalid result.");
  return parsed.data;
}

export const evaluateTechnicalSignalIntelligenceBatchWorkflow = (parameters: Parameters) =>
  rpc("evaluate_technical_signal_intelligence_batch", parameters, technicalIntelligenceBatchResultSchema);

export const evaluateTechnicalProfileWorkflow = (parameters: Parameters) =>
  rpc("evaluate_technical_profile", parameters, technicalProfileEvaluationResultSchema);

export const setTechnicalSignalProfileMatchLifecycleWorkflow = (parameters: Parameters) =>
  rpc("set_technical_signal_profile_match_lifecycle", parameters, technicalProfileMatchLifecycleResultSchema);

export const unsnoozeTechnicalSignalProfileMatchWorkflow = (parameters: Parameters) =>
  rpc("unsnooze_technical_signal_profile_match", parameters, technicalProfileMatchLifecycleResultSchema);
