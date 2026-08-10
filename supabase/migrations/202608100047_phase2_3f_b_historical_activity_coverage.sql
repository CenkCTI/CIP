begin;

do $$ begin
  create type public.technical_activity_granularity as enum ('FIVE_MINUTES','HOUR','DAY');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.technical_activity_time_axis as enum ('INGESTION_TIME','SOURCE_EFFECTIVE_TIME');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.technical_coverage_status as enum ('COMPLETE','PARTIAL','DEGRADED','NO_COVERAGE');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.technical_rollup_calculation_mode as enum ('LIVE','BACKFILLED','RECOMPUTED');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.technical_history_kind as enum ('ACTIVITY','COVERAGE');
exception when duplicate_object then null; end $$;

create table public.technical_activity_buckets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  granularity public.technical_activity_granularity not null,
  time_axis public.technical_activity_time_axis not null,
  bucket_start timestamptz not null,
  bucket_end timestamptz not null,
  source_system text not null check (char_length(source_system) between 1 and 200),
  signal_type public.technical_signal_type not null,
  observation_count integer not null check (observation_count >= 0),
  distinct_signal_count integer not null check (distinct_signal_count >= 0),
  current_count integer not null default 0 check (current_count >= 0),
  supporting_count integer not null default 0 check (supporting_count >= 0),
  stale_count integer not null default 0 check (stale_count >= 0),
  conflicting_count integer not null default 0 check (conflicting_count >= 0),
  calculation_mode public.technical_rollup_calculation_mode not null,
  calculated_at timestamptz not null default now(),
  unique (owner_id, granularity, time_axis, bucket_start, source_system, signal_type),
  check (bucket_end > bucket_start),
  check (distinct_signal_count <= observation_count),
  check (current_count + supporting_count + stale_count + conflicting_count = observation_count)
);
create index technical_activity_buckets_owner_time_idx
  on public.technical_activity_buckets(owner_id, granularity, time_axis, bucket_start desc);
create index technical_activity_buckets_owner_source_time_idx
  on public.technical_activity_buckets(owner_id, source_system, granularity, bucket_start desc);

create table public.technical_source_schedule_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null,
  source_key public.technical_source_key not null,
  status public.technical_source_status not null,
  interval_minutes integer not null check (interval_minutes >= 0),
  next_run_at timestamptz,
  observed_at timestamptz not null default now(),
  reconstructed boolean not null default false,
  configuration_fingerprint text not null check (configuration_fingerprint ~ '^[a-f0-9]{64}$'),
  foreign key (owner_id, connection_id, source_key)
    references public.technical_source_connections(owner_id, id, source_key) on delete cascade
);
create index technical_source_schedule_snapshots_lookup_idx
  on public.technical_source_schedule_snapshots(owner_id, connection_id, observed_at desc, id desc);
create index technical_source_schedule_snapshots_due_idx
  on public.technical_source_schedule_snapshots(owner_id, connection_id, next_run_at)
  where next_run_at is not null;

create table public.technical_collection_coverage_buckets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null,
  source_key public.technical_source_key not null,
  granularity public.technical_activity_granularity not null,
  bucket_start timestamptz not null,
  bucket_end timestamptz not null,
  source_status public.technical_source_status not null,
  schedule_known boolean not null,
  expected_runs integer not null default 0 check (expected_runs >= 0),
  attempted_runs integer not null default 0 check (attempted_runs >= 0),
  successful_runs integer not null default 0 check (successful_runs >= 0),
  failed_runs integer not null default 0 check (failed_runs >= 0),
  running_runs integer not null default 0 check (running_runs >= 0),
  records_seen integer not null default 0 check (records_seen >= 0),
  records_mapped integer not null default 0 check (records_mapped >= 0),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_code text check (last_error_code is null or char_length(last_error_code) between 1 and 100),
  coverage_status public.technical_coverage_status not null,
  calculation_mode public.technical_rollup_calculation_mode not null,
  calculated_at timestamptz not null default now(),
  unique (owner_id, connection_id, granularity, bucket_start),
  foreign key (owner_id, connection_id, source_key)
    references public.technical_source_connections(owner_id, id, source_key) on delete cascade,
  check (bucket_end > bucket_start),
  check (successful_runs + failed_runs + running_runs <= attempted_runs),
  check (records_mapped <= records_seen)
);
create index technical_collection_coverage_owner_time_idx
  on public.technical_collection_coverage_buckets(owner_id, granularity, bucket_start desc);
