import "server-only";
import { createClient } from "@supabase/supabase-js";
import { recordTechnicalSignalResultSchema, recordTechnicalSignalSchema, type RecordTechnicalSignalInput } from "./schema";

const SAFE_RECORDER_SQLSTATES = new Set([
  "22007",
  "22008",
  "22023",
  "22P02",
  "23503",
  "23505",
  "23514",
  "55000",
  "P0001",
  "P0002",
]);

function safeRecorderSqlState(value: unknown): string | null {
  return typeof value === "string" && SAFE_RECORDER_SQLSTATES.has(value) ? value : null;
}

export class TechnicalSignalRecordError extends Error {
  constructor(readonly safeSqlState: string | null) {
    super("Technical Signal could not be recorded.");
    this.name = "TechnicalSignalRecordError";
  }
}

export async function recordTechnicalSignal(input: RecordTechnicalSignalInput) {
  const parsed = recordTechnicalSignalSchema.parse(input);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Technical Signal trusted workflow is not configured.");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.rpc("record_technical_signal", { p_actor: parsed.actorId, p_signal: parsed.signal, p_observation: parsed.observation, p_entity_assertions: parsed.entityAssertions });
  if (error) throw new TechnicalSignalRecordError(safeRecorderSqlState(error.code));
  const result = recordTechnicalSignalResultSchema.safeParse(data);
  if (!result.success) throw new Error("Technical Signal returned an invalid result.");
  return result.data;
}
