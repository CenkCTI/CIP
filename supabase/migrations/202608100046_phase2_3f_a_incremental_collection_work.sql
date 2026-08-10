begin;

alter table public.technical_collection_runs
  add column collector_work_state jsonb not null default '{}'::jsonb,
  add column work_units_completed integer not null default 0 check (work_units_completed >= 0),
  add column last_work_at timestamptz;

alter table public.technical_collection_runs
  add constraint technical_collection_runs_work_state_check
  check (jsonb_typeof(collector_work_state) = 'object' and pg_column_size(collector_work_state) <= 32768);

grant select (work_units_completed,last_work_at)
  on public.technical_collection_runs to authenticated;

create or replace function public.claim_due_technical_collections_for_owner(
  p_owner uuid,
  p_limit integer default 1
) returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.technical_source_connections;
  run_id uuid;
  token text;
  token_hash text;
  expires_at timestamptz;
begin
  if p_owner is null or not exists(select 1 from auth.users where id = p_owner) then
    raise exception 'INVALID_ACTOR' using errcode = '22023';
  end if;
  if p_limit not between 1 and 10 then
    raise exception 'INVALID_BATCH_SIZE' using errcode = '22023';
  end if;

  perform public.recover_expired_technical_collection_runs();

  for c in
    select *
    from public.technical_source_connections
    where owner_id = p_owner
      and status = 'ENABLED'
      and source_key <> 'TEST_SYNTHETIC'
      and next_run_at is not null
      and next_run_at <= now()
      and not exists(
        select 1 from public.technical_collection_runs r
        where r.connection_id = technical_source_connections.id
          and r.status = 'RUNNING'
      )
    order by next_run_at, id
    for update skip locked
    limit p_limit
  loop
    token := encode(extensions.gen_random_bytes(32), 'hex');
    token_hash := encode(extensions.digest(convert_to(token, 'UTF8'), 'sha256'), 'hex');
    expires_at := now() + interval '10 minutes';

    insert into public.technical_collection_runs(
      owner_id, connection_id, source_key, trigger,
      claimed_cursor, lease_token_hash, lease_expires_at,
      collector_work_state
    ) values (
      c.owner_id, c.id, c.source_key, 'SCHEDULED',
      c.cursor, token_hash, expires_at,
      '{}'::jsonb
    ) returning id into run_id;

    update public.technical_source_connections
    set last_started_at = now()
    where id = c.id;

    return next jsonb_build_object(
      'run_id', run_id,
      'owner_id', c.owner_id,
      'connection_id', c.id,
      'source_key', c.source_key,
      'settings', c.settings,
      'cursor', c.cursor,
      'lease_token', token,
      'lease_expires_at', expires_at
    );
  end loop;
end $$;

