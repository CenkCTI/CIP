-- Phase 2.3E hardening — resolution-triggered profile re-evaluation must see
-- the resolution row written by the statement that fired the trigger.
--
-- The snapshot function was initially marked STABLE. A STABLE function uses a
-- statement-level snapshot and can therefore observe the pre-update
-- NEEDS_REVIEW row while running inside an AFTER UPDATE trigger. The matcher is
-- intentionally a derived evaluator that reads current transactional state, so
-- VOLATILE is the correct PostgreSQL volatility contract.

begin;

alter function public.technical_signal_profile_match_snapshot(uuid,uuid,uuid) volatile;

do $$
declare v "char";
begin
  select p.provolatile into v
  from pg_proc p
  where p.oid='public.technical_signal_profile_match_snapshot(uuid,uuid,uuid)'::regprocedure;

  if v is distinct from 'v' then
    raise exception 'TECHINT_PROFILE_MATCH_SNAPSHOT_VOLATILITY_INVALID';
  end if;
end$$;

commit;
