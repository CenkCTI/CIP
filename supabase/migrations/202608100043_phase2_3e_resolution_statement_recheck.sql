-- Phase 2.3E hardening — re-evaluate affected profile matches only after a
-- resolution INSERT/UPDATE statement is complete.
--
-- Row-level AFTER triggers execute inside the statement that writes a resolution.
-- Even with a VOLATILE evaluator, batching re-evaluation per completed statement is
-- the clearer and more efficient contract. Transition tables expose every affected
-- assertion without rewriting the Phase 2.3D trusted resolution RPCs.

begin;

drop trigger if exists technical_profile_recheck_resolution on public.technical_entity_assertion_resolutions;

create or replace function public.technical_profile_recheck_resolution_statement()
returns trigger language plpgsql security definer set search_path='' as $$
declare r record;
begin
  for r in
    select distinct a.owner_id,a.signal_id
    from new_resolution_rows n
    join public.technical_signal_entity_assertions a
      on a.owner_id=n.owner_id and a.id=n.assertion_id
  loop
    begin
      perform public.evaluate_technical_signal_profile_matches(r.owner_id,r.signal_id);
    exception when others then
      -- Resolution is authoritative. Derived Profile Match projection remains
      -- best-effort and can be recomputed by collection/profile evaluation later.
      null;
    end;
  end loop;
  return null;
end$$;

revoke all on function public.technical_profile_recheck_resolution_statement() from public,anon,authenticated;

drop trigger if exists technical_profile_recheck_resolution_insert on public.technical_entity_assertion_resolutions;
create trigger technical_profile_recheck_resolution_insert
  after insert on public.technical_entity_assertion_resolutions
  referencing new table as new_resolution_rows
  for each statement execute function public.technical_profile_recheck_resolution_statement();

drop trigger if exists technical_profile_recheck_resolution_update on public.technical_entity_assertion_resolutions;
create trigger technical_profile_recheck_resolution_update
  after update on public.technical_entity_assertion_resolutions
  referencing new table as new_resolution_rows
  for each statement execute function public.technical_profile_recheck_resolution_statement();

commit;
