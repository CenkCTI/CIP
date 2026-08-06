do $$ begin
  create type public.technical_source_key as enum ('TEST_SYNTHETIC','CISA_KEV','NVD_CVE');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.technical_source_status as enum ('ENABLED','PAUSED','ARCHIVED');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.technical_collection_trigger as enum ('MANUAL','SCHEDULED','TEST');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.technical_collection_run_status as enum ('RUNNING','SUCCEEDED','FAILED');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.technical_collection_issue_kind as enum ('SKIPPED','WARNING','ERROR');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.technical_source_audit_action as enum (
    'ENABLED','PAUSED','RESUMED','ARCHIVED','RESTORED',
    'SETTINGS_CHANGED','SCHEDULE_CHANGED','MANUAL_SYNC_REQUESTED'
  );
exception when duplicate_object then null; end $$;

create table public.technical_source_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_key public.technical_source_key not null,
  status public.technical_source_status not null default 'PAUSED',
  settings jsonb not null default '{}'::jsonb,
  cursor jsonb not null default '{"version":1}'::jsonb,
  cursor_version integer not null default 1 check (cursor_version > 0),
  interval_minutes integer not null,
  next_run_at timestamptz,
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id),
  unique (owner_id, id, source_key),
  unique (owner_id, source_key),
  check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 16384),
  check (jsonb_typeof(cursor) = 'object' and pg_column_size(cursor) <= 32768),
  check (status <> 'ARCHIVED' or next_run_at is null)
);
create trigger technical_source_connections_set_updated_at
before update on public.technical_source_connections
for each row execute function public.set_updated_at();

create table public.technical_collection_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null,
  source_key public.technical_source_key not null,
  trigger public.technical_collection_trigger not null,
  status public.technical_collection_run_status not null default 'RUNNING',
  claimed_cursor jsonb not null,
  proposed_cursor jsonb,
  lease_token_hash text not null check (lease_token_hash ~ '^[a-f0-9]{64}$'),
  lease_expires_at timestamptz not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  records_seen integer not null default 0 check (records_seen >= 0),
  records_mapped integer not null default 0 check (records_mapped >= 0),
  signals_created integer not null default 0 check (signals_created >= 0),
  observations_created integer not null default 0 check (observations_created >= 0),
  revisions_created integer not null default 0 check (revisions_created >= 0),
  duplicate_observations integer not null default 0 check (duplicate_observations >= 0),
  supporting_observations integer not null default 0 check (supporting_observations >= 0),
  stale_observations integer not null default 0 check (stale_observations >= 0),
  conflicting_observations integer not null default 0 check (conflicting_observations >= 0),
  skipped_records integer not null default 0 check (skipped_records >= 0),
  failed_records integer not null default 0 check (failed_records >= 0),
  controlled_error_code text check (controlled_error_code is null or char_length(controlled_error_code) between 1 and 100),
  controlled_error_message text check (controlled_error_message is null or char_length(controlled_error_message) <= 500),
  created_at timestamptz not null default now(),
  unique (owner_id, id),
  unique (owner_id, id, source_key),
  foreign key (owner_id, connection_id, source_key)
    references public.technical_source_connections(owner_id, id, source_key) on delete cascade,
  check (jsonb_typeof(claimed_cursor) = 'object' and pg_column_size(claimed_cursor) <= 32768),
  check (proposed_cursor is null or (jsonb_typeof(proposed_cursor) = 'object' and pg_column_size(proposed_cursor) <= 32768)),
  check ((status = 'RUNNING') = (completed_at is null)),
  check (records_mapped <= records_seen),
  check (signals_created <= records_mapped),
  check (observations_created <= records_mapped),
  check (revisions_created <= records_mapped),
  check (duplicate_observations <= records_mapped),
  check (supporting_observations + stale_observations + conflicting_observations <= records_mapped)
);
create unique index technical_collection_runs_one_active_idx
  on public.technical_collection_runs(connection_id) where status = 'RUNNING';
create index technical_collection_runs_owner_started_idx
  on public.technical_collection_runs(owner_id, started_at desc, id desc);

