#!/usr/bin/env bash
set -euo pipefail

command -v psql >/dev/null || { echo 'PostgreSQL 16+ psql is required'; exit 2; }
command -v createdb >/dev/null || { echo 'PostgreSQL createdb/dropdb are required'; exit 2; }
major=$(psql --version | sed -E 's/.* ([0-9]+).*/\1/')
(( major >= 16 )) || { echo 'PostgreSQL 16+ is required'; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="citem_phase2_3f_d_$$"
MIGRATIONS_SQL=$(mktemp)
chmod 0644 "$MIGRATIONS_SQL"

if [[ "$(id -un)" == "root" ]] && command -v runuser >/dev/null; then
  PSQL=(runuser -u postgres -- psql)
  CREATEDB=(runuser -u postgres -- createdb)
  DROPDB=(runuser -u postgres -- dropdb)
else
  PSQL=(psql)
  CREATEDB=(createdb)
  DROPDB=(dropdb)
fi
trap 'rm -f "$MIGRATIONS_SQL"; "${DROPDB[@]}" --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

"${CREATEDB[@]}" "$DB"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
do $$begin create role authenticated;exception when duplicate_object then null;end$$;
do $$begin create role service_role bypassrls;exception when duplicate_object then null;end$$;
do $$begin create role anon;exception when duplicate_object then null;end$$;
create schema extensions;
create extension pgcrypto with schema extensions;
create schema auth;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt()returns jsonb language sql stable as $$select '{}'::jsonb$$;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
create function storage.foldername(name text)returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
create function storage.filename(name text)returns text language sql immutable as $$select(string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)]$$;
SQL

find "$ROOT/supabase/migrations" -maxdepth 1 -name '*.sql' | sort | while read -r migration; do printf "\\i '%s'\n" "$migration"; done > "$MIGRATIONS_SQL"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$MIGRATIONS_SQL" >/dev/null

"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
insert into auth.users(id) values
('10000000-0000-4000-8000-000000000001'),
('10000000-0000-4000-8000-000000000002');

do $$
declare
  owner_a uuid := '10000000-0000-4000-8000-000000000001';
  connection_id uuid := '11000000-0000-4000-8000-000000000001';
  target timestamptz := public.technical_history_bucket_start(now() - interval '6 hours','HOUR');
  zero_bucket timestamptz;
  degraded_bucket timestamptz;
  b timestamptz;
  v integer;
  i integer;
  v_series_id uuid;
  result jsonb;
  baseline jsonb;
  first_fingerprint text;
  second_fingerprint text;
  before_count integer;
  after_count integer;
