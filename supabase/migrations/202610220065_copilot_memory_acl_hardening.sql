-- Security hardening for CİTEM Copilot memory, after migration 064.
-- Some Supabase environments grant broad table ACLs by default, even with RLS.
-- Fail closed for anonymous clients; keep only owner-restricted authenticated access.
REVOKE ALL PRIVILEGES ON TABLE
  public.copilot_memory_profiles,
  public.copilot_memory_turns
FROM anon, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE
  public.copilot_memory_profiles,
  public.copilot_memory_turns
FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.copilot_memory_profiles TO authenticated;
GRANT SELECT, INSERT, DELETE
  ON TABLE public.copilot_memory_turns TO authenticated;
