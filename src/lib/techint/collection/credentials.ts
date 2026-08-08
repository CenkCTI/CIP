import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadCredential } from "@/lib/ioc-connectors/credentials/repository";
import type { TechnicalSourceKey } from "./types";

function envCredential(name: "MALWAREBAZAAR_AUTH_KEY") {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

async function existingThreatFoxCredential(ownerId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ioc_provider_connections")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("provider_key", "THREATFOX")
    .is("archived_at", null)
    .maybeSingle();
  if (error || !data?.id) return null;
  return loadCredential(ownerId, data.id, "THREATFOX");
}

export async function resolveTechnicalSourceCredential(sourceKey: TechnicalSourceKey, ownerId: string) {
  if (sourceKey === "THREATFOX") return existingThreatFoxCredential(ownerId);
  if (sourceKey === "MALWAREBAZAAR") return envCredential("MALWAREBAZAAR_AUTH_KEY");
  return null;
}