create function public.authenticate_technical_collector(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.technical_collector_agents;
  supplied_hash text;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    raise exception 'COLLECTOR_UNAUTHORIZED' using errcode = '28000';
  end if;
  supplied_hash := encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');
  select * into a
  from public.technical_collector_agents
  where token_hash = supplied_hash
  for update;
  if not found then
    raise exception 'COLLECTOR_UNAUTHORIZED' using errcode = '28000';
  end if;
  update public.technical_collector_agents
  set last_heartbeat_at = now()
  where id = a.id;
  return jsonb_build_object(
    'agent_id', a.id,
    'owner_id', a.owner_id,
    'enabled', a.enabled,
    'poll_interval_seconds', a.poll_interval_seconds
  );
end $$;

create function public.get_incremental_technical_collection_work_claim(
  p_owner uuid,
  p_run_id uuid,
  p_lease_token text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.technical_collection_runs;
  c public.technical_source_connections;
begin
  select * into r
  from public.technical_collection_runs
  where id = p_run_id and owner_id = p_owner
  for update;
  if not found or r.status <> 'RUNNING' then
    raise exception 'LEASE_MISMATCH' using errcode = '55000';
  end if;
  if r.lease_token_hash <> encode(extensions.digest(convert_to(coalesce(p_lease_token,''), 'UTF8'), 'sha256'), 'hex') then
    raise exception 'LEASE_MISMATCH' using errcode = '55000';
  end if;
  if r.lease_expires_at <= now() then
    raise exception 'LEASE_EXPIRED' using errcode = '55000';
  end if;
  select * into c
  from public.technical_source_connections
  where id = r.connection_id and owner_id = r.owner_id;
  if not found then raise exception 'SOURCE_NOT_AVAILABLE' using errcode = 'P0002'; end if;

  update public.technical_collection_runs
  set lease_expires_at = now() + interval '10 minutes',
      last_work_at = now()
  where id = r.id;

  return jsonb_build_object(
    'run_id', r.id,
    'owner_id', r.owner_id,
    'connection_id', r.connection_id,
    'source_key', r.source_key,
    'settings', c.settings,
    'cursor', r.claimed_cursor,
    'lease_token', p_lease_token,
    'lease_expires_at', now() + interval '10 minutes',
    'work_state', r.collector_work_state,
    'work_units_completed', r.work_units_completed
  );
end $$;

create function public.checkpoint_incremental_technical_collection_run(
  p_run_id uuid,
  p_lease_token text,
  p_work_state jsonb,
  p_counters jsonb,
  p_issues jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.technical_collection_runs;
  i jsonb;
  issue_count integer := 0;
  add_seen integer;
  add_mapped integer;
  add_signals integer;
  add_observations integer;
  add_revisions integer;
  add_duplicates integer;
  add_supporting integer;
  add_stale integer;
  add_conflicting integer;
  add_skipped integer;
  add_failed integer;
begin
  select * into r from public.technical_collection_runs where id = p_run_id for update;
  if not found or r.status <> 'RUNNING'
     or r.lease_token_hash <> encode(extensions.digest(convert_to(coalesce(p_lease_token,''), 'UTF8'), 'sha256'), 'hex') then
    raise exception 'LEASE_MISMATCH' using errcode = '55000';
  end if;
  if r.lease_expires_at <= now() then raise exception 'LEASE_EXPIRED' using errcode = '55000'; end if;
  if p_work_state is null or jsonb_typeof(p_work_state) <> 'object' or pg_column_size(p_work_state) > 32768
     or p_counters is null or jsonb_typeof(p_counters) <> 'object'
     or p_issues is null or jsonb_typeof(p_issues) <> 'array' or jsonb_array_length(p_issues) > 100 then
    raise exception 'INVALID_COLLECTION_RESULT' using errcode = '22023';
  end if;

  add_seen := coalesce((p_counters->>'recordsSeen')::integer,0);
  add_mapped := coalesce((p_counters->>'recordsMapped')::integer,0);
  add_signals := coalesce((p_counters->>'signalsCreated')::integer,0);
  add_observations := coalesce((p_counters->>'observationsCreated')::integer,0);
  add_revisions := coalesce((p_counters->>'revisionsCreated')::integer,0);
  add_duplicates := coalesce((p_counters->>'duplicateObservations')::integer,0);
  add_supporting := coalesce((p_counters->>'supportingObservations')::integer,0);
  add_stale := coalesce((p_counters->>'staleObservations')::integer,0);
  add_conflicting := coalesce((p_counters->>'conflictingObservations')::integer,0);
  add_skipped := coalesce((p_counters->>'skippedRecords')::integer,0);
  add_failed := coalesce((p_counters->>'failedRecords')::integer,0);

  if least(add_seen,add_mapped,add_signals,add_observations,add_revisions,add_duplicates,add_supporting,add_stale,add_conflicting,add_skipped,add_failed) < 0 then
    raise exception 'INVALID_COLLECTION_RESULT' using errcode = '22023';
  end if;

  for i in select value from jsonb_array_elements(p_issues) loop
    issue_count := issue_count + 1;
    insert into public.technical_collection_run_issues(owner_id, run_id, source_key, issue_kind, issue_code, source_record_key, safe_message)
    values (r.owner_id, r.id, r.source_key, (i->>'kind')::public.technical_collection_issue_kind,
      left(i->>'code',100), nullif(left(coalesce(i->>'sourceRecordKey',''),300),''), left(coalesce(i->>'message','Collection record skipped.'),500));
  end loop;

  update public.technical_collection_runs
  set collector_work_state = p_work_state,
      work_units_completed = work_units_completed + 1,
      last_work_at = now(),
      lease_expires_at = now() + interval '10 minutes',
      records_seen = records_seen + add_seen,
      records_mapped = records_mapped + add_mapped,
      signals_created = signals_created + add_signals,
      observations_created = observations_created + add_observations,
      revisions_created = revisions_created + add_revisions,
      duplicate_observations = duplicate_observations + add_duplicates,
      supporting_observations = supporting_observations + add_supporting,
      stale_observations = stale_observations + add_stale,
      conflicting_observations = conflicting_observations + add_conflicting,
      skipped_records = skipped_records + add_skipped,
      failed_records = failed_records + add_failed
  where id = r.id;

  return jsonb_build_object(
    'run_id', r.id,
    'status', 'RUNNING',
    'work_units_completed', r.work_units_completed + 1,
    'issues_created', issue_count,
    'lease_expires_at', now() + interval '10 minutes'
  );
exception when invalid_text_representation or check_violation then
  raise exception 'INVALID_COLLECTION_RESULT' using errcode = '22023';
end $$;

create function public.complete_incremental_technical_collection_run(
  p_run_id uuid,
  p_lease_token text,
  p_proposed_cursor jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.technical_collection_runs;
  c public.technical_source_connections;
begin
  select * into r from public.technical_collection_runs where id = p_run_id for update;
  if not found or r.status <> 'RUNNING'
     or r.lease_token_hash <> encode(extensions.digest(convert_to(coalesce(p_lease_token,''), 'UTF8'), 'sha256'), 'hex') then
    raise exception 'LEASE_MISMATCH' using errcode = '55000';
  end if;
  if r.lease_expires_at <= now() then raise exception 'LEASE_EXPIRED' using errcode = '55000'; end if;
  select * into c from public.technical_source_connections where id = r.connection_id and owner_id = r.owner_id for update;
  if not found then raise exception 'SOURCE_NOT_AVAILABLE' using errcode = 'P0002'; end if;
  if c.cursor <> r.claimed_cursor then raise exception 'STALE_COLLECTION_COMPLETION' using errcode = '55000'; end if;
  perform public.technical_source_validate_cursor(r.source_key, p_proposed_cursor);

  update public.technical_collection_runs
  set status = 'SUCCEEDED', completed_at = now(), proposed_cursor = p_proposed_cursor,
      lease_expires_at = now(), last_work_at = now()
  where id = r.id;

  update public.technical_source_connections
  set cursor = p_proposed_cursor,
      cursor_version = (p_proposed_cursor->>'version')::integer,
      last_succeeded_at = now(),
      consecutive_failures = 0,
      next_run_at = case when status = 'ENABLED' and source_key <> 'TEST_SYNTHETIC'
        then now() + make_interval(mins => interval_minutes) else null end
  where id = c.id;

  return jsonb_build_object('run_id', r.id, 'status', 'SUCCEEDED', 'work_units_completed', r.work_units_completed);
end $$;

create function public.fail_incremental_technical_collection_run(
  p_run_id uuid,
  p_lease_token text,
  p_error_code text,
  p_error_message text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.technical_collection_runs;
  c public.technical_source_connections;
  next_failures integer;
begin
  select * into r from public.technical_collection_runs where id = p_run_id for update;
  if not found or r.status <> 'RUNNING'
     or r.lease_token_hash <> encode(extensions.digest(convert_to(coalesce(p_lease_token,''), 'UTF8'), 'sha256'), 'hex') then
    raise exception 'LEASE_MISMATCH' using errcode = '55000';
  end if;
  update public.technical_collection_runs
  set status = 'FAILED', completed_at = now(), lease_expires_at = now(), last_work_at = now(),
      failed_records = greatest(1,failed_records),
      controlled_error_code = left(coalesce(nullif(p_error_code,''),'COLLECTION_FAILED'),100),
      controlled_error_message = left(coalesce(p_error_message,'Collection failed safely.'),500)
  where id = r.id;

  select * into c from public.technical_source_connections where id = r.connection_id and owner_id = r.owner_id for update;
  if found then
    next_failures := c.consecutive_failures + 1;
    update public.technical_source_connections
    set last_failed_at = now(), consecutive_failures = next_failures,
        next_run_at = case when status = 'ENABLED' and source_key <> 'TEST_SYNTHETIC'
          then now() + make_interval(mins => least(1440, greatest(5, (power(2,least(next_failures,6))::integer) * 5))) else null end
    where id = c.id;
  end if;

  return jsonb_build_object('run_id', r.id, 'status', 'FAILED');
end $$;

revoke all on function public.authenticate_technical_collector(text) from public, anon, authenticated;
revoke all on function public.get_incremental_technical_collection_work_claim(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.checkpoint_incremental_technical_collection_run(uuid,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.complete_incremental_technical_collection_run(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.fail_incremental_technical_collection_run(uuid,text,text,text) from public, anon, authenticated;

grant execute on function public.authenticate_technical_collector(text) to service_role;
grant execute on function public.get_incremental_technical_collection_work_claim(uuid,uuid,text) to service_role;
grant execute on function public.checkpoint_incremental_technical_collection_run(uuid,text,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.complete_incremental_technical_collection_run(uuid,text,jsonb) to service_role;
grant execute on function public.fail_incremental_technical_collection_run(uuid,text,text,text) to service_role;

do $$
begin
  if has_column_privilege('authenticated','public.technical_collection_runs','collector_work_state','SELECT') then
    raise exception 'collector work state exposed';
  end if;
  if has_function_privilege('authenticated','public.authenticate_technical_collector(text)','EXECUTE')
     or has_function_privilege('authenticated','public.get_incremental_technical_collection_work_claim(uuid,uuid,text)','EXECUTE')
     or has_function_privilege('authenticated','public.checkpoint_incremental_technical_collection_run(uuid,text,jsonb,jsonb,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.complete_incremental_technical_collection_run(uuid,text,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.fail_incremental_technical_collection_run(uuid,text,text,text)','EXECUTE') then
    raise exception 'incremental collector trusted RPC exposed';
  end if;
end $$;

commit;
