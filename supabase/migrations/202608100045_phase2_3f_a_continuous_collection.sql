begin;

create table public.technical_collector_agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Desktop collector' check (char_length(label) between 1 and 100),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  enabled boolean not null default true,
  poll_interval_seconds integer not null default 60 check (poll_interval_seconds between 30 and 3600),
  next_tick_at timestamptz,
  last_heartbeat_at timestamptz,
  last_tick_started_at timestamptz,
  last_tick_completed_at timestamptz,
  last_tick_status text not null default 'IDLE' check (last_tick_status in ('IDLE','RUNNING','SUCCEEDED','FAILED','DISABLED')),
  last_claimed_count integer not null default 0 check (last_claimed_count between 0 and 10),
  last_succeeded_count integer not null default 0 check (last_succeeded_count between 0 and 10),
  last_failed_count integer not null default 0 check (last_failed_count between 0 and 10),
  last_error_code text check (last_error_code is null or char_length(last_error_code) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id),
  unique (owner_id, id)
);

create trigger technical_collector_agents_set_updated_at
before update on public.technical_collector_agents
for each row execute function public.set_updated_at();

alter table public.technical_collector_agents enable row level security;
revoke all on public.technical_collector_agents from public, anon, authenticated;
grant select (
  id, owner_id, label, enabled, poll_interval_seconds, next_tick_at,
  last_heartbeat_at, last_tick_started_at, last_tick_completed_at,
  last_tick_status, last_claimed_count, last_succeeded_count,
  last_failed_count, last_error_code, created_at, updated_at
) on public.technical_collector_agents to authenticated;

create policy technical_collector_agents_select_own
on public.technical_collector_agents
for select to authenticated
using (owner_id = auth.uid());