begin
  zero_bucket := target + interval '1 hour';
  degraded_bucket := target + interval '2 hours';

  insert into public.technical_source_connections(
    id,owner_id,source_key,status,settings,cursor,cursor_version,interval_minutes,next_run_at
  ) values (
    connection_id,owner_a,'THREATFOX','ENABLED','{}'::jsonb,'{"version":1}'::jsonb,1,60,target + interval '3 hours'
  );

  for i in 1..32 loop
    b := target - make_interval(hours => i * 6);
    v := 100 + ((i % 3) - 1);

    insert into public.technical_collection_coverage_buckets(
      owner_id,connection_id,source_key,granularity,bucket_start,bucket_end,source_status,schedule_known,
      expected_runs,attempted_runs,successful_runs,failed_runs,running_runs,records_seen,records_mapped,
      coverage_status,calculation_mode,calculated_at
    ) values (
      owner_a,connection_id,'THREATFOX','HOUR',b,b+interval '1 hour','ENABLED',true,
      1,1,1,0,0,v,v,'COMPLETE','BACKFILLED',now()
    );

    insert into public.technical_collection_runs(
      owner_id,connection_id,source_key,trigger,status,claimed_cursor,proposed_cursor,lease_token_hash,
      lease_expires_at,started_at,completed_at,records_seen,records_mapped
    ) values (
      owner_a,connection_id,'THREATFOX','SCHEDULED','SUCCEEDED','{"version":1}'::jsonb,'{"version":1}'::jsonb,
      lpad(to_hex(i),64,'0'),b+interval '10 minutes',b+interval '5 minutes',b+interval '6 minutes',v,v
    );

    insert into public.technical_activity_buckets(
      owner_id,granularity,time_axis,bucket_start,bucket_end,source_system,signal_type,
      observation_count,distinct_signal_count,current_count,supporting_count,stale_count,conflicting_count,
      calculation_mode,calculated_at
    ) values (
      owner_a,'HOUR','INGESTION_TIME',b,b+interval '1 hour','threatfox','IOC_OBSERVATION',
      v,v,v,0,0,0,'BACKFILLED',now()
    );
  end loop;

  -- High-volume scheduled target: should be a real deterministic anomaly once the strict baseline is ready.
  insert into public.technical_collection_coverage_buckets(
    owner_id,connection_id,source_key,granularity,bucket_start,bucket_end,source_status,schedule_known,
    expected_runs,attempted_runs,successful_runs,failed_runs,running_runs,records_seen,records_mapped,
    coverage_status,calculation_mode,calculated_at
  ) values (
    owner_a,connection_id,'THREATFOX','HOUR',target,target+interval '1 hour','ENABLED',true,
    1,1,1,0,0,150,150,'COMPLETE','LIVE',now()
  );
  insert into public.technical_collection_runs(
    owner_id,connection_id,source_key,trigger,status,claimed_cursor,proposed_cursor,lease_token_hash,
    lease_expires_at,started_at,completed_at,records_seen,records_mapped
  ) values (
    owner_a,connection_id,'THREATFOX','SCHEDULED','SUCCEEDED','{"version":1}'::jsonb,'{"version":1}'::jsonb,
    repeat('a',64),target+interval '10 minutes',target+interval '5 minutes',target+interval '6 minutes',150,150
  );
  insert into public.technical_activity_buckets(
    owner_id,granularity,time_axis,bucket_start,bucket_end,source_system,signal_type,
    observation_count,distinct_signal_count,current_count,supporting_count,stale_count,conflicting_count,
    calculation_mode,calculated_at
  ) values (
    owner_a,'HOUR','INGESTION_TIME',target,target+interval '1 hour','threatfox','IOC_OBSERVATION',
    150,150,150,0,0,0,'LIVE',now()
  );

  -- COMPLETE scheduled collection with no activity row: this is the only kind of missing row that may become a real zero.
  insert into public.technical_collection_coverage_buckets(
    owner_id,connection_id,source_key,granularity,bucket_start,bucket_end,source_status,schedule_known,
    expected_runs,attempted_runs,successful_runs,failed_runs,running_runs,records_seen,records_mapped,
    coverage_status,calculation_mode,calculated_at
  ) values (
    owner_a,connection_id,'THREATFOX','HOUR',zero_bucket,zero_bucket+interval '1 hour','ENABLED',true,
    1,1,1,0,0,0,0,'COMPLETE','LIVE',now()
  );
  insert into public.technical_collection_runs(
    owner_id,connection_id,source_key,trigger,status,claimed_cursor,proposed_cursor,lease_token_hash,
    lease_expires_at,started_at,completed_at,records_seen,records_mapped
  ) values (
    owner_a,connection_id,'THREATFOX','SCHEDULED','SUCCEEDED','{"version":1}'::jsonb,'{"version":1}'::jsonb,
    repeat('b',64),zero_bucket+interval '10 minutes',zero_bucket+interval '5 minutes',zero_bucket+interval '6 minutes',0,0
  );

  -- Failed provider bucket: must be suppressed as coverage degradation rather than emitted as a volume drop.
  insert into public.technical_collection_coverage_buckets(
    owner_id,connection_id,source_key,granularity,bucket_start,bucket_end,source_status,schedule_known,
    expected_runs,attempted_runs,successful_runs,failed_runs,running_runs,records_seen,records_mapped,
    last_failure_at,last_error_code,coverage_status,calculation_mode,calculated_at
  ) values (
    owner_a,connection_id,'THREATFOX','HOUR',degraded_bucket,degraded_bucket+interval '1 hour','ENABLED',true,
    1,1,0,1,0,0,0,degraded_bucket+interval '6 minutes','SOURCE_NOT_AVAILABLE','DEGRADED','LIVE',now()
  );
  insert into public.technical_collection_runs(
    owner_id,connection_id,source_key,trigger,status,claimed_cursor,proposed_cursor,lease_token_hash,
    lease_expires_at,started_at,completed_at,records_seen,records_mapped,controlled_error_code,controlled_error_message
  ) values (
    owner_a,connection_id,'THREATFOX','SCHEDULED','FAILED','{"version":1}'::jsonb,null,
    repeat('c',64),degraded_bucket+interval '10 minutes',degraded_bucket+interval '5 minutes',degraded_bucket+interval '6 minutes',0,0,
    'SOURCE_NOT_AVAILABLE','Synthetic provider failure.'
  );

  result := public.refresh_technical_analysis_series(owner_a);
  if coalesce((result->>'series_created')::integer,0) <> 4 then
    raise exception 'expected four generic v1 anomaly series';
  end if;

  select s.id into v_series_id
  from public.technical_analysis_series s
  where s.owner_id=owner_a and s.source_key='THREATFOX' and s.signal_type='IOC_OBSERVATION' and s.metric_kind='OBSERVATION_COUNT';
  if v_series_id is null then raise exception 'observation-count series was not created'; end if;
  if not exists(
    select 1 from public.technical_analysis_series s
    where s.id=v_series_id and s.source_class='IOC_SHARING' and s.observation_basis='REPORTED'
      and s.semantic_kind='IOC_REPORT' and s.semantics_version='2.3F-C-v1'
      and s.time_axis='INGESTION_TIME' and s.granularity='HOUR'
  ) then raise exception 'series did not preserve ThreatFox epistemic semantics'; end if;

  baseline := public.refresh_technical_baseline_profile(owner_a,v_series_id,target);
  if baseline->>'status' <> 'READY' then raise exception 'strict baseline did not become READY'; end if;
  if (baseline->>'sampleCount')::integer <> 32 then raise exception 'baseline sample count should be 32'; end if;
  if abs((baseline->>'median')::numeric - 100) > 1 then raise exception 'baseline median unexpected'; end if;
  if coalesce((baseline->>'mad')::numeric,0) <= 0 then raise exception 'baseline MAD should be positive'; end if;

  result := public.evaluate_technical_anomaly_bucket(owner_a,v_series_id,target);
  if result->>'state' <> 'ANOMALOUS' or result->>'anomalyKind' <> 'VOLUME_SPIKE' then
    raise exception 'scheduled high-volume target was not emitted as VOLUME_SPIKE';
  end if;
  select e.input_fingerprint into first_fingerprint from public.technical_anomaly_evaluations e
  where e.owner_id=owner_a and e.series_id=v_series_id and e.bucket_start=target;

  -- Add a manual run to the same target bucket. Re-evaluation must suppress the prior anomaly rather than keep a contaminated conclusion.
  insert into public.technical_collection_runs(
    owner_id,connection_id,source_key,trigger,status,claimed_cursor,proposed_cursor,lease_token_hash,
    lease_expires_at,started_at,completed_at,records_seen,records_mapped
  ) values (
    owner_a,connection_id,'THREATFOX','MANUAL','SUCCEEDED','{"version":1}'::jsonb,'{"version":1}'::jsonb,
    repeat('d',64),target+interval '20 minutes',target+interval '15 minutes',target+interval '16 minutes',390,390
  );
  result := public.evaluate_technical_anomaly_bucket(owner_a,v_series_id,target);
  if result->>'state' <> 'SUPPRESSED' or result->>'suppressionReason' <> 'MANUAL_RUN_PRESENT' then
    raise exception 'manual collection did not suppress anomaly evaluation';
  end if;
  if exists(select 1 from public.technical_anomaly_evaluations e where e.owner_id=owner_a and e.series_id=v_series_id and e.bucket_start=target and e.anomaly_kind is not null) then
    raise exception 'manual-suppressed evaluation retained an anomaly kind';
  end if;
  select e.input_fingerprint into second_fingerprint from public.technical_anomaly_evaluations e
  where e.owner_id=owner_a and e.series_id=v_series_id and e.bucket_start=target;
  if first_fingerprint = second_fingerprint then raise exception 'input fingerprint did not change after manual contamination'; end if;
  if (select count(*) from public.technical_anomaly_evaluations e where e.owner_id=owner_a and e.series_id=v_series_id and e.bucket_start=target) <> 1 then
    raise exception 'recomputation duplicated target evaluation';
  end if;

  result := public.evaluate_technical_anomaly_bucket(owner_a,v_series_id,degraded_bucket);
  if result->>'state' <> 'SUPPRESSED' or result->>'suppressionReason' <> 'DEGRADED_COVERAGE' then
    raise exception 'failed collection was not coverage-suppressed';
  end if;
  if exists(select 1 from public.technical_anomaly_evaluations e where e.owner_id=owner_a and e.series_id=v_series_id and e.bucket_start=degraded_bucket and e.anomaly_kind is not null) then
    raise exception 'degraded collection produced a volume anomaly';
  end if;

  result := public.evaluate_technical_anomaly_bucket(owner_a,v_series_id,zero_bucket);
  if (result->>'targetValue')::numeric <> 0 then raise exception 'valid complete scheduled zero was not represented as zero'; end if;
  if result->>'state' = 'SUPPRESSED' then raise exception 'valid complete scheduled zero was incorrectly suppressed'; end if;

  select e.input_fingerprint into first_fingerprint from public.technical_anomaly_evaluations e
  where e.owner_id=owner_a and e.series_id=v_series_id and e.bucket_start=zero_bucket;
  before_count := (select count(*) from public.technical_anomaly_evaluations e where e.owner_id=owner_a and e.series_id=v_series_id and e.bucket_start=zero_bucket);
  perform public.evaluate_technical_anomaly_bucket(owner_a,v_series_id,zero_bucket);
  after_count := (select count(*) from public.technical_anomaly_evaluations e where e.owner_id=owner_a and e.series_id=v_series_id and e.bucket_start=zero_bucket);
  select e.input_fingerprint into second_fingerprint from public.technical_anomaly_evaluations e
  where e.owner_id=owner_a and e.series_id=v_series_id and e.bucket_start=zero_bucket;
  if before_count <> after_count or first_fingerprint <> second_fingerprint then raise exception 'anomaly recomputation is not idempotent'; end if;

  result := public.advance_technical_anomaly_backfill(owner_a,1);
  if coalesce((result->>'evaluations')::integer,0) > 1 then raise exception 'anomaly backfill exceeded requested bound'; end if;

  begin
    perform public.maintain_technical_anomalies(owner_a,now(),500,12);
    raise exception 'maintenance accepted an unbounded request';
  exception when sqlstate '22023' then null;
  end;
