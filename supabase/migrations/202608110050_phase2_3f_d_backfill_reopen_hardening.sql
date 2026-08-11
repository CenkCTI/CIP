create or replace function public.refresh_technical_analysis_series(p_owner uuid)
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

  -- Phase 2.3F-B history backfill can reveal older coverage after D has already
  -- marked a series backfill complete. Re-open from the earliest newly eligible
  -- coverage bucket that has no D evaluation instead of silently leaving a hole.
  with bounds as (
    select
      s.owner_id,
      s.id as series_id,
      greatest(
        coalesce(min(c.bucket_start), now()),
        now() - interval '30 days'
      ) as desired_lower_bound
    from public.technical_analysis_series s
    left join public.technical_collection_coverage_buckets c
      on c.owner_id=s.owner_id
     and c.source_key=s.source_key
     and c.granularity='HOUR'
     and c.bucket_start >= now()-interval '30 days'
    where s.owner_id=p_owner
    group by s.owner_id,s.id
  ), desired as (
    select
      b.owner_id,
      b.series_id,
      b.desired_lower_bound,
      coalesce((
        select min(c.bucket_start)
        from public.technical_collection_coverage_buckets c
        where c.owner_id=b.owner_id
          and c.source_key=(select s.source_key from public.technical_analysis_series s where s.owner_id=b.owner_id and s.id=b.series_id)
          and c.granularity='HOUR'
          and c.bucket_start >= b.desired_lower_bound
          and c.bucket_start < public.technical_history_bucket_start(now()-interval '15 minutes','HOUR')
          and (c.expected_runs>0 or c.attempted_runs>0 or c.coverage_status in ('DEGRADED','NO_COVERAGE'))
          and not exists(
            select 1 from public.technical_anomaly_evaluations e
            where e.owner_id=b.owner_id
              and e.series_id=b.series_id
              and e.bucket_start=c.bucket_start
              and e.engine_version='2.3F-D-v1'
          )
      ), b.desired_lower_bound) as desired_cursor,
      exists(
        select 1
        from public.technical_collection_coverage_buckets c
        where c.owner_id=b.owner_id
          and c.source_key=(select s.source_key from public.technical_analysis_series s where s.owner_id=b.owner_id and s.id=b.series_id)
          and c.granularity='HOUR'
          and c.bucket_start >= b.desired_lower_bound
          and c.bucket_start < public.technical_history_bucket_start(now()-interval '15 minutes','HOUR')
          and (c.expected_runs>0 or c.attempted_runs>0 or c.coverage_status in ('DEGRADED','NO_COVERAGE'))
          and not exists(
            select 1 from public.technical_anomaly_evaluations e
            where e.owner_id=b.owner_id
              and e.series_id=b.series_id
              and e.bucket_start=c.bucket_start
              and e.engine_version='2.3F-D-v1'
          )
      ) as has_missing
    from bounds b
  )
  insert into public.technical_anomaly_backfill_state as st(
    owner_id,series_id,lower_bound,cursor_at,complete,completed_at
  )
  select
    d.owner_id,d.series_id,d.desired_lower_bound,d.desired_cursor,false,null
  from desired d
  on conflict(owner_id,series_id) do update set
    lower_bound=least(coalesce(st.lower_bound,excluded.lower_bound),excluded.lower_bound),
    cursor_at=case
      when (select x.has_missing from desired x where x.owner_id=excluded.owner_id and x.series_id=excluded.series_id)
        then least(coalesce(st.cursor_at,excluded.cursor_at),excluded.cursor_at)
      else st.cursor_at
    end,
    complete=case
      when (select x.has_missing from desired x where x.owner_id=excluded.owner_id and x.series_id=excluded.series_id)
        then false
      else st.complete
    end,
    completed_at=case
      when (select x.has_missing from desired x where x.owner_id=excluded.owner_id and x.series_id=excluded.series_id)
        then null
      else st.completed_at
    end;

  insert into public.technical_anomaly_maintenance_state(owner_id,last_series_refresh_at)
  values (p_owner,now())
  on conflict (owner_id) do update set last_series_refresh_at=excluded.last_series_refresh_at;

  return jsonb_build_object('series_created',v_written);
end $$;

revoke all on function public.refresh_technical_analysis_series(uuid) from public,anon,authenticated;
grant execute on function public.refresh_technical_analysis_series(uuid) to service_role;
