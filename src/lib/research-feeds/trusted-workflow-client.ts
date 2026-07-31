import "server-only";

import { createClient } from "@supabase/supabase-js";

type Parameters = Record<string, unknown>;
function trustedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Research feed server workflow is not configured.");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
async function feedRpc<T>(name:string,parameters:Parameters){const {data,error}=await trustedClient().rpc(name,parameters);return{data:data as T|null,error};}
// Only these feed-specific capabilities cross the administrative boundary; no client is exported.
export const createFeedWorkflow=(parameters:Parameters)=>feedRpc("create_research_feed",parameters);
export const editFeedWorkflow=(parameters:Parameters)=>feedRpc("edit_research_feed",parameters);
export const setFeedEnabledWorkflow=(parameters:Parameters)=>feedRpc("set_research_feed_enabled",parameters);
export const archiveFeedWorkflow=(parameters:Parameters)=>feedRpc("archive_research_feed",parameters);
export const restoreFeedWorkflow=(parameters:Parameters)=>feedRpc("restore_research_feed",parameters);
export const claimFeedWorkflow=(parameters:Parameters)=>feedRpc<Array<{run_id:string;lease_token:string;request_url_hash:string;lease_expires_at:string;configured_url:string;etag:string|null;last_modified:string|null}>>("claim_research_feed_fetch",parameters);
export const completeFeedWorkflow=(parameters:Parameters)=>feedRpc("complete_research_feed_fetch",parameters);
export const failFeedWorkflow=(parameters:Parameters)=>feedRpc("fail_research_feed_fetch",parameters);
