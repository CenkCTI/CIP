create or replace function public.refresh_technical_baseline_profile(
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

  -- Aggregate queries with a grouped NULL median can produce no row at all for an
  -- empty eligible set, which assigns NULL to every SELECT INTO target. Empty
  -- history is a first-class analytical state, not an exceptional database state.
  v_sample_count := coalesce(v_sample_count,0);
  if v_sample_count = 0 then
    v_window_start := null; v_window_end := null; v_median := null; v_mad := null;
    v_q1 := null; v_q3 := null; v_p10 := null; v_p90 := null; v_min := null; v_max := null;
    v_zero := 0; v_samples := '{}'; v_method := 'NONE';
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

revoke all on function public.refresh_technical_baseline_profile(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.refresh_technical_baseline_profile(uuid,uuid,timestamptz) to service_role;
