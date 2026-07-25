import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";
export function createAdminClient() { const { url } = getSupabaseEnv(); const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!key) throw new Error("service_role_not_configured"); return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }); }
