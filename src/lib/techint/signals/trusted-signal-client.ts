import "server-only";
import { createClient } from "@supabase/supabase-js";
import { recordTechnicalSignalResultSchema, recordTechnicalSignalSchema, type RecordTechnicalSignalInput } from "./schema";

export type TechnicalSignalRecordStage = "TRANSPORT" | "RPC_UNCLASSIFIED" | "RESULT_SCHEMA" | null;

export function safeRecorderSqlState(value: unknown): string | null {
  return typeof value === "string" && /^[0-9A-Z]{5}$/.test(value) ? value : null;
}

export function safeRecorderRpcCode(value: unknown): string | null {
  return typeof value === "string" && /^PGRST[0-9A-Z]{3}$/.test(value) ? value : null;
}

export class TechnicalSignalRecordError extends Error {
  constructor(
    readonly safeSqlState: string | null,
    readonly safeRpcCode: string | null,
    readonly stage: TechnicalSignalRecordStage = null,
  ) {
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

  let response: Awaited<ReturnType<typeof client.rpc>>;
  try {
    response = await client.rpc("record_technical_signal", {
      p_actor: parsed.actorId,
      p_signal: parsed.signal,
      p_observation: parsed.observation,
      p_entity_assertions: parsed.entityAssertions,
    });
  } catch {
    throw new TechnicalSignalRecordError(null, null, "TRANSPORT");
  }

  const { data, error } = response;
  if (error) {
    const safeSqlState = safeRecorderSqlState(error.code);
    const safeRpcCode = safeRecorderRpcCode(error.code);
    throw new TechnicalSignalRecordError(
      safeSqlState,
      safeRpcCode,
      safeSqlState || safeRpcCode ? null : "RPC_UNCLASSIFIED",
    );
  }

  const result = recordTechnicalSignalResultSchema.safeParse(data);
  if (!result.success) throw new TechnicalSignalRecordError(null, null, "RESULT_SCHEMA");
  return result.data;
}
