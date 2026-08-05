import "server-only";
import { createClient } from "@supabase/supabase-js";
import { recordTechnicalSignalInputSchema, type RecordTechnicalSignalInput, type RecordTechnicalSignalResult } from "./schema";
function client() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!url || !key) throw new Error("technical_signal_trusted_workflow_not_configured"); return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }); }
export async function recordTechnicalSignal(input: RecordTechnicalSignalInput) { const parsed = recordTechnicalSignalInputSchema.parse(input); const { data, error } = await client().rpc("record_technical_signal", { p_owner_id: parsed.owner_id, p_signal: parsed.signal, p_observation: parsed.observation, p_entity_assertions: parsed.entity_assertions }); if (error) throw new Error("technical_signal_record_failed"); return data as RecordTechnicalSignalResult; }