create table public.technical_collection_run_issues (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null,
  source_key public.technical_source_key not null,
  issue_kind public.technical_collection_issue_kind not null,
  issue_code text not null check (char_length(issue_code) between 1 and 100),
  source_record_key text check (source_record_key is null or char_length(source_record_key) <= 300),
  safe_message text not null check (char_length(safe_message) between 1 and 500),
  created_at timestamptz not null default now(),
  foreign key (owner_id, run_id, source_key)
    references public.technical_collection_runs(owner_id, id, source_key) on delete cascade
);
create index technical_collection_run_issues_run_idx
  on public.technical_collection_run_issues(owner_id, run_id, created_at, id);

create table public.technical_source_audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null,
  source_key public.technical_source_key not null,
  action public.technical_source_audit_action not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (owner_id, connection_id, source_key)
    references public.technical_source_connections(owner_id, id, source_key) on delete cascade,
  check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 8192)
);
create index technical_source_audit_owner_idx
  on public.technical_source_audit_events(owner_id, connection_id, created_at desc, id desc);

create function public.technical_source_reject_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'APPEND_ONLY' using errcode = '55000';
end $$;
create trigger technical_collection_run_issues_append_only
before update or delete on public.technical_collection_run_issues
for each row execute function public.technical_source_reject_change();
create trigger technical_source_audit_events_append_only
before update or delete on public.technical_source_audit_events
for each row execute function public.technical_source_reject_change();

alter table public.technical_source_connections enable row level security;
alter table public.technical_collection_runs enable row level security;
alter table public.technical_collection_run_issues enable row level security;
alter table public.technical_source_audit_events enable row level security;
revoke all on public.technical_source_connections, public.technical_collection_runs,
  public.technical_collection_run_issues, public.technical_source_audit_events
from anon, authenticated;
grant select (id,owner_id,source_key,status,settings,cursor_version,interval_minutes,next_run_at,last_started_at,last_succeeded_at,last_failed_at,consecutive_failures,created_at,updated_at)
  on public.technical_source_connections to authenticated;
grant select (id,owner_id,connection_id,source_key,trigger,status,lease_expires_at,started_at,completed_at,records_seen,records_mapped,signals_created,observations_created,revisions_created,duplicate_observations,supporting_observations,stale_observations,conflicting_observations,skipped_records,failed_records,controlled_error_code,controlled_error_message,created_at)
  on public.technical_collection_runs to authenticated;
grant select on public.technical_collection_run_issues, public.technical_source_audit_events to authenticated;
create policy technical_source_connections_select_own on public.technical_source_connections
  for select to authenticated using (auth.uid() = owner_id);
create policy technical_collection_runs_select_own on public.technical_collection_runs
  for select to authenticated using (auth.uid() = owner_id);
create policy technical_collection_run_issues_select_own on public.technical_collection_run_issues
  for select to authenticated using (auth.uid() = owner_id);
create policy technical_source_audit_events_select_own on public.technical_source_audit_events
  for select to authenticated using (auth.uid() = owner_id);

create function public.technical_source_validate_settings(
  p_source public.technical_source_key,
  p_settings jsonb,
  p_interval integer
) returns void language plpgsql immutable set search_path = '' as $$
declare lookback integer;
begin
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' or pg_column_size(p_settings) > 16384 then
    raise exception 'INVALID_SOURCE_SETTINGS' using errcode = '22023';
  end if;
  if p_source = 'TEST_SYNTHETIC' then
    if p_settings <> '{}'::jsonb or p_interval <> 0 then
      raise exception 'INVALID_SOURCE_SETTINGS' using errcode = '22023';
    end if;
  elsif p_source = 'CISA_KEV' then
    if p_settings <> '{}'::jsonb or p_interval not between 60 and 1440 then
      raise exception 'INVALID_SOURCE_SETTINGS' using errcode = '22023';
    end if;
  elsif p_source = 'NVD_CVE' then
    if p_interval not between 60 and 1440 or p_settings - 'initialLookbackHours' <> '{}'::jsonb
       or (p_settings ? 'initialLookbackHours' and jsonb_typeof(p_settings->'initialLookbackHours') <> 'number') then
      raise exception 'INVALID_SOURCE_SETTINGS' using errcode = '22023';
    end if;
    lookback := coalesce((p_settings->>'initialLookbackHours')::integer, 24);
    if lookback not between 1 and 168 then
      raise exception 'INVALID_SOURCE_SETTINGS' using errcode = '22023';
    end if;
  end if;
exception when invalid_text_representation then
  raise exception 'INVALID_SOURCE_SETTINGS' using errcode = '22023';
end $$;

