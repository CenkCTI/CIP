import "server-only";
import { createClient } from "@supabase/supabase-js";
import { recordTechnicalSignalSchema, type RecordTechnicalSignalInput } from "./schema";

export type RecordTechnicalSignalResult = { signal_id: string; observation_id: string; revision_id: string | null; signal_created: boolean; observation_created: boolean; revision_created: boolean; duplicate_observation: boolean; disposition: "CURRENT" | "SUPPORTING" | "STALE" | "CONFLICTING"; current_revision_number: number; entity_assertions_created: number };
export async function recordTechnicalSignal(input: RecordTechnicalSignalInput) {
  const parsed = recordTechnicalSignalSchema.parse(input);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Technical Signal trusted workflow is not configured.");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.rpc("record_technical_signal", { p_actor: parsed.actorId, p_signal: parsed.signal, p_observation: parsed.observation, p_entity_assertions: parsed.entityAssertions });
  if (error) throw new Error("Technical Signal could not be recorded.");
  return data as RecordTechnicalSignalResult;
}
