import { createClient } from '@supabase/supabase-js';
const dryRun = !process.argv.includes('--no-dry-run');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing Supabase URL or service-role key');
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await supabase.rpc('cleanup_expired_guest_ai_sessions', { p_dry_run: dryRun });
if (error) throw error;
console.log(JSON.stringify({ dryRun, summary: data?.[0] ?? null }));