create function public.technical_source_validate_cursor(
  p_source public.technical_source_key,
  p_cursor jsonb
) returns void language plpgsql immutable set search_path = '' as $$
declare version integer;
begin
  if p_cursor is null or jsonb_typeof(p_cursor) <> 'object' or pg_column_size(p_cursor) > 32768 then
    raise exception 'INVALID_CURSOR' using errcode = '22023';
  end if;
  version := (p_cursor->>'version')::integer;
  if version is distinct from 1 then raise exception 'UNSUPPORTED_CURSOR_VERSION' using errcode = '22023'; end if;
  if p_source = 'TEST_SYNTHETIC' then
    if p_cursor - array['version','sequence'] <> '{}'::jsonb
       or (p_cursor ? 'sequence' and jsonb_typeof(p_cursor->'sequence') <> 'number')
       or coalesce((p_cursor->>'sequence')::integer, 0) < 0 then
      raise exception 'INVALID_CURSOR' using errcode = '22023';
    end if;
  elsif p_source = 'CISA_KEV' then
    if p_cursor - array['version','catalogRelease','etag','lastModified'] <> '{}'::jsonb
       or (p_cursor ? 'catalogRelease' and (jsonb_typeof(p_cursor->'catalogRelease') <> 'string' or char_length(p_cursor->>'catalogRelease') > 200))
       or (p_cursor ? 'etag' and (jsonb_typeof(p_cursor->'etag') <> 'string' or char_length(p_cursor->>'etag') > 500))
       or (p_cursor ? 'lastModified' and (jsonb_typeof(p_cursor->'lastModified') <> 'string' or char_length(p_cursor->>'lastModified') > 200)) then
      raise exception 'INVALID_CURSOR' using errcode = '22023';
    end if;
  elsif p_source = 'NVD_CVE' then
    if p_cursor - array['version','lastModifiedWatermark'] <> '{}'::jsonb
       or (p_cursor ? 'lastModifiedWatermark' and jsonb_typeof(p_cursor->'lastModifiedWatermark') <> 'string') then
      raise exception 'INVALID_CURSOR' using errcode = '22023';
    end if;
    if p_cursor->>'lastModifiedWatermark' is not null then
      perform (p_cursor->>'lastModifiedWatermark')::timestamptz;
    end if;
  end if;
exception when invalid_text_representation or datetime_field_overflow then
  raise exception 'INVALID_CURSOR' using errcode = '22023';
end $$;

create function public.technical_source_audit(
  p_owner uuid,
  p_connection uuid,
  p_source public.technical_source_key,
  p_action public.technical_source_audit_action,
  p_details jsonb default '{}'::jsonb
) returns void language plpgsql set search_path = '' as $$
begin
  insert into public.technical_source_audit_events(owner_id, connection_id, source_key, action, details)
  values (p_owner, p_connection, p_source, p_action, coalesce(p_details, '{}'::jsonb));
end $$;

