import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const maintenanceResultSchema = z.object({
  due: z.boolean(),
  waitSeconds: z.number().int().nonnegative(),
  seriesCreated: z.number().int().nonnegative(),
  recentEvaluated: z.number().int().nonnegative(),
  backfillEvaluated: z.number().int().nonnegative(),
  backfillComplete: z.boolean(),
  compacted: z.boolean(),
});

function trustedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("TechINT anomaly maintenance is not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function maintainTechnicalAnomalies(input: {
  ownerId: string;
  now: string;
  maxRecent?: number;
  maxBackfill?: number;
}) {
  const { data, error } = await trustedClient().rpc("maintain_technical_anomalies", {
    p_owner: z.uuid().parse(input.ownerId),
    p_now: z.iso.datetime({ offset: true }).parse(input.now),
    p_max_recent: z.number().int().min(1).max(50).parse(input.maxRecent ?? 20),
    p_max_backfill: z.number().int().min(1).max(50).parse(input.maxBackfill ?? 12),
  });
  if (error) throw new Error("TECHINT_ANALYSIS_RPC_FAILED");
  return maintenanceResultSchema.parse(data);
}