create index technical_collection_coverage_source_time_idx
  on public.technical_collection_coverage_buckets(owner_id, source_key, granularity, bucket_start desc);

create table public.technical_history_maintenance_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  next_maintenance_at timestamptz,
  last_activity_refresh_at timestamptz,
  last_coverage_refresh_at timestamptz,
  last_compaction_at timestamptz,
  backfill_phase smallint not null default 0 check (backfill_phase between 0 and 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger technical_history_maintenance_state_set_updated_at
before update on public.technical_history_maintenance_state
for each row execute function public.set_updated_at();

create table public.technical_history_backfill_state (
  owner_id uuid not null references auth.users(id) on delete cascade,
  history_kind public.technical_history_kind not null,
  granularity public.technical_activity_granularity not null,
  time_axis public.technical_activity_time_axis not null,
  lower_bound timestamptz,
  cursor_at timestamptz,
  complete boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (owner_id, history_kind, granularity, time_axis),
  check ((complete and completed_at is not null) or (not complete and completed_at is null))
);
create trigger technical_history_backfill_state_set_updated_at
before update on public.technical_history_backfill_state
for each row execute function public.set_updated_at();

alter table public.technical_activity_buckets enable row level security;
alter table public.technical_source_schedule_snapshots enable row level security;
alter table public.technical_collection_coverage_buckets enable row level security;
alter table public.technical_history_maintenance_state enable row level security;
alter table public.technical_history_backfill_state enable row level security;

revoke all on public.technical_activity_buckets,
  public.technical_source_schedule_snapshots,
  public.technical_collection_coverage_buckets,
  public.technical_history_maintenance_state,
  public.technical_history_backfill_state
from public, anon, authenticated;

grant select on public.technical_activity_buckets,
  public.technical_source_schedule_snapshots,
  public.technical_collection_coverage_buckets,
  public.technical_history_maintenance_state,
  public.technical_history_backfill_state
to authenticated;

create policy technical_activity_buckets_select_own
on public.technical_activity_buckets for select to authenticated
using (owner_id = auth.uid());
create policy technical_source_schedule_snapshots_select_own
on public.technical_source_schedule_snapshots for select to authenticated
using (owner_id = auth.uid());
create policy technical_collection_coverage_buckets_select_own
on public.technical_collection_coverage_buckets for select to authenticated
using (owner_id = auth.uid());
create policy technical_history_maintenance_state_select_own
on public.technical_history_maintenance_state for select to authenticated
using (owner_id = auth.uid());
create policy technical_history_backfill_state_select_own
on public.technical_history_backfill_state for select to authenticated
using (owner_id = auth.uid());

create trigger technical_source_schedule_snapshots_append_only
before update or delete on public.technical_source_schedule_snapshots
for each row execute function public.technical_source_reject_change();

create function public.technical_history_bucket_seconds(p_granularity public.technical_activity_granularity)
returns integer language sql immutable strict set search_path = '' as $$
  select case p_granularity
    when 'FIVE_MINUTES' then 300
    when 'HOUR' then 3600
    when 'DAY' then 86400
  end
$$;

create function public.technical_history_bucket_start(
  p_value timestamptz,
  p_granularity public.technical_activity_granularity
) returns timestamptz language sql immutable strict set search_path = '' as $$
  select to_timestamp(
    floor(extract(epoch from p_value) / public.technical_history_bucket_seconds(p_granularity))
    * public.technical_history_bucket_seconds(p_granularity)
  )
$$;

create function public.technical_history_schedule_snapshot_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  fingerprint text;
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.interval_minutes is not distinct from old.interval_minutes
     and new.next_run_at is not distinct from old.next_run_at then
    return new;
  end if;

  fingerprint := encode(
    extensions.digest(
      convert_to(
        concat_ws('|', new.source_key::text, new.status::text, new.interval_minutes::text,
          coalesce(to_char(new.next_run_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'NULL')),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.technical_source_schedule_snapshots(
    owner_id, connection_id, source_key, status, interval_minutes,
    next_run_at, observed_at, reconstructed, configuration_fingerprint
  ) values (
    new.owner_id, new.id, new.source_key, new.status, new.interval_minutes,
    new.next_run_at, now(), false, fingerprint
  );
  return new;
end $$;

create trigger technical_source_connections_schedule_snapshot
after insert or update of status, interval_minutes, next_run_at
on public.technical_source_connections
for each row execute function public.technical_history_schedule_snapshot_trigger();

insert into public.technical_source_schedule_snapshots(
  owner_id, connection_id, source_key, status, interval_minutes,
  next_run_at, observed_at, reconstructed, configuration_fingerprint
)
select
  c.owner_id, c.id, c.source_key, c.status, c.interval_minutes,
  c.next_run_at, now(), true,
  encode(
    extensions.digest(
      convert_to(
        concat_ws('|', c.source_key::text, c.status::text, c.interval_minutes::text,
          coalesce(to_char(c.next_run_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'NULL')),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
from public.technical_source_connections c;

create function public.refresh_technical_activity_buckets(
  p_owner uuid,
  p_granularity public.technical_activity_granularity,
  p_time_axis public.technical_activity_time_axis,
  p_from timestamptz,
  p_to timestamptz,
  p_mode public.technical_rollup_calculation_mode default 'RECOMPUTED',
  p_max_buckets integer default 96
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_step integer;
  v_start timestamptz;
  v_ceiling timestamptz;
  v_end timestamptz;
  v_bucket_count integer;
  v_row_count integer;
begin
  if p_owner is null or not exists(select 1 from auth.users where id = p_owner) then
    raise exception 'INVALID_ACTOR' using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_max_buckets not between 1 and 96 then
    raise exception 'INVALID_HISTORY_WINDOW' using errcode = '22023';
  end if;

  v_step := public.technical_history_bucket_seconds(p_granularity);
  v_start := public.technical_history_bucket_start(p_from, p_granularity);
  v_ceiling := public.technical_history_bucket_start(p_to, p_granularity);
  if v_ceiling <= v_start then
    return jsonb_build_object('buckets_processed',0,'rows_written',0,'from',v_start,'to',v_ceiling);
  end if;
  v_end := least(v_ceiling, v_start + make_interval(secs => v_step * p_max_buckets));
  v_bucket_count := floor(extract(epoch from (v_end - v_start)) / v_step)::integer;

  delete from public.technical_activity_buckets b
  where b.owner_id = p_owner
    and b.granularity = p_granularity
    and b.time_axis = p_time_axis
    and b.bucket_start >= v_start
    and b.bucket_start < v_end;

  insert into public.technical_activity_buckets(
    owner_id, granularity, time_axis, bucket_start, bucket_end,
    source_system, signal_type, observation_count, distinct_signal_count,
    current_count, supporting_count, stale_count, conflicting_count,
    calculation_mode, calculated_at
  )
  select
    o.owner_id,
    p_granularity,
    p_time_axis,
    public.technical_history_bucket_start(
      case p_time_axis when 'INGESTION_TIME' then o.received_at else o.effective_at end,
      p_granularity
    ) as bucket_start,
    public.technical_history_bucket_start(
      case p_time_axis when 'INGESTION_TIME' then o.received_at else o.effective_at end,
      p_granularity
    ) + make_interval(secs => v_step) as bucket_end,
    o.source_system,
    s.signal_type,
    count(*)::integer,
    count(distinct o.signal_id)::integer,
    count(*) filter (where o.disposition = 'CURRENT')::integer,
    count(*) filter (where o.disposition = 'SUPPORTING')::integer,
    count(*) filter (where o.disposition = 'STALE')::integer,
    count(*) filter (where o.disposition = 'CONFLICTING')::integer,
    p_mode,
    now()
  from public.technical_signal_observations o
  join public.technical_signals s
    on s.owner_id = o.owner_id and s.id = o.signal_id
  where o.owner_id = p_owner
    and o.source_family <> 'MANUAL_TEST'
    and (case p_time_axis when 'INGESTION_TIME' then o.received_at else o.effective_at end) >= v_start
    and (case p_time_axis when 'INGESTION_TIME' then o.received_at else o.effective_at end) < v_end
  group by o.owner_id, bucket_start, o.source_system, s.signal_type;

  get diagnostics v_row_count = row_count;
  insert into public.technical_history_maintenance_state(owner_id,last_activity_refresh_at)
  values (p_owner,now())
  on conflict (owner_id) do update set last_activity_refresh_at = excluded.last_activity_refresh_at;

  return jsonb_build_object(
    'buckets_processed', v_bucket_count,
    'rows_written', v_row_count,
    'from', v_start,
    'to', v_end
  );
end $$;

create function public.refresh_technical_collection_coverage_buckets(
  p_owner uuid,
  p_granularity public.technical_activity_granularity,
  p_from timestamptz,
  p_to timestamptz,
  p_mode public.technical_rollup_calculation_mode default 'RECOMPUTED',
  p_max_buckets integer default 96
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_step integer;
  v_start timestamptz;
  v_ceiling timestamptz;
  v_end timestamptz;
  v_bucket_count integer;
  v_row_count integer;
begin
  if p_owner is null or not exists(select 1 from auth.users where id = p_owner) then
    raise exception 'INVALID_ACTOR' using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_max_buckets not between 1 and 96 then
    raise exception 'INVALID_HISTORY_WINDOW' using errcode = '22023';
  end if;

  v_step := public.technical_history_bucket_seconds(p_granularity);
  v_start := public.technical_history_bucket_start(p_from, p_granularity);
  v_ceiling := public.technical_history_bucket_start(p_to, p_granularity);
  if v_ceiling <= v_start then
    return jsonb_build_object('buckets_processed',0,'rows_written',0,'from',v_start,'to',v_ceiling);
  end if;
  v_end := least(v_ceiling, v_start + make_interval(secs => v_step * p_max_buckets));
  v_bucket_count := floor(extract(epoch from (v_end - v_start)) / v_step)::integer;

  delete from public.technical_collection_coverage_buckets b
  where b.owner_id = p_owner
    and b.granularity = p_granularity
    and b.bucket_start >= v_start
    and b.bucket_start < v_end;

  with buckets as (
    select
      gs as bucket_start,
      gs + make_interval(secs => v_step) as bucket_end
    from generate_series(
      v_start,
      v_end - make_interval(secs => v_step),
      make_interval(secs => v_step)
    ) gs
  ), matrix as (
    select
      c.owner_id,
      c.id as connection_id,
      c.source_key,
      b.bucket_start,
      b.bucket_end,
      coalesce(ss.status,c.status) as source_status,
      (ss.id is not null) as schedule_known,
      coalesce(ex.expected_runs,0)::integer as expected_runs,
      coalesce(rr.attempted_runs,0)::integer as attempted_runs,
      coalesce(rr.successful_runs,0)::integer as successful_runs,
      coalesce(rr.failed_runs,0)::integer as failed_runs,
      coalesce(rr.running_runs,0)::integer as running_runs,
      coalesce(rr.records_seen,0)::integer as records_seen,
      coalesce(rr.records_mapped,0)::integer as records_mapped,
      rr.last_success_at,
      rr.last_failure_at,
      le.controlled_error_code as last_error_code
    from public.technical_source_connections c
    cross join buckets b
    left join lateral (
      select x.id,x.status,x.interval_minutes,x.next_run_at,x.observed_at
      from public.technical_source_schedule_snapshots x
      where x.owner_id = c.owner_id
        and x.connection_id = c.id
        and x.observed_at < b.bucket_end
      order by x.observed_at desc,x.id desc
      limit 1
    ) ss on true
    left join lateral (
      select count(distinct x.next_run_at)::integer as expected_runs
      from public.technical_source_schedule_snapshots x
      where x.owner_id = c.owner_id
        and x.connection_id = c.id
        and x.status = 'ENABLED'
        and x.next_run_at is not null
        and x.next_run_at >= b.bucket_start
        and x.next_run_at < b.bucket_end
        and x.observed_at <= x.next_run_at
    ) ex on true
    left join lateral (
      select
        count(*)::integer as attempted_runs,
        count(*) filter (where r.status = 'SUCCEEDED')::integer as successful_runs,
        count(*) filter (where r.status = 'FAILED')::integer as failed_runs,
        count(*) filter (where r.status = 'RUNNING')::integer as running_runs,
        coalesce(sum(r.records_seen),0)::integer as records_seen,
        coalesce(sum(r.records_mapped),0)::integer as records_mapped,
        max(r.completed_at) filter (where r.status = 'SUCCEEDED') as last_success_at,
        max(r.completed_at) filter (where r.status = 'FAILED') as last_failure_at
      from public.technical_collection_runs r
      where r.owner_id = c.owner_id
        and r.connection_id = c.id
        and r.started_at >= b.bucket_start
        and r.started_at < b.bucket_end
    ) rr on true
    left join lateral (
      select r.controlled_error_code
      from public.technical_collection_runs r
      where r.owner_id = c.owner_id
        and r.connection_id = c.id
        and r.status = 'FAILED'
        and r.started_at >= b.bucket_start
        and r.started_at < b.bucket_end
      order by r.started_at desc,r.id desc
      limit 1
    ) le on true
    where c.owner_id = p_owner
      and c.source_key <> 'TEST_SYNTHETIC'
  )
  insert into public.technical_collection_coverage_buckets(
    owner_id, connection_id, source_key, granularity, bucket_start, bucket_end,
    source_status, schedule_known, expected_runs, attempted_runs, successful_runs,
    failed_runs, running_runs, records_seen, records_mapped, last_success_at,
    last_failure_at, last_error_code, coverage_status, calculation_mode, calculated_at
  )
  select
    m.owner_id,m.connection_id,m.source_key,p_granularity,m.bucket_start,m.bucket_end,
    m.source_status,m.schedule_known,m.expected_runs,m.attempted_runs,m.successful_runs,
    m.failed_runs,m.running_runs,m.records_seen,m.records_mapped,m.last_success_at,
    m.last_failure_at,m.last_error_code,
    case
      when not m.schedule_known then
        case when m.failed_runs > 0 and m.successful_runs = 0 then 'DEGRADED'::public.technical_coverage_status
             else 'PARTIAL'::public.technical_coverage_status end
      when m.source_status <> 'ENABLED' then 'COMPLETE'::public.technical_coverage_status
      when m.expected_runs > 0 and m.attempted_runs = 0 then 'NO_COVERAGE'::public.technical_coverage_status
      when m.failed_runs > 0 then 'DEGRADED'::public.technical_coverage_status
      when m.running_runs > 0 then 'PARTIAL'::public.technical_coverage_status
      when m.expected_runs > m.successful_runs then 'PARTIAL'::public.technical_coverage_status
      else 'COMPLETE'::public.technical_coverage_status
    end,
    p_mode,
    now()
  from matrix m;

  get diagnostics v_row_count = row_count;
  insert into public.technical_history_maintenance_state(owner_id,last_coverage_refresh_at)
  values (p_owner,now())
  on conflict (owner_id) do update set last_coverage_refresh_at = excluded.last_coverage_refresh_at;

  return jsonb_build_object(
    'buckets_processed', v_bucket_count,
    'rows_written', v_row_count,
    'from', v_start,
    'to', v_end
  );
end $$;

create function public.advance_technical_history_backfill(
  p_owner uuid,
  p_history_kind public.technical_history_kind,
  p_granularity public.technical_activity_granularity,
  p_time_axis public.technical_activity_time_axis default 'INGESTION_TIME',
  p_max_buckets integer default 48
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  st public.technical_history_backfill_state;
  v_lower timestamptz;
  v_cursor timestamptz;
  v_ceiling timestamptz;
  v_end timestamptz;
  v_step integer;
  v_result jsonb;
  v_complete boolean;
begin
  if p_owner is null or not exists(select 1 from auth.users where id = p_owner) then
    raise exception 'INVALID_ACTOR' using errcode = '22023';
  end if;
  if p_max_buckets not between 1 and 96 then
    raise exception 'INVALID_HISTORY_WINDOW' using errcode = '22023';
  end if;

  select * into st
  from public.technical_history_backfill_state
  where owner_id = p_owner
    and history_kind = p_history_kind
    and granularity = p_granularity
    and time_axis = p_time_axis
  for update;

  if not found then
    if p_history_kind = 'ACTIVITY' then
      select min(case p_time_axis when 'INGESTION_TIME' then o.received_at else o.effective_at end)
      into v_lower
      from public.technical_signal_observations o
      where o.owner_id = p_owner and o.source_family <> 'MANUAL_TEST';
    else
      select min(r.started_at) into v_lower
      from public.technical_collection_runs r
      where r.owner_id = p_owner and r.source_key <> 'TEST_SYNTHETIC';
    end if;

    if v_lower is null then
      insert into public.technical_history_backfill_state(
        owner_id,history_kind,granularity,time_axis,lower_bound,cursor_at,complete,completed_at
      ) values (p_owner,p_history_kind,p_granularity,p_time_axis,null,null,true,now())
      returning * into st;
      return jsonb_build_object('complete',true,'empty',true,'buckets_processed',0);
    end if;

    v_lower := public.technical_history_bucket_start(v_lower,p_granularity);
    insert into public.technical_history_backfill_state(
      owner_id,history_kind,granularity,time_axis,lower_bound,cursor_at,complete
    ) values (p_owner,p_history_kind,p_granularity,p_time_axis,v_lower,v_lower,false)
    returning * into st;
  end if;

  if st.complete then
    return jsonb_build_object('complete',true,'empty',false,'buckets_processed',0,'cursor',st.cursor_at);
  end if;

  v_step := public.technical_history_bucket_seconds(p_granularity);
  v_cursor := coalesce(st.cursor_at,st.lower_bound);
  v_ceiling := public.technical_history_bucket_start(now(),p_granularity);
  if v_cursor >= v_ceiling then
    update public.technical_history_backfill_state
    set complete = true, completed_at = now()
    where owner_id=p_owner and history_kind=p_history_kind
      and granularity=p_granularity and time_axis=p_time_axis;
    return jsonb_build_object('complete',true,'empty',false,'buckets_processed',0,'cursor',v_cursor);
  end if;

  v_end := least(v_ceiling, v_cursor + make_interval(secs => v_step * p_max_buckets));
  if p_history_kind = 'ACTIVITY' then
    v_result := public.refresh_technical_activity_buckets(
      p_owner,p_granularity,p_time_axis,v_cursor,v_end,'BACKFILLED',p_max_buckets
    );
  else
    v_result := public.refresh_technical_collection_coverage_buckets(
      p_owner,p_granularity,v_cursor,v_end,'BACKFILLED',p_max_buckets
    );
  end if;
  v_complete := v_end >= v_ceiling;

  update public.technical_history_backfill_state
  set cursor_at = v_end,
      complete = v_complete,
      completed_at = case when v_complete then now() else null end
  where owner_id=p_owner and history_kind=p_history_kind
    and granularity=p_granularity and time_axis=p_time_axis;

  return v_result || jsonb_build_object('complete',v_complete,'cursor',v_end,'empty',false);
end $$;

create function public.claim_technical_history_maintenance(
  p_owner uuid,
  p_now timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  st public.technical_history_maintenance_state;
  phase_to_run integer;
  compact_due boolean;
begin
  if p_owner is null or not exists(select 1 from auth.users where id = p_owner) then
    raise exception 'INVALID_ACTOR' using errcode = '22023';
  end if;

  insert into public.technical_history_maintenance_state(owner_id,next_maintenance_at)
  values (p_owner,p_now)
  on conflict (owner_id) do nothing;

  select * into st
  from public.technical_history_maintenance_state
  where owner_id=p_owner
  for update;

  if st.next_maintenance_at is not null and st.next_maintenance_at > p_now then
    return jsonb_build_object(
      'due',false,
      'wait_seconds',greatest(1,ceil(extract(epoch from (st.next_maintenance_at-p_now)))::integer),
      'backfill_phase',st.backfill_phase,
      'compact_due',false
    );
  end if;

  phase_to_run := st.backfill_phase;
  compact_due := st.last_compaction_at is null or st.last_compaction_at <= p_now - interval '24 hours';
  update public.technical_history_maintenance_state
  set next_maintenance_at = p_now + interval '5 minutes',
      backfill_phase = ((backfill_phase + 1) % 9)::smallint
  where owner_id=p_owner;

  return jsonb_build_object(
    'due',true,
    'wait_seconds',300,
    'backfill_phase',phase_to_run,
    'compact_due',compact_due
  );
end $$;

create function public.compact_technical_history(
  p_owner uuid,
  p_now timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  activity_deleted integer := 0;
  coverage_deleted integer := 0;
  n integer;
begin
  if p_owner is null or not exists(select 1 from auth.users where id = p_owner) then
    raise exception 'INVALID_ACTOR' using errcode = '22023';
  end if;

  delete from public.technical_activity_buckets
  where owner_id=p_owner
    and ((granularity='FIVE_MINUTES' and bucket_end < p_now - interval '14 days')
      or (granularity='HOUR' and bucket_end < p_now - interval '1 year'));
  get diagnostics n = row_count;
  activity_deleted := activity_deleted + n;

  delete from public.technical_collection_coverage_buckets
  where owner_id=p_owner
    and ((granularity='FIVE_MINUTES' and bucket_end < p_now - interval '14 days')
      or (granularity='HOUR' and bucket_end < p_now - interval '1 year'));
  get diagnostics n = row_count;
  coverage_deleted := coverage_deleted + n;

  insert into public.technical_history_maintenance_state(owner_id,last_compaction_at)
  values (p_owner,p_now)
  on conflict (owner_id) do update set last_compaction_at=excluded.last_compaction_at;

  return jsonb_build_object('activity_deleted',activity_deleted,'coverage_deleted',coverage_deleted);
end $$;

revoke all on function public.refresh_technical_activity_buckets(uuid,public.technical_activity_granularity,public.technical_activity_time_axis,timestamptz,timestamptz,public.technical_rollup_calculation_mode,integer) from public,anon,authenticated;
revoke all on function public.refresh_technical_collection_coverage_buckets(uuid,public.technical_activity_granularity,timestamptz,timestamptz,public.technical_rollup_calculation_mode,integer) from public,anon,authenticated;
revoke all on function public.advance_technical_history_backfill(uuid,public.technical_history_kind,public.technical_activity_granularity,public.technical_activity_time_axis,integer) from public,anon,authenticated;
revoke all on function public.claim_technical_history_maintenance(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.compact_technical_history(uuid,timestamptz) from public,anon,authenticated;

grant execute on function public.refresh_technical_activity_buckets(uuid,public.technical_activity_granularity,public.technical_activity_time_axis,timestamptz,timestamptz,public.technical_rollup_calculation_mode,integer) to service_role;
grant execute on function public.refresh_technical_collection_coverage_buckets(uuid,public.technical_activity_granularity,timestamptz,timestamptz,public.technical_rollup_calculation_mode,integer) to service_role;
grant execute on function public.advance_technical_history_backfill(uuid,public.technical_history_kind,public.technical_activity_granularity,public.technical_activity_time_axis,integer) to service_role;
grant execute on function public.claim_technical_history_maintenance(uuid,timestamptz) to service_role;
grant execute on function public.compact_technical_history(uuid,timestamptz) to service_role;

commit;
