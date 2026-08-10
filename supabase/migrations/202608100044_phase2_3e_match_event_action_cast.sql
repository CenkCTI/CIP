-- Phase 2.3E hardening — CASE expressions in PL/pgSQL resolve string branches
-- as text. Re-evaluation passes one such action into the typed event writer.
-- Keep the canonical enum-typed writer and add a private text adapter that performs
-- the explicit enum cast inside the trusted database boundary.

begin;

create or replace function public.technical_profile_match_write_event(
  p_owner uuid,
  p_match uuid,
  p_profile uuid,
  p_signal uuid,
  p_actor uuid,
  p_action text,
  p_previous public.technical_profile_match_lifecycle,
  p_lifecycle public.technical_profile_match_lifecycle,
  p_details jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  perform public.technical_profile_match_write_event(
    p_owner,
    p_match,
    p_profile,
    p_signal,
    p_actor,
    p_action::public.technical_profile_match_event_action,
    p_previous,
    p_lifecycle,
    p_details
  );
end$$;

revoke all on function public.technical_profile_match_write_event(
  uuid,uuid,uuid,uuid,uuid,text,
  public.technical_profile_match_lifecycle,
  public.technical_profile_match_lifecycle,
  jsonb
) from public,anon,authenticated;

commit;
