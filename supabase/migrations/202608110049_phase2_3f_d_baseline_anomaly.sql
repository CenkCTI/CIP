begin;

do $$ begin
  create type public.technical_analysis_metric as enum (
    'OBSERVATION_COUNT','DISTINCT_SIGNAL_COUNT','CURRENT_COUNT','SUPPORTING_COUNT','STALE_COUNT','CONFLICTING_COUNT'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.technical_baseline_status as enum (
    'INSUFFICIENT_HISTORY','PROVISIONAL','READY','INSUFFICIENT_COVERAGE','NOT_APPLICABLE'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.technical_anomaly_evaluation_state as enum (
    'NORMAL','ANOMALOUS','PROVISIONAL_DEVIATION','SUPPRESSED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.technical_anomaly_direction as enum ('HIGH','LOW','NONE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.technical_anomaly_method as enum (
    'MAD_MODIFIED_Z','IQR_FALLBACK','CONSTANT_BASELINE','NONE'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.technical_anomaly_kind as enum (
    'VOLUME_SPIKE','VOLUME_DROP','DISTINCT_VOLUME_SPIKE','DISTINCT_VOLUME_DROP','STALE_SPIKE','CONFLICTING_SPIKE'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.technical_anomaly_suppression_reason as enum (
    'NO_COLLECTION_OPPORTUNITY','NO_COVERAGE','DEGRADED_COVERAGE','PARTIAL_COVERAGE',
    'MANUAL_RUN_PRESENT','TEST_RUN_PRESENT','INSUFFICIENT_HISTORY','PROVISIONAL_BASELINE',
    'SEMANTIC_VERSION_UNSUPPORTED','UNSUPPORTED_SERIES','INSUFFICIENT_COVERAGE'
  );
exception when duplicate_object then null; end $$;

create table public.technical_analysis_series (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  series_key text not null check (series_key ~ '^[a-f0-9]{64}$'),
  source_key public.technical_source_key not null,
  source_system text not null check (char_length(source_system) between 1 and 200),
  signal_type public.technical_signal_type not null,
  source_class public.technical_source_class not null,
  observation_basis public.technical_observation_basis not null,
  semantic_kind public.technical_semantic_kind not null,
  semantics_version text not null check (char_length(semantics_version) between 1 and 80),
  metric_kind public.technical_analysis_metric not null,
  time_axis public.technical_activity_time_axis not null,
  granularity public.technical_activity_granularity not null,
  engine_version text not null check (engine_version ~ '^[A-Za-z0-9._-]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id),
  unique (owner_id, series_key),
  check (time_axis = 'INGESTION_TIME'),
  check (granularity = 'HOUR')
);
create trigger technical_analysis_series_set_updated_at
before update on public.technical_analysis_series
for each row execute function public.set_updated_at();
create index technical_analysis_series_owner_source_idx
  on public.technical_analysis_series(owner_id, source_key, metric_kind, signal_type);

create table public.technical_baseline_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid not null,
  status public.technical_baseline_status not null,
  as_of timestamptz not null,
  window_start timestamptz,
  window_end timestamptz,
  sample_count integer not null default 0 check (sample_count >= 0 and sample_count <= 64),
  strict_sample_count integer not null default 0 check (strict_sample_count >= 0 and strict_sample_count <= 64),
  provisional_sample_count integer not null default 0 check (provisional_sample_count >= 0 and provisional_sample_count <= 64),
  median_value numeric,
  mad_value numeric,
  scaled_mad numeric,
  q1 numeric,
  q3 numeric,
  p10 numeric,
  p90 numeric,
  minimum_value numeric,
  maximum_value numeric,
  zero_count integer not null default 0 check (zero_count >= 0 and zero_count <= 64),
  method public.technical_anomaly_method not null default 'NONE',
  sample_bucket_starts timestamptz[] not null default '{}',
  input_fingerprint text not null check (input_fingerprint ~ '^[a-f0-9]{64}$'),
  engine_version text not null check (engine_version ~ '^[A-Za-z0-9._-]+$'),
  config_version text not null check (config_version ~ '^[A-Za-z0-9._-]+$'),
  calculated_at timestamptz not null default now(),
  unique (owner_id, id),
  unique (owner_id, series_id),
  foreign key (owner_id, series_id)
    references public.technical_analysis_series(owner_id, id) on delete cascade,
  check (provisional_sample_count <= sample_count),
  check (strict_sample_count <= sample_count),
  check (strict_sample_count + provisional_sample_count = sample_count),
  check ((window_start is null) = (window_end is null)),
  check (window_start is null or window_end > window_start)
);
create index technical_baseline_profiles_owner_status_idx
  on public.technical_baseline_profiles(owner_id, status, calculated_at desc);

create table public.technical_anomaly_evaluations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid not null,
  bucket_start timestamptz not null,
  bucket_end timestamptz not null,
  target_value numeric,
  coverage_status public.technical_coverage_status,
  schedule_known boolean,
  expected_runs integer not null default 0 check (expected_runs >= 0),
  attempted_runs integer not null default 0 check (attempted_runs >= 0),
  successful_runs integer not null default 0 check (successful_runs >= 0),
  failed_runs integer not null default 0 check (failed_runs >= 0),
  running_runs integer not null default 0 check (running_runs >= 0),
  scheduled_run_count integer not null default 0 check (scheduled_run_count >= 0),
  manual_run_count integer not null default 0 check (manual_run_count >= 0),
  test_run_count integer not null default 0 check (test_run_count >= 0),
  baseline_status public.technical_baseline_status not null,
  baseline_sample_count integer not null default 0 check (baseline_sample_count >= 0 and baseline_sample_count <= 64),
  baseline_median numeric,
  baseline_mad numeric,
  baseline_q1 numeric,
  baseline_q3 numeric,
  method public.technical_anomaly_method not null default 'NONE',
  robust_deviation_score numeric,
  absolute_delta numeric,
  relative_delta numeric,
  direction public.technical_anomaly_direction not null default 'NONE',
  state public.technical_anomaly_evaluation_state not null,
  anomaly_kind public.technical_anomaly_kind,
  suppression_reason public.technical_anomaly_suppression_reason,
  semantics_version text not null check (char_length(semantics_version) between 1 and 80),
  engine_version text not null check (engine_version ~ '^[A-Za-z0-9._-]+$'),
  config_version text not null check (config_version ~ '^[A-Za-z0-9._-]+$'),
  baseline_fingerprint text,
  input_fingerprint text not null check (input_fingerprint ~ '^[a-f0-9]{64}$'),
  calculated_at timestamptz not null default now(),
  unique (owner_id, id),
  unique (owner_id, series_id, bucket_start, engine_version),
  foreign key (owner_id, series_id)
    references public.technical_analysis_series(owner_id, id) on delete cascade,
  check (bucket_end > bucket_start),
  check ((state = 'SUPPRESSED') = (suppression_reason is not null)),
  check ((state in ('ANOMALOUS','PROVISIONAL_DEVIATION')) = (anomaly_kind is not null)),
  check (state in ('ANOMALOUS','PROVISIONAL_DEVIATION') or direction = 'NONE' or anomaly_kind is null)
);
create index technical_anomaly_evaluations_owner_time_idx
  on public.technical_anomaly_evaluations(owner_id, bucket_start desc, id desc);
create index technical_anomaly_evaluations_owner_state_idx
  on public.technical_anomaly_evaluations(owner_id, state, bucket_start desc, id desc);
create index technical_anomaly_evaluations_series_time_idx
  on public.technical_anomaly_evaluations(owner_id, series_id, bucket_start desc);

create table public.technical_anomaly_backfill_state (
  owner_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid not null,
  lower_bound timestamptz,
  cursor_at timestamptz,
  complete boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (owner_id, series_id),
  foreign key (owner_id, series_id)
    references public.technical_analysis_series(owner_id, id) on delete cascade,
  check ((complete and completed_at is not null) or (not complete and completed_at is null))
);
create trigger technical_anomaly_backfill_state_set_updated_at
before update on public.technical_anomaly_backfill_state
for each row execute function public.set_updated_at();

create table public.technical_anomaly_maintenance_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  next_maintenance_at timestamptz,
  last_series_refresh_at timestamptz,
  last_evaluation_at timestamptz,
  last_backfill_at timestamptz,
  last_compaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger technical_anomaly_maintenance_state_set_updated_at
before update on public.technical_anomaly_maintenance_state
for each row execute function public.set_updated_at();

alter table public.technical_analysis_series enable row level security;
alter table public.technical_baseline_profiles enable row level security;
alter table public.technical_anomaly_evaluations enable row level security;
alter table public.technical_anomaly_backfill_state enable row level security;
alter table public.technical_anomaly_maintenance_state enable row level security;

revoke all on public.technical_analysis_series,
  public.technical_baseline_profiles,
  public.technical_anomaly_evaluations,
  public.technical_anomaly_backfill_state,
  public.technical_anomaly_maintenance_state
from public, anon, authenticated;

grant select on public.technical_analysis_series,
  public.technical_baseline_profiles,
  public.technical_anomaly_evaluations,
  public.technical_anomaly_backfill_state,
  public.technical_anomaly_maintenance_state
to authenticated;

create policy technical_analysis_series_select_own
on public.technical_analysis_series for select to authenticated
using (owner_id = auth.uid());
create policy technical_baseline_profiles_select_own
on public.technical_baseline_profiles for select to authenticated
using (owner_id = auth.uid());
create policy technical_anomaly_evaluations_select_own
on public.technical_anomaly_evaluations for select to authenticated
using (owner_id = auth.uid());
create policy technical_anomaly_backfill_state_select_own
on public.technical_anomaly_backfill_state for select to authenticated
using (owner_id = auth.uid());
create policy technical_anomaly_maintenance_state_select_own
on public.technical_anomaly_maintenance_state for select to authenticated
using (owner_id = auth.uid());

create function public.technical_analysis_source_key(p_source_system text)
returns public.technical_source_key
language sql immutable strict set search_path = '' as $$
  select case lower(trim(p_source_system))
    when 'cisa-kev' then 'CISA_KEV'::public.technical_source_key
    when 'nvd-cve' then 'NVD_CVE'::public.technical_source_key
    when 'first-epss' then 'FIRST_EPSS'::public.technical_source_key
    when 'threatfox' then 'THREATFOX'::public.technical_source_key
    when 'malwarebazaar' then 'MALWAREBAZAAR'::public.technical_source_key
    else null
  end
$$;

create function public.technical_analysis_metric_floor(p_metric public.technical_analysis_metric)
returns numeric
language sql immutable strict set search_path = '' as $$
  select case p_metric
    when 'OBSERVATION_COUNT' then 10::numeric
    when 'DISTINCT_SIGNAL_COUNT' then 10::numeric
    when 'STALE_COUNT' then 5::numeric
    when 'CONFLICTING_COUNT' then 3::numeric
    else 0::numeric
  end
$$;

create function public.technical_analysis_metric_enabled(p_metric public.technical_analysis_metric)
returns boolean
language sql immutable strict set search_path = '' as $$
  select p_metric in ('OBSERVATION_COUNT','DISTINCT_SIGNAL_COUNT','STALE_COUNT','CONFLICTING_COUNT')
$$;

create function public.refresh_technical_analysis_series(p_owner uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_written integer := 0;
begin
  if p_owner is null or not exists(select 1 from auth.users where id = p_owner) then
    raise exception 'INVALID_ACTOR' using errcode = '22023';
  end if;

  insert into public.technical_analysis_series(
    owner_id,series_key,source_key,source_system,signal_type,
    source_class,observation_basis,semantic_kind,semantics_version,
    metric_kind,time_axis,granularity,engine_version
  )
  select distinct
    b.owner_id,
    encode(
      extensions.digest(
        convert_to(concat_ws('|',
          public.technical_analysis_source_key(b.source_system)::text,
          lower(b.source_system),
          b.signal_type::text,
          m.metric::text,
          'INGESTION_TIME','HOUR',
          d.value->>'sourceClass',d.value->>'observationBasis',d.value->>'semanticKind',d.value->>'semanticsVersion',
          '2.3F-D-v1'
        ),'UTF8'),
        'sha256'
      ),
      'hex'
    ),
    public.technical_analysis_source_key(b.source_system),
    lower(b.source_system),
    b.signal_type,
    (d.value->>'sourceClass')::public.technical_source_class,
    (d.value->>'observationBasis')::public.technical_observation_basis,
    (d.value->>'semanticKind')::public.technical_semantic_kind,
    d.value->>'semanticsVersion',
    m.metric,
    'INGESTION_TIME'::public.technical_activity_time_axis,
    'HOUR'::public.technical_activity_granularity,
    '2.3F-D-v1'
  from public.technical_activity_buckets b
  cross join lateral (select public.technical_source_semantics_defaults(b.source_system) as value) d
  cross join (values
    ('OBSERVATION_COUNT'::public.technical_analysis_metric),
    ('DISTINCT_SIGNAL_COUNT'::public.technical_analysis_metric),
    ('STALE_COUNT'::public.technical_analysis_metric),
    ('CONFLICTING_COUNT'::public.technical_analysis_metric)
  ) m(metric)
  where b.owner_id = p_owner
    and b.granularity = 'HOUR'
    and b.time_axis = 'INGESTION_TIME'
    and public.technical_analysis_source_key(b.source_system) is not null
    and d.value->>'semanticsVersion' = '2.3F-C-v1'
    and d.value->>'sourceClass' <> 'UNKNOWN'
  on conflict (owner_id,series_key) do nothing;
  get diagnostics v_written = row_count;

  insert into public.technical_anomaly_backfill_state(owner_id,series_id,lower_bound,cursor_at,complete)
  select
    s.owner_id,
    s.id,
    greatest(
      coalesce((select min(c.bucket_start) from public.technical_collection_coverage_buckets c
                where c.owner_id=s.owner_id and c.source_key=s.source_key and c.granularity='HOUR'), now()),
      now() - interval '30 days'
    ),
    greatest(
      coalesce((select min(c.bucket_start) from public.technical_collection_coverage_buckets c
                where c.owner_id=s.owner_id and c.source_key=s.source_key and c.granularity='HOUR'), now()),
      now() - interval '30 days'
    ),
    false
  from public.technical_analysis_series s
  where s.owner_id=p_owner
    and not exists(select 1 from public.technical_anomaly_backfill_state x where x.owner_id=s.owner_id and x.series_id=s.id)
  on conflict do nothing;

  insert into public.technical_anomaly_maintenance_state(owner_id,last_series_refresh_at)
  values (p_owner,now())
  on conflict (owner_id) do update set last_series_refresh_at=excluded.last_series_refresh_at;

  return jsonb_build_object('series_created',v_written);
end $$;

create function public.refresh_technical_baseline_profile(
  p_owner uuid,
  p_series_id uuid,
  p_as_of timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.technical_analysis_series;
  v_total integer := 0;
  v_strict integer := 0;
  v_provisional integer := 0;
  v_total_start timestamptz;
  v_strict_start timestamptz;
  v_status public.technical_baseline_status := 'INSUFFICIENT_HISTORY';
  v_sample_count integer := 0;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_median numeric;
  v_mad numeric;
  v_q1 numeric;
  v_q3 numeric;
  v_p10 numeric;
  v_p90 numeric;
  v_min numeric;
  v_max numeric;
  v_zero integer := 0;
  v_samples timestamptz[] := '{}';
  v_fingerprint text;
  v_method public.technical_anomaly_method := 'NONE';
begin
  if p_owner is null or p_series_id is null or p_as_of is null then
    raise exception 'INVALID_BASELINE_REQUEST' using errcode='22023';
  end if;
  select * into s from public.technical_analysis_series
  where owner_id=p_owner and id=p_series_id;
  if not found then raise exception 'ANALYSIS_SERIES_NOT_FOUND' using errcode='P0002'; end if;
  if s.engine_version <> '2.3F-D-v1' or s.semantics_version <> '2.3F-C-v1'
     or s.time_axis <> 'INGESTION_TIME' or s.granularity <> 'HOUR'
     or not public.technical_analysis_metric_enabled(s.metric_kind) then
    raise exception 'UNSUPPORTED_ANALYSIS_SERIES' using errcode='22023';
  end if;

  with eligible as (
    select
      c.bucket_start,
      case s.metric_kind
        when 'OBSERVATION_COUNT' then coalesce(a.observation_count,0)::numeric
        when 'DISTINCT_SIGNAL_COUNT' then coalesce(a.distinct_signal_count,0)::numeric
        when 'STALE_COUNT' then coalesce(a.stale_count,0)::numeric
        when 'CONFLICTING_COUNT' then coalesce(a.conflicting_count,0)::numeric
        else 0::numeric
      end as metric_value,
      (c.schedule_known and rc.scheduled_count > 0) as strict_sample
    from public.technical_collection_coverage_buckets c
    left join public.technical_activity_buckets a
      on a.owner_id=c.owner_id
     and a.granularity='HOUR'
     and a.time_axis='INGESTION_TIME'
     and a.bucket_start=c.bucket_start
     and lower(a.source_system)=lower(s.source_system)
     and a.signal_type=s.signal_type
    cross join lateral (
      select
        count(*) filter (where r.trigger='SCHEDULED')::integer as scheduled_count,
        count(*) filter (where r.trigger='MANUAL')::integer as manual_count,
        count(*) filter (where r.trigger='TEST')::integer as test_count
      from public.technical_collection_runs r
      where r.owner_id=c.owner_id
        and r.source_key=c.source_key
        and r.started_at >= c.bucket_start
        and r.started_at < c.bucket_end
    ) rc
    where c.owner_id=p_owner
      and c.source_key=s.source_key
      and c.granularity='HOUR'
      and c.bucket_start >= p_as_of - interval '30 days'
      and c.bucket_start < p_as_of
      and c.coverage_status='COMPLETE'
      and rc.manual_count=0
      and rc.test_count=0
      and (
        (c.schedule_known and (rc.scheduled_count > 0 or c.expected_runs > 0))
        or
        (not c.schedule_known and rc.scheduled_count > 0 and c.successful_runs > 0)
      )
    order by c.bucket_start desc
    limit 64
  )
  select
    count(*)::integer,
    count(*) filter (where strict_sample)::integer,
    count(*) filter (where not strict_sample)::integer,
    min(bucket_start),
    min(bucket_start) filter (where strict_sample)
  into v_total,v_strict,v_provisional,v_total_start,v_strict_start
  from eligible;

  if v_strict >= 28 and v_strict_start is not null and v_strict_start <= p_as_of - interval '7 days' then
    v_status := 'READY';
  elsif v_total >= 14 and v_total_start is not null and v_total_start <= p_as_of - interval '72 hours' then
    v_status := 'PROVISIONAL';
  else
    v_status := 'INSUFFICIENT_HISTORY';
  end if;

  with eligible as (
    select
      c.bucket_start,
      case s.metric_kind
        when 'OBSERVATION_COUNT' then coalesce(a.observation_count,0)::numeric
        when 'DISTINCT_SIGNAL_COUNT' then coalesce(a.distinct_signal_count,0)::numeric
        when 'STALE_COUNT' then coalesce(a.stale_count,0)::numeric
        when 'CONFLICTING_COUNT' then coalesce(a.conflicting_count,0)::numeric
        else 0::numeric
      end as metric_value,
      (c.schedule_known and rc.scheduled_count > 0) as strict_sample
    from public.technical_collection_coverage_buckets c
    left join public.technical_activity_buckets a
      on a.owner_id=c.owner_id
     and a.granularity='HOUR'
     and a.time_axis='INGESTION_TIME'
     and a.bucket_start=c.bucket_start
     and lower(a.source_system)=lower(s.source_system)
     and a.signal_type=s.signal_type
    cross join lateral (
      select
        count(*) filter (where r.trigger='SCHEDULED')::integer as scheduled_count,
        count(*) filter (where r.trigger='MANUAL')::integer as manual_count,
        count(*) filter (where r.trigger='TEST')::integer as test_count
      from public.technical_collection_runs r
      where r.owner_id=c.owner_id
        and r.source_key=c.source_key
        and r.started_at >= c.bucket_start
        and r.started_at < c.bucket_end
    ) rc
    where c.owner_id=p_owner
      and c.source_key=s.source_key
      and c.granularity='HOUR'
      and c.bucket_start >= p_as_of - interval '30 days'
      and c.bucket_start < p_as_of
      and c.coverage_status='COMPLETE'
      and rc.manual_count=0
      and rc.test_count=0
      and (
        (c.schedule_known and (rc.scheduled_count > 0 or c.expected_runs > 0))
        or
        (not c.schedule_known and rc.scheduled_count > 0 and c.successful_runs > 0)
      )
    order by c.bucket_start desc
    limit 64
  ), basis as (
    select * from eligible
    where v_status <> 'READY' or strict_sample
    order by bucket_start desc
    limit 64
  ), med as (
    select percentile_cont(0.5) within group(order by metric_value)::numeric as median_value
    from basis
  )
  select
    count(*)::integer,
    min(bucket_start),
    max(bucket_start) + interval '1 hour',
    med.median_value,
    percentile_cont(0.5) within group(order by abs(metric_value-med.median_value))::numeric,
    percentile_cont(0.25) within group(order by metric_value)::numeric,
    percentile_cont(0.75) within group(order by metric_value)::numeric,
    percentile_cont(0.10) within group(order by metric_value)::numeric,
    percentile_cont(0.90) within group(order by metric_value)::numeric,
    min(metric_value),
    max(metric_value),
    count(*) filter(where metric_value=0)::integer,
    coalesce(array_agg(bucket_start order by bucket_start),'{}'::timestamptz[])
  into v_sample_count,v_window_start,v_window_end,v_median,v_mad,v_q1,v_q3,v_p10,v_p90,v_min,v_max,v_zero,v_samples
  from basis cross join med
  group by med.median_value;

  if v_sample_count = 0 then
    v_window_start := null; v_window_end := null; v_median := null; v_mad := null;
    v_q1 := null; v_q3 := null; v_p10 := null; v_p90 := null; v_min := null; v_max := null; v_zero := 0; v_samples := '{}';
  elsif coalesce(v_mad,0) > 0 then
    v_method := 'MAD_MODIFIED_Z';
  elsif coalesce(v_q3,0) - coalesce(v_q1,0) > 0 then
    v_method := 'IQR_FALLBACK';
  else
    v_method := 'CONSTANT_BASELINE';
  end if;

  v_fingerprint := encode(extensions.digest(convert_to(concat_ws('|',
    s.series_key,p_as_of::text,v_status::text,v_sample_count::text,
    coalesce(v_median::text,'NULL'),coalesce(v_mad::text,'NULL'),
    coalesce(v_q1::text,'NULL'),coalesce(v_q3::text,'NULL'),
    array_to_string(v_samples,','),'2.3F-D-v1','2.3F-D-config-v1'
  ),'UTF8'),'sha256'),'hex');

  insert into public.technical_baseline_profiles(
    owner_id,series_id,status,as_of,window_start,window_end,sample_count,strict_sample_count,provisional_sample_count,
    median_value,mad_value,scaled_mad,q1,q3,p10,p90,minimum_value,maximum_value,zero_count,method,
    sample_bucket_starts,input_fingerprint,engine_version,config_version,calculated_at
  ) values (
    p_owner,s.id,v_status,p_as_of,v_window_start,v_window_end,v_sample_count,
    case when v_status='READY' then v_sample_count else least(v_strict,v_sample_count) end,
    case when v_status='READY' then 0 else greatest(v_sample_count-least(v_strict,v_sample_count),0) end,
    v_median,v_mad,case when v_mad is null then null else v_mad/0.6745 end,v_q1,v_q3,v_p10,v_p90,v_min,v_max,v_zero,v_method,
    v_samples,v_fingerprint,'2.3F-D-v1','2.3F-D-config-v1',now()
  )
  on conflict (owner_id,series_id) do update set
    status=excluded.status,
    as_of=excluded.as_of,
    window_start=excluded.window_start,
    window_end=excluded.window_end,
    sample_count=excluded.sample_count,
    strict_sample_count=excluded.strict_sample_count,
    provisional_sample_count=excluded.provisional_sample_count,
    median_value=excluded.median_value,
    mad_value=excluded.mad_value,
    scaled_mad=excluded.scaled_mad,
    q1=excluded.q1,
    q3=excluded.q3,
    p10=excluded.p10,
    p90=excluded.p90,
    minimum_value=excluded.minimum_value,
    maximum_value=excluded.maximum_value,
    zero_count=excluded.zero_count,
    method=excluded.method,
    sample_bucket_starts=excluded.sample_bucket_starts,
    input_fingerprint=excluded.input_fingerprint,
    engine_version=excluded.engine_version,
    config_version=excluded.config_version,
    calculated_at=excluded.calculated_at
  where public.technical_baseline_profiles.as_of <= excluded.as_of;

  return jsonb_build_object(
    'status',v_status::text,
    'sampleCount',v_sample_count,
    'strictSampleCount',case when v_status='READY' then v_sample_count else least(v_strict,v_sample_count) end,
    'provisionalSampleCount',case when v_status='READY' then 0 else greatest(v_sample_count-least(v_strict,v_sample_count),0) end,
    'windowStart',v_window_start,
    'windowEnd',v_window_end,
    'median',v_median,
    'mad',v_mad,
    'q1',v_q1,
    'q3',v_q3,
    'p10',v_p10,
    'p90',v_p90,
    'minimum',v_min,
    'maximum',v_max,
    'zeroCount',v_zero,
    'method',v_method::text,
    'sampleBuckets',to_jsonb(v_samples),
    'inputFingerprint',v_fingerprint
  );
end $$;

create function public.evaluate_technical_anomaly_bucket(
  p_owner uuid,
  p_series_id uuid,
  p_bucket_start timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.technical_analysis_series;
  c public.technical_collection_coverage_buckets;
  v_activity public.technical_activity_buckets;
  v_scheduled integer := 0;
  v_manual integer := 0;
  v_test integer := 0;
  v_target numeric;
  v_baseline jsonb;
  v_baseline_status public.technical_baseline_status := 'INSUFFICIENT_HISTORY';
  v_sample_count integer := 0;
  v_median numeric;
  v_mad numeric;
  v_q1 numeric;
  v_q3 numeric;
  v_iqr numeric;
  v_score numeric;
  v_abs_delta numeric;
  v_rel_delta numeric;
  v_floor numeric;
  v_method public.technical_anomaly_method := 'NONE';
  v_direction public.technical_anomaly_direction := 'NONE';
  v_state public.technical_anomaly_evaluation_state := 'SUPPRESSED';
  v_kind public.technical_anomaly_kind;
  v_suppression public.technical_anomaly_suppression_reason;
  v_is_anomaly boolean := false;
  v_relative_ok boolean := true;
  v_fingerprint text;
  v_baseline_fingerprint text;
  v_result_id uuid;
begin
  if p_owner is null or p_series_id is null or p_bucket_start is null then
    raise exception 'INVALID_ANOMALY_REQUEST' using errcode='22023';
  end if;
  if p_bucket_start <> public.technical_history_bucket_start(p_bucket_start,'HOUR') then
    raise exception 'INVALID_ANOMALY_BUCKET' using errcode='22023';
  end if;
  if p_bucket_start + interval '1 hour' > now() - interval '15 minutes' then
    raise exception 'ANOMALY_BUCKET_NOT_SETTLED' using errcode='22023';
  end if;

  select * into s from public.technical_analysis_series
  where owner_id=p_owner and id=p_series_id;
  if not found then raise exception 'ANALYSIS_SERIES_NOT_FOUND' using errcode='P0002'; end if;

  if s.engine_version <> '2.3F-D-v1' or s.semantics_version <> '2.3F-C-v1' then
    v_suppression := 'SEMANTIC_VERSION_UNSUPPORTED';
  elsif s.time_axis <> 'INGESTION_TIME' or s.granularity <> 'HOUR' or not public.technical_analysis_metric_enabled(s.metric_kind) then
    v_suppression := 'UNSUPPORTED_SERIES';
  end if;

  select * into c from public.technical_collection_coverage_buckets x
  where x.owner_id=p_owner and x.source_key=s.source_key and x.granularity='HOUR' and x.bucket_start=p_bucket_start
  order by x.calculated_at desc,x.id desc limit 1;

  select
    count(*) filter(where r.trigger='SCHEDULED')::integer,
    count(*) filter(where r.trigger='MANUAL')::integer,
    count(*) filter(where r.trigger='TEST')::integer
  into v_scheduled,v_manual,v_test
  from public.technical_collection_runs r
  where r.owner_id=p_owner and r.source_key=s.source_key
    and r.started_at >= p_bucket_start and r.started_at < p_bucket_start + interval '1 hour';

  if v_suppression is null then
    if v_manual > 0 then v_suppression := 'MANUAL_RUN_PRESENT';
    elsif v_test > 0 then v_suppression := 'TEST_RUN_PRESENT';
    elsif c.id is null then v_suppression := 'INSUFFICIENT_COVERAGE';
    elsif c.coverage_status='NO_COVERAGE' then v_suppression := 'NO_COVERAGE';
    elsif c.coverage_status='DEGRADED' then v_suppression := 'DEGRADED_COVERAGE';
    elsif c.coverage_status='PARTIAL' then v_suppression := 'PARTIAL_COVERAGE';
    elsif c.coverage_status <> 'COMPLETE' then v_suppression := 'INSUFFICIENT_COVERAGE';
    elsif v_scheduled = 0 and c.expected_runs = 0 then v_suppression := 'NO_COLLECTION_OPPORTUNITY';
    end if;
  end if;

  select * into v_activity from public.technical_activity_buckets a
  where a.owner_id=p_owner
    and a.granularity='HOUR'
    and a.time_axis='INGESTION_TIME'
    and a.bucket_start=p_bucket_start
    and lower(a.source_system)=lower(s.source_system)
    and a.signal_type=s.signal_type
  order by a.calculated_at desc,a.id desc limit 1;

  if v_activity.id is null then
    v_target := case when v_suppression is null then 0::numeric else null end;
  else
    v_target := case s.metric_kind
      when 'OBSERVATION_COUNT' then v_activity.observation_count::numeric
      when 'DISTINCT_SIGNAL_COUNT' then v_activity.distinct_signal_count::numeric
      when 'STALE_COUNT' then v_activity.stale_count::numeric
      when 'CONFLICTING_COUNT' then v_activity.conflicting_count::numeric
      else null
    end;
  end if;

  if v_suppression is null then
    v_baseline := public.refresh_technical_baseline_profile(p_owner,p_series_id,p_bucket_start);
    v_baseline_status := (v_baseline->>'status')::public.technical_baseline_status;
    v_sample_count := coalesce((v_baseline->>'sampleCount')::integer,0);
    v_median := (v_baseline->>'median')::numeric;
    v_mad := (v_baseline->>'mad')::numeric;
    v_q1 := (v_baseline->>'q1')::numeric;
    v_q3 := (v_baseline->>'q3')::numeric;
    v_baseline_fingerprint := v_baseline->>'inputFingerprint';
    v_method := (v_baseline->>'method')::public.technical_anomaly_method;

    if v_baseline_status='INSUFFICIENT_HISTORY' then
      v_suppression := 'INSUFFICIENT_HISTORY';
    elsif v_baseline_status not in ('READY','PROVISIONAL') then
      v_suppression := 'INSUFFICIENT_HISTORY';
    end if;
  end if;

  if v_suppression is null then
    v_abs_delta := v_target - v_median;
    if v_median <> 0 then v_rel_delta := v_abs_delta / abs(v_median); else v_rel_delta := null; end if;
    v_floor := public.technical_analysis_metric_floor(s.metric_kind);
    if s.metric_kind in ('OBSERVATION_COUNT','DISTINCT_SIGNAL_COUNT') and abs(v_median) >= 20 then
      v_relative_ok := v_rel_delta is not null and abs(v_rel_delta) >= 0.35;
    end if;

    if coalesce(v_mad,0) > 0 then
      v_method := 'MAD_MODIFIED_Z';
      v_score := 0.6745 * v_abs_delta / v_mad;
      v_is_anomaly := abs(v_score) > 3.5 and abs(v_abs_delta) >= v_floor and v_relative_ok;
    elsif coalesce(v_q3,0)-coalesce(v_q1,0) > 0 then
      v_method := 'IQR_FALLBACK';
      v_iqr := v_q3-v_q1;
      v_is_anomaly := (
        v_target > v_q3 + 3*v_iqr
        or v_target < greatest(0::numeric,v_q1 - 3*v_iqr)
      ) and abs(v_abs_delta) >= v_floor and v_relative_ok;
    else
      v_method := 'CONSTANT_BASELINE';
      v_is_anomaly := v_target is distinct from v_median and abs(v_abs_delta) >= v_floor and v_relative_ok;
    end if;

    if v_is_anomaly then
      if v_abs_delta > 0 then v_direction := 'HIGH'; else v_direction := 'LOW'; end if;
      if s.metric_kind='OBSERVATION_COUNT' then
        v_kind := case when v_direction='HIGH' then 'VOLUME_SPIKE'::public.technical_anomaly_kind else 'VOLUME_DROP'::public.technical_anomaly_kind end;
      elsif s.metric_kind='DISTINCT_SIGNAL_COUNT' then
        v_kind := case when v_direction='HIGH' then 'DISTINCT_VOLUME_SPIKE'::public.technical_anomaly_kind else 'DISTINCT_VOLUME_DROP'::public.technical_anomaly_kind end;
      elsif s.metric_kind='STALE_COUNT' and v_direction='HIGH' then v_kind := 'STALE_SPIKE';
      elsif s.metric_kind='CONFLICTING_COUNT' and v_direction='HIGH' then v_kind := 'CONFLICTING_SPIKE';
      else
        v_is_anomaly := false;
        v_direction := 'NONE';
      end if;
    end if;

    if v_is_anomaly then
      v_state := case when v_baseline_status='READY' then 'ANOMALOUS'::public.technical_anomaly_evaluation_state else 'PROVISIONAL_DEVIATION'::public.technical_anomaly_evaluation_state end;
    else
      v_state := 'NORMAL';
      v_direction := 'NONE';
      v_kind := null;
    end if;
  else
    v_state := 'SUPPRESSED';
    v_direction := 'NONE';
    v_kind := null;
    if v_baseline_status is null then v_baseline_status := 'INSUFFICIENT_COVERAGE'; end if;
  end if;

  if c.id is null and v_baseline_status='INSUFFICIENT_HISTORY' then
    v_baseline_status := 'INSUFFICIENT_COVERAGE';
  end if;

  v_fingerprint := encode(extensions.digest(convert_to(concat_ws('|',
    s.series_key,p_bucket_start::text,coalesce(v_target::text,'NULL'),
    coalesce(c.coverage_status::text,'NULL'),coalesce(c.schedule_known::text,'NULL'),
    coalesce(c.expected_runs::text,'0'),coalesce(c.attempted_runs::text,'0'),coalesce(c.successful_runs::text,'0'),
    coalesce(c.failed_runs::text,'0'),coalesce(c.running_runs::text,'0'),
    v_scheduled::text,v_manual::text,v_test::text,coalesce(v_baseline_fingerprint,'NULL'),
    coalesce(v_state::text,'NULL'),coalesce(v_suppression::text,'NULL'),'2.3F-D-v1','2.3F-D-config-v1'
  ),'UTF8'),'sha256'),'hex');

  insert into public.technical_anomaly_evaluations(
    owner_id,series_id,bucket_start,bucket_end,target_value,coverage_status,schedule_known,
    expected_runs,attempted_runs,successful_runs,failed_runs,running_runs,
    scheduled_run_count,manual_run_count,test_run_count,
    baseline_status,baseline_sample_count,baseline_median,baseline_mad,baseline_q1,baseline_q3,
    method,robust_deviation_score,absolute_delta,relative_delta,direction,state,anomaly_kind,suppression_reason,
    semantics_version,engine_version,config_version,baseline_fingerprint,input_fingerprint,calculated_at
  ) values (
    p_owner,s.id,p_bucket_start,p_bucket_start+interval '1 hour',v_target,c.coverage_status,c.schedule_known,
    coalesce(c.expected_runs,0),coalesce(c.attempted_runs,0),coalesce(c.successful_runs,0),coalesce(c.failed_runs,0),coalesce(c.running_runs,0),
    v_scheduled,v_manual,v_test,
    v_baseline_status,v_sample_count,v_median,v_mad,v_q1,v_q3,
    v_method,v_score,v_abs_delta,v_rel_delta,v_direction,v_state,v_kind,v_suppression,
    s.semantics_version,'2.3F-D-v1','2.3F-D-config-v1',v_baseline_fingerprint,v_fingerprint,now()
  )
  on conflict (owner_id,series_id,bucket_start,engine_version) do update set
    target_value=excluded.target_value,
    coverage_status=excluded.coverage_status,
    schedule_known=excluded.schedule_known,
    expected_runs=excluded.expected_runs,
    attempted_runs=excluded.attempted_runs,
    successful_runs=excluded.successful_runs,
    failed_runs=excluded.failed_runs,
    running_runs=excluded.running_runs,
    scheduled_run_count=excluded.scheduled_run_count,
    manual_run_count=excluded.manual_run_count,
    test_run_count=excluded.test_run_count,
    baseline_status=excluded.baseline_status,
    baseline_sample_count=excluded.baseline_sample_count,
    baseline_median=excluded.baseline_median,
    baseline_mad=excluded.baseline_mad,
    baseline_q1=excluded.baseline_q1,
    baseline_q3=excluded.baseline_q3,
    method=excluded.method,
    robust_deviation_score=excluded.robust_deviation_score,
    absolute_delta=excluded.absolute_delta,
    relative_delta=excluded.relative_delta,
    direction=excluded.direction,
    state=excluded.state,
    anomaly_kind=excluded.anomaly_kind,
    suppression_reason=excluded.suppression_reason,
    baseline_fingerprint=excluded.baseline_fingerprint,
    input_fingerprint=excluded.input_fingerprint,
    calculated_at=excluded.calculated_at
  returning id into v_result_id;

  return jsonb_build_object(
    'evaluationId',v_result_id,
    'state',v_state::text,
    'direction',v_direction::text,
    'anomalyKind',case when v_kind is null then null else v_kind::text end,
    'suppressionReason',case when v_suppression is null then null else v_suppression::text end,
    'targetValue',v_target,
    'baselineStatus',v_baseline_status::text,
    'baselineSamples',v_sample_count,
    'median',v_median,
    'mad',v_mad,
    'robustDeviationScore',v_score,
    'inputFingerprint',v_fingerprint
  );
end $$;

create function public.advance_technical_anomaly_backfill(
  p_owner uuid,
  p_max_evaluations integer default 12
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  st public.technical_anomaly_backfill_state;
  s public.technical_analysis_series;
  v_next timestamptz;
  v_ceiling timestamptz;
  v_count integer := 0;
  v_complete boolean := false;
begin
  if p_owner is null or p_max_evaluations not between 1 and 50 then
    raise exception 'INVALID_ANOMALY_BACKFILL_REQUEST' using errcode='22023';
  end if;

  select x.* into st
  from public.technical_anomaly_backfill_state x
  where x.owner_id=p_owner and not x.complete
  order by x.updated_at,x.series_id
  limit 1
  for update skip locked;

  if not found then
    return jsonb_build_object('evaluations',0,'complete',true,'seriesId',null);
  end if;

  select * into s from public.technical_analysis_series
  where owner_id=p_owner and id=st.series_id;
  if not found then
    update public.technical_anomaly_backfill_state set complete=true,completed_at=now() where owner_id=p_owner and series_id=st.series_id;
    return jsonb_build_object('evaluations',0,'complete',true,'seriesId',st.series_id);
  end if;

  v_ceiling := public.technical_history_bucket_start(now()-interval '15 minutes','HOUR');

  while v_count < p_max_evaluations loop
    select min(c.bucket_start) into v_next
    from public.technical_collection_coverage_buckets c
    where c.owner_id=p_owner
      and c.source_key=s.source_key
      and c.granularity='HOUR'
      and c.bucket_start >= coalesce(st.cursor_at,st.lower_bound)
      and c.bucket_start < v_ceiling
      and (c.expected_runs > 0 or c.attempted_runs > 0 or c.coverage_status in ('DEGRADED','NO_COVERAGE'));

    if v_next is null then
      v_complete := true;
      exit;
    end if;

    perform public.evaluate_technical_anomaly_bucket(p_owner,s.id,v_next);
    v_count := v_count + 1;
    st.cursor_at := v_next + interval '1 hour';
  end loop;

  if not v_complete and st.cursor_at >= v_ceiling then v_complete := true; end if;

  update public.technical_anomaly_backfill_state
  set cursor_at=coalesce(st.cursor_at,cursor_at),
      complete=v_complete,
      completed_at=case when v_complete then now() else null end
  where owner_id=p_owner and series_id=s.id;

  insert into public.technical_anomaly_maintenance_state(owner_id,last_backfill_at)
  values(p_owner,now())
  on conflict(owner_id) do update set last_backfill_at=excluded.last_backfill_at;

  return jsonb_build_object('evaluations',v_count,'complete',v_complete,'seriesId',s.id,'cursor',st.cursor_at);
end $$;

create function public.claim_technical_anomaly_maintenance(
  p_owner uuid,
  p_now timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  st public.technical_anomaly_maintenance_state;
  v_compact boolean;
begin
  if p_owner is null or not exists(select 1 from auth.users where id=p_owner) then
    raise exception 'INVALID_ACTOR' using errcode='22023';
  end if;

  insert into public.technical_anomaly_maintenance_state(owner_id,next_maintenance_at)
  values(p_owner,p_now)
  on conflict(owner_id) do nothing;

  select * into st from public.technical_anomaly_maintenance_state
  where owner_id=p_owner for update;

  if st.next_maintenance_at is not null and st.next_maintenance_at > p_now then
    return jsonb_build_object(
      'due',false,
      'waitSeconds',greatest(1,ceil(extract(epoch from(st.next_maintenance_at-p_now)))::integer),
      'compactDue',false
    );
  end if;

  v_compact := st.last_compaction_at is null or st.last_compaction_at <= p_now-interval '24 hours';
  update public.technical_anomaly_maintenance_state
  set next_maintenance_at=p_now+interval '5 minutes'
  where owner_id=p_owner;

  return jsonb_build_object('due',true,'waitSeconds',300,'compactDue',v_compact);
end $$;

create function public.compact_technical_analysis(
  p_owner uuid,
  p_now timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_deleted integer := 0;
begin
  if p_owner is null then raise exception 'INVALID_ACTOR' using errcode='22023'; end if;
  delete from public.technical_anomaly_evaluations
  where owner_id=p_owner and bucket_end < p_now-interval '1 year';
  get diagnostics v_deleted=row_count;
  insert into public.technical_anomaly_maintenance_state(owner_id,last_compaction_at)
  values(p_owner,p_now)
  on conflict(owner_id) do update set last_compaction_at=excluded.last_compaction_at;
  return jsonb_build_object('evaluationsDeleted',v_deleted);
end $$;

create function public.maintain_technical_anomalies(
  p_owner uuid,
  p_now timestamptz default now(),
  p_max_recent integer default 20,
  p_max_backfill integer default 12
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_claim jsonb;
  v_series jsonb;
  rec record;
  v_recent integer := 0;
  v_backfill jsonb;
  v_compaction jsonb := jsonb_build_object('evaluationsDeleted',0);
  v_cutoff timestamptz;
begin
  if p_max_recent not between 1 and 50 or p_max_backfill not between 1 and 50 then
    raise exception 'INVALID_ANOMALY_MAINTENANCE_BOUND' using errcode='22023';
  end if;

  v_claim := public.claim_technical_anomaly_maintenance(p_owner,p_now);
  if not coalesce((v_claim->>'due')::boolean,false) then
    return jsonb_build_object(
      'due',false,
      'waitSeconds',coalesce((v_claim->>'waitSeconds')::integer,300),
      'seriesCreated',0,'recentEvaluated',0,'backfillEvaluated',0,'backfillComplete',false,'compacted',false
    );
  end if;

  v_series := public.refresh_technical_analysis_series(p_owner);
  v_cutoff := public.technical_history_bucket_start(p_now-interval '15 minutes','HOUR');

  for rec in
    select s.id as series_id, x.bucket_start
    from public.technical_analysis_series s
    cross join lateral (
      select max(c.bucket_start) as bucket_start
      from public.technical_collection_coverage_buckets c
      where c.owner_id=s.owner_id
        and c.source_key=s.source_key
        and c.granularity='HOUR'
        and c.bucket_start < v_cutoff
        and c.bucket_start >= v_cutoff-interval '6 hours'
        and (c.expected_runs>0 or c.attempted_runs>0 or c.coverage_status in ('DEGRADED','NO_COVERAGE'))
    ) x
    where s.owner_id=p_owner and x.bucket_start is not null
    order by x.bucket_start desc,s.id
    limit p_max_recent
  loop
    perform public.evaluate_technical_anomaly_bucket(p_owner,rec.series_id,rec.bucket_start);
    v_recent := v_recent + 1;
  end loop;

  v_backfill := public.advance_technical_anomaly_backfill(p_owner,p_max_backfill);

  if coalesce((v_claim->>'compactDue')::boolean,false) then
    v_compaction := public.compact_technical_analysis(p_owner,p_now);
  end if;

  insert into public.technical_anomaly_maintenance_state(owner_id,last_evaluation_at)
  values(p_owner,p_now)
  on conflict(owner_id) do update set last_evaluation_at=excluded.last_evaluation_at;

  return jsonb_build_object(
    'due',true,
    'waitSeconds',coalesce((v_claim->>'waitSeconds')::integer,300),
    'seriesCreated',coalesce((v_series->>'series_created')::integer,0),
    'recentEvaluated',v_recent,
    'backfillEvaluated',coalesce((v_backfill->>'evaluations')::integer,0),
    'backfillComplete',coalesce((v_backfill->>'complete')::boolean,false),
    'compacted',coalesce((v_compaction->>'evaluationsDeleted')::integer,0) >= 0 and coalesce((v_claim->>'compactDue')::boolean,false)
  );
end $$;

revoke all on function public.technical_analysis_source_key(text) from public,anon,authenticated;
revoke all on function public.technical_analysis_metric_floor(public.technical_analysis_metric) from public,anon,authenticated;
revoke all on function public.technical_analysis_metric_enabled(public.technical_analysis_metric) from public,anon,authenticated;
revoke all on function public.refresh_technical_analysis_series(uuid) from public,anon,authenticated;
revoke all on function public.refresh_technical_baseline_profile(uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.evaluate_technical_anomaly_bucket(uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.advance_technical_anomaly_backfill(uuid,integer) from public,anon,authenticated;
revoke all on function public.claim_technical_anomaly_maintenance(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.compact_technical_analysis(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.maintain_technical_anomalies(uuid,timestamptz,integer,integer) from public,anon,authenticated;

grant execute on function public.refresh_technical_analysis_series(uuid) to service_role;
grant execute on function public.refresh_technical_baseline_profile(uuid,uuid,timestamptz) to service_role;
grant execute on function public.evaluate_technical_anomaly_bucket(uuid,uuid,timestamptz) to service_role;
grant execute on function public.advance_technical_anomaly_backfill(uuid,integer) to service_role;
grant execute on function public.claim_technical_anomaly_maintenance(uuid,timestamptz) to service_role;
grant execute on function public.compact_technical_analysis(uuid,timestamptz) to service_role;
grant execute on function public.maintain_technical_anomalies(uuid,timestamptz,integer,integer) to service_role;

commit;
