-- CITEM Phase 2.1B enrichment history hardening.
-- Additive only: preserves existing rows while making enrichment history append-only.

drop policy if exists "enrichment results update owned investigation"
  on public.enrichment_results;
drop policy if exists "enrichment results delete owned investigation"
  on public.enrichment_results;
drop policy if exists "enrichment runs delete owned investigation"
  on public.enrichment_runs;

create or replace function public.enforce_enrichment_run_history()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'enrichment_run_history_is_immutable';
  end if;

  if old.status in ('SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED') then
    raise exception using errcode = '23514', message = 'terminal_enrichment_run_is_immutable';
  end if;

  if old.project_id is distinct from new.project_id
     or old.indicator_id is distinct from new.indicator_id
     or old.provider_id is distinct from new.provider_id
     or old.provider_label_snapshot is distinct from new.provider_label_snapshot
     or old.indicator_type_snapshot is distinct from new.indicator_type_snapshot
     or old.indicator_value_snapshot is distinct from new.indicator_value_snapshot
     or old.is_synthetic is distinct from new.is_synthetic
     or old.requested_by is distinct from new.requested_by
     or old.requested_at is distinct from new.requested_at
     or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'enrichment_run_identity_is_immutable';
  end if;

  if not (
    (old.status = 'PENDING' and new.status in ('RUNNING', 'FAILED', 'CANCELLED'))
    or (old.status = 'RUNNING' and new.status in ('SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'))
  ) then
    raise exception using errcode = '23514', message = 'invalid_enrichment_run_transition';
  end if;

  if new.status = 'RUNNING' and (new.started_at is null or new.completed_at is not null) then
    raise exception using errcode = '23514', message = 'invalid_running_enrichment_timestamps';
  end if;
  if new.status in ('SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED')
     and new.completed_at is null then
    raise exception using errcode = '23514', message = 'terminal_enrichment_run_requires_completed_at';
  end if;
  return new;
end;
$$;

drop trigger if exists enrichment_runs_enforce_history on public.enrichment_runs;
create trigger enrichment_runs_enforce_history
  before update or delete on public.enrichment_runs
  for each row execute function public.enforce_enrichment_run_history();

create or replace function public.enforce_enrichment_result_history()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  matching_run boolean;
begin
  if tg_op <> 'INSERT' then
    raise exception using errcode = '42501', message = 'enrichment_results_are_append_only';
  end if;

  select true into matching_run
  from public.enrichment_runs run
  where run.id = new.run_id
    and run.project_id = new.project_id
    and run.indicator_id = new.indicator_id
    and run.status = 'RUNNING';

  if matching_run is not true then
    raise exception using errcode = '23514', message = 'enrichment_result_requires_matching_running_run';
  end if;
  return new;
end;
$$;

drop trigger if exists enrichment_results_enforce_history on public.enrichment_results;
create trigger enrichment_results_enforce_history
  before insert or update or delete on public.enrichment_results
  for each row execute function public.enforce_enrichment_result_history();

-- SELECT and the minimum authenticated execution writes from migration 017 remain:
-- run INSERT/UPDATE and result INSERT. Same-owner API clients consequently retain
-- those writes; complete tamper resistance requires a stronger trusted-server boundary.