create function public.enable_technical_source(
  p_actor uuid,
  p_source public.technical_source_key,
  p_settings jsonb default '{}'::jsonb,
  p_interval_minutes integer default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.technical_source_connections; interval_value integer; initial_cursor jsonb;
begin
  if p_actor is null or not exists(select 1 from auth.users where id = p_actor) then
    raise exception 'INVALID_ACTOR' using errcode = '22023';
  end if;
  interval_value := coalesce(p_interval_minutes, case p_source when 'TEST_SYNTHETIC' then 0 when 'CISA_KEV' then 360 else 120 end);
  perform public.technical_source_validate_settings(p_source, coalesce(p_settings,'{}'::jsonb), interval_value);
  initial_cursor := case p_source
    when 'TEST_SYNTHETIC' then '{"version":1,"sequence":0}'::jsonb
    when 'CISA_KEV' then '{"version":1}'::jsonb
    else '{"version":1}'::jsonb end;
  insert into public.technical_source_connections(owner_id, source_key, status, settings, cursor, cursor_version, interval_minutes, next_run_at)
  values (p_actor, p_source, 'ENABLED', coalesce(p_settings,'{}'::jsonb), initial_cursor, 1, interval_value,
    case when p_source = 'TEST_SYNTHETIC' then null else now() end)
  on conflict (owner_id, source_key) do update
    set status = 'ENABLED', settings = excluded.settings, interval_minutes = excluded.interval_minutes,
        next_run_at = case when excluded.source_key = 'TEST_SYNTHETIC' then null else coalesce(public.technical_source_connections.next_run_at, now()) end
  returning * into c;
  perform public.technical_source_audit(p_actor, c.id, c.source_key,
    case when c.created_at = c.updated_at then 'ENABLED' else 'RESTORED' end,
    jsonb_build_object('intervalMinutes', c.interval_minutes));
  return c.id;
end $$;

create function public.set_technical_source_status(
  p_actor uuid,
  p_connection_id uuid,
  p_status public.technical_source_status
) returns public.technical_source_status language plpgsql security definer set search_path = '' as $$
declare c public.technical_source_connections; old_status public.technical_source_status; audit_action public.technical_source_audit_action;
begin
  select * into c from public.technical_source_connections where id = p_connection_id and owner_id = p_actor for update;
  if not found then raise exception 'SOURCE_NOT_AVAILABLE' using errcode = 'P0002'; end if;
  old_status := c.status;
  if old_status = p_status then return p_status; end if;
  if old_status = 'ARCHIVED' and p_status = 'ENABLED' then
    raise exception 'RESTORE_TO_PAUSED_REQUIRED' using errcode = '22023';
  end if;
  update public.technical_source_connections set status = p_status,
    next_run_at = case when p_status = 'ENABLED' and source_key <> 'TEST_SYNTHETIC' then coalesce(next_run_at, now()) else null end
  where id = c.id;
  audit_action := case
    when p_status = 'PAUSED' and old_status = 'ARCHIVED' then 'RESTORED'
    when p_status = 'PAUSED' then 'PAUSED'
    when p_status = 'ENABLED' then 'RESUMED'
    else 'ARCHIVED' end;
  perform public.technical_source_audit(p_actor, c.id, c.source_key, audit_action,
    jsonb_build_object('from', old_status, 'to', p_status));
  return p_status;
end $$;

create function public.update_technical_source_settings(
  p_actor uuid,
  p_connection_id uuid,
  p_settings jsonb,
  p_interval_minutes integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.technical_source_connections; settings_changed boolean; schedule_changed boolean;
begin
  select * into c from public.technical_source_connections where id = p_connection_id and owner_id = p_actor for update;
  if not found then raise exception 'SOURCE_NOT_AVAILABLE' using errcode = 'P0002'; end if;
  if c.status = 'ARCHIVED' then raise exception 'SOURCE_ARCHIVED' using errcode = '55000'; end if;
  if exists(select 1 from public.technical_collection_runs where connection_id = c.id and status = 'RUNNING') then
    raise exception 'SOURCE_ALREADY_RUNNING' using errcode = '55000';
  end if;
  perform public.technical_source_validate_settings(c.source_key, p_settings, p_interval_minutes);
  settings_changed := c.settings is distinct from p_settings;
  schedule_changed := c.interval_minutes is distinct from p_interval_minutes;
  update public.technical_source_connections set settings = p_settings, interval_minutes = p_interval_minutes,
    next_run_at = case when status = 'ENABLED' and source_key <> 'TEST_SYNTHETIC' then now() else null end
  where id = c.id;
  if settings_changed then
    perform public.technical_source_audit(p_actor, c.id, c.source_key, 'SETTINGS_CHANGED', '{}'::jsonb);
  end if;
  if schedule_changed then
    perform public.technical_source_audit(p_actor, c.id, c.source_key, 'SCHEDULE_CHANGED',
      jsonb_build_object('fromIntervalMinutes', c.interval_minutes, 'toIntervalMinutes', p_interval_minutes));
  end if;
  return c.id;
end $$;

create function public.claim_manual_technical_collection(
  p_actor uuid,
  p_connection_id uuid,
  p_trigger public.technical_collection_trigger default 'MANUAL'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.technical_source_connections; run_id uuid; token text; token_hash text;
begin
  if p_trigger not in ('MANUAL','TEST') then raise exception 'INVALID_TRIGGER' using errcode = '22023'; end if;
  select * into c from public.technical_source_connections where id = p_connection_id and owner_id = p_actor for update;
  if not found then raise exception 'SOURCE_NOT_AVAILABLE' using errcode = 'P0002'; end if;
  if c.status = 'ARCHIVED' then raise exception 'SOURCE_ARCHIVED' using errcode = '55000'; end if;
  if exists(select 1 from public.technical_collection_runs where connection_id = c.id and status = 'RUNNING') then
    raise exception 'SOURCE_ALREADY_RUNNING' using errcode = '55000';
  end if;
  if c.last_started_at is not null and c.last_started_at > now() - interval '30 seconds' then
    raise exception 'SOURCE_COOLDOWN' using errcode = '55000';
  end if;
  token := encode(extensions.gen_random_bytes(32), 'hex');
  token_hash := encode(extensions.digest(convert_to(token, 'UTF8'), 'sha256'), 'hex');
  insert into public.technical_collection_runs(owner_id, connection_id, source_key, trigger, claimed_cursor, lease_token_hash, lease_expires_at)
  values (p_actor, c.id, c.source_key, p_trigger, c.cursor, token_hash, now() + interval '5 minutes') returning id into run_id;
  update public.technical_source_connections set last_started_at = now() where id = c.id;
  perform public.technical_source_audit(p_actor, c.id, c.source_key, 'MANUAL_SYNC_REQUESTED', jsonb_build_object('trigger', p_trigger));
  return jsonb_build_object('run_id', run_id, 'owner_id', p_actor, 'connection_id', c.id, 'source_key', c.source_key,
    'settings', c.settings, 'cursor', c.cursor, 'lease_token', token, 'lease_expires_at', now() + interval '5 minutes');
end $$;

create function public.recover_expired_technical_collection_runs()
returns integer language plpgsql security definer set search_path = '' as $$
declare r public.technical_collection_runs; recovered integer := 0; next_failures integer;
begin
  for r in
    select * from public.technical_collection_runs
    where status = 'RUNNING' and lease_expires_at <= now()
    order by lease_expires_at, id for update skip locked
  loop
    update public.technical_collection_runs set status = 'FAILED', completed_at = now(),
      controlled_error_code = 'LEASE_EXPIRED',
      controlled_error_message = 'The collection lease expired before completion.',
      failed_records = greatest(failed_records, 1)
    where id = r.id;
    select consecutive_failures + 1 into next_failures
    from public.technical_source_connections where id = r.connection_id and owner_id = r.owner_id for update;
    update public.technical_source_connections set last_failed_at = now(), consecutive_failures = next_failures,
      next_run_at = case when status = 'ENABLED' and source_key <> 'TEST_SYNTHETIC'
        then now() + make_interval(mins => least(1440, greatest(5, (power(2,least(next_failures,6))::integer) * 5)))
        else null end
    where id = r.connection_id and owner_id = r.owner_id;
    recovered := recovered + 1;
  end loop;
  return recovered;
end $$;

create function public.claim_due_technical_collections(p_limit integer default 5)
returns setof jsonb language plpgsql security definer set search_path = '' as $$
declare c public.technical_source_connections; run_id uuid; token text; token_hash text;
begin
  if p_limit not between 1 and 10 then raise exception 'INVALID_BATCH_SIZE' using errcode = '22023'; end if;
  perform public.recover_expired_technical_collection_runs();
  for c in
    select * from public.technical_source_connections
    where status = 'ENABLED' and source_key <> 'TEST_SYNTHETIC'
      and next_run_at is not null and next_run_at <= now()
      and not exists(select 1 from public.technical_collection_runs r where r.connection_id = technical_source_connections.id and r.status = 'RUNNING')
    order by next_run_at, id for update skip locked limit p_limit
  loop
    token := encode(extensions.gen_random_bytes(32), 'hex');
    token_hash := encode(extensions.digest(convert_to(token, 'UTF8'), 'sha256'), 'hex');
    insert into public.technical_collection_runs(owner_id, connection_id, source_key, trigger, claimed_cursor, lease_token_hash, lease_expires_at)
    values (c.owner_id, c.id, c.source_key, 'SCHEDULED', c.cursor, token_hash, now() + interval '5 minutes') returning id into run_id;
    update public.technical_source_connections set last_started_at = now() where id = c.id;
    return next jsonb_build_object('run_id', run_id, 'owner_id', c.owner_id, 'connection_id', c.id, 'source_key', c.source_key,
      'settings', c.settings, 'cursor', c.cursor, 'lease_token', token, 'lease_expires_at', now() + interval '5 minutes');
  end loop;
end $$;

create function public.complete_technical_collection_run(
  p_run_id uuid,
  p_lease_token text,
  p_proposed_cursor jsonb,
  p_counters jsonb,
  p_issues jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.technical_collection_runs; c public.technical_source_connections; i jsonb; issue_count integer := 0;
begin
  select * into r from public.technical_collection_runs where id = p_run_id for update;
  if not found or r.status <> 'RUNNING' then raise exception 'LEASE_MISMATCH' using errcode = '55000'; end if;
  if r.lease_expires_at <= now() then raise exception 'LEASE_EXPIRED' using errcode = '55000'; end if;
  if r.lease_token_hash <> encode(extensions.digest(convert_to(coalesce(p_lease_token,''), 'UTF8'), 'sha256'), 'hex') then
    raise exception 'LEASE_MISMATCH' using errcode = '55000';
  end if;
  select * into c from public.technical_source_connections where id = r.connection_id and owner_id = r.owner_id for update;
  if c.cursor <> r.claimed_cursor then raise exception 'STALE_COLLECTION_COMPLETION' using errcode = '55000'; end if;
  perform public.technical_source_validate_cursor(r.source_key, p_proposed_cursor);
  if jsonb_typeof(p_counters) <> 'object' or jsonb_typeof(p_issues) <> 'array' or jsonb_array_length(p_issues) > 100 then
    raise exception 'INVALID_COLLECTION_RESULT' using errcode = '22023';
  end if;
  for i in select value from jsonb_array_elements(p_issues) loop
    issue_count := issue_count + 1;
    insert into public.technical_collection_run_issues(owner_id, run_id, source_key, issue_kind, issue_code, source_record_key, safe_message)
    values (r.owner_id, r.id, r.source_key, (i->>'kind')::public.technical_collection_issue_kind,
      left(i->>'code',100), nullif(left(coalesce(i->>'sourceRecordKey',''),300),''), left(coalesce(i->>'message','Collection record skipped.'),500));
  end loop;
  update public.technical_collection_runs set status = 'SUCCEEDED', completed_at = now(), proposed_cursor = p_proposed_cursor,
    records_seen = coalesce((p_counters->>'recordsSeen')::integer,0),
    records_mapped = coalesce((p_counters->>'recordsMapped')::integer,0),
    signals_created = coalesce((p_counters->>'signalsCreated')::integer,0),
    observations_created = coalesce((p_counters->>'observationsCreated')::integer,0),
    revisions_created = coalesce((p_counters->>'revisionsCreated')::integer,0),
    duplicate_observations = coalesce((p_counters->>'duplicateObservations')::integer,0),
    supporting_observations = coalesce((p_counters->>'supportingObservations')::integer,0),
    stale_observations = coalesce((p_counters->>'staleObservations')::integer,0),
    conflicting_observations = coalesce((p_counters->>'conflictingObservations')::integer,0),
    skipped_records = coalesce((p_counters->>'skippedRecords')::integer,0),
    failed_records = coalesce((p_counters->>'failedRecords')::integer,0)
  where id = r.id;
  update public.technical_source_connections set cursor = p_proposed_cursor,
    cursor_version = (p_proposed_cursor->>'version')::integer,
    last_succeeded_at = now(), consecutive_failures = 0,
    next_run_at = case when status = 'ENABLED' and source_key <> 'TEST_SYNTHETIC'
      then now() + make_interval(mins => interval_minutes) else null end
  where id = c.id;
  return jsonb_build_object('run_id', r.id, 'status', 'SUCCEEDED', 'issues_created', issue_count);
exception when invalid_text_representation or check_violation then
  raise exception 'INVALID_COLLECTION_RESULT' using errcode = '22023';
end $$;

create function public.fail_technical_collection_run(
  p_run_id uuid,
  p_lease_token text,
  p_error_code text,
  p_error_message text,
  p_counters jsonb default '{}'::jsonb,
  p_issues jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.technical_collection_runs; c public.technical_source_connections; i jsonb; next_failures integer;
begin
  select * into r from public.technical_collection_runs where id = p_run_id for update;
  if not found or r.status <> 'RUNNING' or r.lease_token_hash <> encode(extensions.digest(convert_to(coalesce(p_lease_token,''), 'UTF8'), 'sha256'), 'hex') then
    raise exception 'LEASE_MISMATCH' using errcode = '55000';
  end if;
  if r.lease_expires_at <= now() then raise exception 'LEASE_EXPIRED' using errcode = '55000'; end if;
  if jsonb_typeof(p_counters) <> 'object' or jsonb_typeof(p_issues) <> 'array' or jsonb_array_length(p_issues) > 100 then
    raise exception 'INVALID_COLLECTION_RESULT' using errcode = '22023';
  end if;
  for i in select value from jsonb_array_elements(p_issues) loop
    insert into public.technical_collection_run_issues(owner_id, run_id, source_key, issue_kind, issue_code, source_record_key, safe_message)
    values (r.owner_id, r.id, r.source_key, (i->>'kind')::public.technical_collection_issue_kind,
      left(i->>'code',100), nullif(left(coalesce(i->>'sourceRecordKey',''),300),''), left(coalesce(i->>'message','Collection record skipped.'),500));
  end loop;
  update public.technical_collection_runs set status = 'FAILED', completed_at = now(),
    records_seen = coalesce((p_counters->>'recordsSeen')::integer,0), records_mapped = coalesce((p_counters->>'recordsMapped')::integer,0),
    signals_created = coalesce((p_counters->>'signalsCreated')::integer,0), observations_created = coalesce((p_counters->>'observationsCreated')::integer,0),
    revisions_created = coalesce((p_counters->>'revisionsCreated')::integer,0), duplicate_observations = coalesce((p_counters->>'duplicateObservations')::integer,0),
    supporting_observations = coalesce((p_counters->>'supportingObservations')::integer,0), stale_observations = coalesce((p_counters->>'staleObservations')::integer,0),
    conflicting_observations = coalesce((p_counters->>'conflictingObservations')::integer,0), skipped_records = coalesce((p_counters->>'skippedRecords')::integer,0),
    failed_records = greatest(1,coalesce((p_counters->>'failedRecords')::integer,1)),
    controlled_error_code = left(coalesce(nullif(p_error_code,''),'COLLECTION_FAILED'),100),
    controlled_error_message = left(coalesce(p_error_message,'Collection failed safely.'),500)
  where id = r.id;
  select * into c from public.technical_source_connections where id = r.connection_id and owner_id = r.owner_id for update;
  next_failures := c.consecutive_failures + 1;
  update public.technical_source_connections set last_failed_at = now(), consecutive_failures = next_failures,
    next_run_at = case when status = 'ENABLED' and source_key <> 'TEST_SYNTHETIC'
      then now() + make_interval(mins => least(1440, greatest(5, (power(2,least(next_failures,6))::integer) * 5))) else null end
  where id = c.id;
  return jsonb_build_object('run_id', r.id, 'status', 'FAILED');
exception when invalid_text_representation or check_violation then
  raise exception 'INVALID_COLLECTION_RESULT' using errcode = '22023';
end $$;

revoke all on function public.technical_source_reject_change() from public, anon, authenticated;
revoke all on function public.technical_source_validate_settings(public.technical_source_key,jsonb,integer) from public, anon, authenticated;
revoke all on function public.technical_source_validate_cursor(public.technical_source_key,jsonb) from public, anon, authenticated;
revoke all on function public.technical_source_audit(uuid,uuid,public.technical_source_key,public.technical_source_audit_action,jsonb) from public, anon, authenticated;
revoke all on function public.enable_technical_source(uuid,public.technical_source_key,jsonb,integer) from public, anon, authenticated;
revoke all on function public.set_technical_source_status(uuid,uuid,public.technical_source_status) from public, anon, authenticated;
revoke all on function public.update_technical_source_settings(uuid,uuid,jsonb,integer) from public, anon, authenticated;
revoke all on function public.claim_manual_technical_collection(uuid,uuid,public.technical_collection_trigger) from public, anon, authenticated;
revoke all on function public.recover_expired_technical_collection_runs() from public, anon, authenticated;
revoke all on function public.claim_due_technical_collections(integer) from public, anon, authenticated;
revoke all on function public.complete_technical_collection_run(uuid,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.fail_technical_collection_run(uuid,text,text,text,jsonb,jsonb) from public, anon, authenticated;

grant execute on function public.enable_technical_source(uuid,public.technical_source_key,jsonb,integer) to service_role;
grant execute on function public.set_technical_source_status(uuid,uuid,public.technical_source_status) to service_role;
grant execute on function public.update_technical_source_settings(uuid,uuid,jsonb,integer) to service_role;
grant execute on function public.claim_manual_technical_collection(uuid,uuid,public.technical_collection_trigger) to service_role;
grant execute on function public.recover_expired_technical_collection_runs() to service_role;
grant execute on function public.claim_due_technical_collections(integer) to service_role;
grant execute on function public.complete_technical_collection_run(uuid,text,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.fail_technical_collection_run(uuid,text,text,text,jsonb,jsonb) to service_role;