end$$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $$begin
  if not exists(select 1 from public.technical_analysis_series) then raise exception 'owner cannot read own analysis series'; end if;
  if not exists(select 1 from public.technical_anomaly_evaluations) then raise exception 'owner cannot read own anomaly evaluations'; end if;
  begin
    perform public.evaluate_technical_anomaly_bucket(
      '10000000-0000-4000-8000-000000000001',
      (select id from public.technical_analysis_series limit 1),
      public.technical_history_bucket_start(now()-interval '6 hours','HOUR')
    );
    raise exception 'authenticated anomaly evaluation unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.technical_anomaly_maintenance_state(owner_id) values('10000000-0000-4000-8000-000000000001');
    raise exception 'authenticated direct analysis write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end$$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$begin
  if exists(select 1 from public.technical_analysis_series) then raise exception 'analysis series RLS leaked owner A'; end if;
  if exists(select 1 from public.technical_baseline_profiles) then raise exception 'baseline RLS leaked owner A'; end if;
  if exists(select 1 from public.technical_anomaly_evaluations) then raise exception 'evaluation RLS leaked owner A'; end if;
  if exists(select 1 from public.technical_anomaly_backfill_state) then raise exception 'backfill RLS leaked owner A'; end if;
end$$;
reset role;
SQL

echo "Phase 2.3F-D migration harness passed."