create function public.configure_technical_collector(
  p_actor uuid,
  p_enabled boolean,
  p_poll_interval_seconds integer default 60,
  p_rotate_token boolean default false,
  p_label text default 'Desktop collector'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.technical_collector_agents;
  raw_token text := null;
  raw_hash text;
begin
  if p_actor is null or not exists(select 1 from auth.users where id = p_actor) then
    raise exception 'INVALID_ACTOR' using errcode = '22023';
  end if;
  if p_poll_interval_seconds not between 30 and 3600
     or p_label is null or char_length(btrim(p_label)) not between 1 and 100 then
    raise exception 'INVALID_COLLECTOR_SETTINGS' using errcode = '22023';
  end if;

  select * into a
  from public.technical_collector_agents
  where owner_id = p_actor
  for update;

  if not found then
    raw_token := encode(extensions.gen_random_bytes(32), 'hex');
    raw_hash := encode(extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'), 'hex');
    insert into public.technical_collector_agents(
      owner_id, label, token_hash, enabled, poll_interval_seconds,
      next_tick_at, last_tick_status
    ) values (
      p_actor, btrim(p_label), raw_hash, p_enabled, p_poll_interval_seconds,
      case when p_enabled then now() else null end,
      case when p_enabled then 'IDLE' else 'DISABLED' end
    ) returning * into a;
  else
    if p_rotate_token then
      raw_token := encode(extensions.gen_random_bytes(32), 'hex');
      raw_hash := encode(extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'), 'hex');
    else
      raw_hash := a.token_hash;
    end if;

    update public.technical_collector_agents
    set label = btrim(p_label),
        token_hash = raw_hash,
        enabled = p_enabled,
        poll_interval_seconds = p_poll_interval_seconds,
        next_tick_at = case
          when p_enabled then coalesce(next_tick_at, now())
          else null
        end,
        last_tick_status = case
          when p_enabled and last_tick_status = 'DISABLED' then 'IDLE'
          when not p_enabled then 'DISABLED'
          else last_tick_status
        end,
        last_error_code = case when p_enabled then null else last_error_code end
    where id = a.id
    returning * into a;
  end if;

  return jsonb_build_object(
    'agent_id', a.id,
    'enabled', a.enabled,
    'poll_interval_seconds', a.poll_interval_seconds,
    'token', raw_token
  );
end $$;

create function public.begin_technical_collector_tick(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.technical_collector_agents;
  supplied_hash text;
  wait_seconds integer := 0;
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

  if not a.enabled then
    return jsonb_build_object(
      'agent_id', a.id,
      'owner_id', a.owner_id,
      'enabled', false,
      'due', false,
      'poll_interval_seconds', a.poll_interval_seconds,
      'wait_seconds', a.poll_interval_seconds
    );
  end if;

  if a.next_tick_at is not null and a.next_tick_at > now() then
    wait_seconds := greatest(1, ceil(extract(epoch from (a.next_tick_at - now())))::integer);
    return jsonb_build_object(
      'agent_id', a.id,
      'owner_id', a.owner_id,
      'enabled', true,
      'due', false,
      'poll_interval_seconds', a.poll_interval_seconds,
      'wait_seconds', wait_seconds
    );
  end if;

  update public.technical_collector_agents
  set next_tick_at = now() + make_interval(secs => poll_interval_seconds),
      last_tick_started_at = now(),
      last_tick_status = 'RUNNING',
      last_error_code = null
  where id = a.id;

  return jsonb_build_object(
    'agent_id', a.id,
    'owner_id', a.owner_id,
    'enabled', true,
    'due', true,
    'poll_interval_seconds', a.poll_interval_seconds,
    'wait_seconds', 0
  );
end $$;

create function public.finish_technical_collector_tick(
  p_agent_id uuid,
  p_claimed integer,
  p_succeeded integer,
  p_failed integer,
  p_error_code text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_agent_id is null
     or p_claimed not between 0 and 10
     or p_succeeded not between 0 and 10
     or p_failed not between 0 and 10
     or p_succeeded + p_failed > p_claimed
     or (p_error_code is not null and char_length(p_error_code) not between 1 and 100) then
    raise exception 'INVALID_COLLECTOR_RESULT' using errcode = '22023';
  end if;

  update public.technical_collector_agents
  set last_tick_completed_at = now(),
      last_tick_status = case when p_error_code is null and p_failed = 0 then 'SUCCEEDED' else 'FAILED' end,
      last_claimed_count = p_claimed,
      last_succeeded_count = p_succeeded,
      last_failed_count = p_failed,
      last_error_code = coalesce(p_error_code, case when p_failed > 0 then 'SOURCE_RUN_FAILED' else null end)
  where id = p_agent_id;

  if not found then
    raise exception 'COLLECTOR_NOT_FOUND' using errcode = 'P0002';
  end if;
  return true;
end $$;

create function public.claim_due_technical_collections_for_owner(
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

    insert into public.technical_collection_runs(
      owner_id, connection_id, source_key, trigger,
      claimed_cursor, lease_token_hash, lease_expires_at
    ) values (
      c.owner_id, c.id, c.source_key, 'SCHEDULED',
      c.cursor, token_hash, now() + interval '5 minutes'
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
      'lease_expires_at', now() + interval '5 minutes'
    );
  end loop;
end $$;

revoke all on function public.configure_technical_collector(uuid,boolean,integer,boolean,text) from public, anon, authenticated;
revoke all on function public.begin_technical_collector_tick(text) from public, anon, authenticated;
revoke all on function public.finish_technical_collector_tick(uuid,integer,integer,integer,text) from public, anon, authenticated;
revoke all on function public.claim_due_technical_collections_for_owner(uuid,integer) from public, anon, authenticated;

grant execute on function public.configure_technical_collector(uuid,boolean,integer,boolean,text) to service_role;
grant execute on function public.begin_technical_collector_tick(text) to service_role;
grant execute on function public.finish_technical_collector_tick(uuid,integer,integer,integer,text) to service_role;
grant execute on function public.claim_due_technical_collections_for_owner(uuid,integer) to service_role;

do $$
begin
  if has_table_privilege('authenticated','public.technical_collector_agents','INSERT')
     or has_table_privilege('authenticated','public.technical_collector_agents','UPDATE')
     or has_table_privilege('authenticated','public.technical_collector_agents','DELETE') then
    raise exception 'collector ACL broadened';
  end if;
  if has_column_privilege('authenticated','public.technical_collector_agents','token_hash','SELECT') then
    raise exception 'collector token hash exposed';
  end if;
  if has_function_privilege('authenticated','public.begin_technical_collector_tick(text)','EXECUTE')
     or has_function_privilege('authenticated','public.claim_due_technical_collections_for_owner(uuid,integer)','EXECUTE') then
    raise exception 'collector trusted RPC exposed';
  end if;
end $$;

commit;
