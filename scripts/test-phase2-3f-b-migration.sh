#!/usr/bin/env bash
set -euo pipefail

command -v psql >/dev/null || { echo 'PostgreSQL 16+ psql is required'; exit 2; }
command -v createdb >/dev/null || { echo 'PostgreSQL createdb/dropdb are required'; exit 2; }
major=$(psql --version | sed -E 's/.* ([0-9]+).*/\1/')
(( major >= 16 )) || { echo 'PostgreSQL 16+ is required'; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="citem_phase2_3f_b_$$"
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
  v_connection_id uuid;
  signal_id uuid := '20000000-0000-4000-8000-000000000001';
  base timestamptz := public.technical_history_bucket_start(now() - interval '3 hours','HOUR');
  result jsonb;
  before_count integer;
  after_count integer;
begin
  v_connection_id := public.enable_technical_source(owner_a,'CISA_KEV','{}'::jsonb,60);

  insert into public.technical_signals(
    id,owner_id,signal_type,canonical_key,title,summary,lifecycle,severity,confidence,facts,
    effective_at,first_seen_at,last_seen_at,current_revision_number
  ) values (
    signal_id,owner_a,'IOC_OBSERVATION','indicator:DOMAIN:history-test.example','History test','',
    'ACTIVE','INFO',80,'{}'::jsonb,base + interval '1 minute',base + interval '1 minute',base + interval '4 minutes',1
  );

  insert into public.technical_signal_observations(
    owner_id,signal_id,source_family,source_system,source_record_key,observation_key,
    received_at,effective_at,disposition,source_snapshot,source_fingerprint
  ) values
    (owner_a,signal_id,'FEED','threatfox','history-1',repeat('a',64),base + interval '2 minutes',base + interval '1 minute','CURRENT','{}',repeat('1',64)),
    (owner_a,signal_id,'FEED','threatfox','history-2',repeat('b',64),base + interval '3 minutes',base + interval '2 minutes','SUPPORTING','{}',repeat('2',64)),
    (owner_a,signal_id,'FEED','threatfox','history-3',repeat('c',64),base + interval '4 minutes',base + interval '3 minutes','STALE','{}',repeat('3',64)),
    (owner_a,signal_id,'FEED','threatfox','history-4',repeat('d',64),base + interval '5 minutes',base + interval '4 minutes','CONFLICTING','{}',repeat('4',64));

  result := public.refresh_technical_activity_buckets(owner_a,'HOUR','INGESTION_TIME',base,base + interval '1 hour','RECOMPUTED',24);
  if coalesce((result->>'buckets_processed')::integer,0) <> 1 then raise exception 'activity bucket refresh did not process one bucket'; end if;
  if (select observation_count from public.technical_activity_buckets
      where owner_id=owner_a and granularity='HOUR' and time_axis='INGESTION_TIME'
        and bucket_start=base and source_system='threatfox' and signal_type='IOC_OBSERVATION') <> 4 then
    raise exception 'activity observation count incorrect';
  end if;
  if (select distinct_signal_count from public.technical_activity_buckets
      where owner_id=owner_a and granularity='HOUR' and time_axis='INGESTION_TIME'
        and bucket_start=base and source_system='threatfox' and signal_type='IOC_OBSERVATION') <> 1 then
    raise exception 'distinct signal count incorrect';
  end if;
  if (select current_count + supporting_count + stale_count + conflicting_count
      from public.technical_activity_buckets
      where owner_id=owner_a and granularity='HOUR' and time_axis='INGESTION_TIME'
        and bucket_start=base and source_system='threatfox' and signal_type='IOC_OBSERVATION') <> 4 then
    raise exception 'disposition counts incorrect';
  end if;

  select observation_count into before_count from public.technical_activity_buckets
    where owner_id=owner_a and granularity='HOUR' and time_axis='INGESTION_TIME'
      and bucket_start=base and source_system='threatfox' and signal_type='IOC_OBSERVATION';
  perform public.refresh_technical_activity_buckets(owner_a,'HOUR','INGESTION_TIME',base,base + interval '1 hour','RECOMPUTED',24);
  select observation_count into after_count from public.technical_activity_buckets
    where owner_id=owner_a and granularity='HOUR' and time_axis='INGESTION_TIME'
      and bucket_start=base and source_system='threatfox' and signal_type='IOC_OBSERVATION';
  if before_count <> after_count then raise exception 'activity recomputation is not idempotent'; end if;

  perform public.refresh_technical_activity_buckets(owner_a,'HOUR','SOURCE_EFFECTIVE_TIME',base,base + interval '1 hour','RECOMPUTED',24);
  insert into public.technical_signal_observations(
    owner_id,signal_id,source_family,source_system,source_record_key,observation_key,
    received_at,effective_at,disposition,source_snapshot,source_fingerprint
  ) values (
    owner_a,signal_id,'FEED','threatfox','history-late',repeat('e',64),base + interval '2 hours 30 minutes',base + interval '30 minutes','CURRENT','{}',repeat('5',64)
  );
  perform public.refresh_technical_activity_buckets(owner_a,'HOUR','SOURCE_EFFECTIVE_TIME',base,base + interval '1 hour','RECOMPUTED',24);
  if (select observation_count from public.technical_activity_buckets
      where owner_id=owner_a and granularity='HOUR' and time_axis='SOURCE_EFFECTIVE_TIME'
        and bucket_start=base and source_system='threatfox' and signal_type='IOC_OBSERVATION') <> 5 then
    raise exception 'late effective-time observation did not repair historical bucket';
  end if;

  insert into public.technical_source_schedule_snapshots(
    owner_id,connection_id,source_key,status,interval_minutes,next_run_at,observed_at,reconstructed,configuration_fingerprint
  ) values (
    owner_a,v_connection_id,'CISA_KEV','ENABLED',60,base,base - interval '5 minutes',false,repeat('6',64)
  );

  insert into public.technical_collection_runs(
    owner_id,connection_id,source_key,trigger,status,claimed_cursor,proposed_cursor,
    lease_token_hash,lease_expires_at,started_at,completed_at,records_seen,records_mapped,
    signals_created,observations_created,controlled_error_code,controlled_error_message
  ) values
    (owner_a,v_connection_id,'CISA_KEV','SCHEDULED','SUCCEEDED','{"version":1}','{"version":1}',repeat('7',64),base + interval '10 minutes',base + interval '5 minutes',base + interval '6 minutes',10,10,10,10,null,null),
    (owner_a,v_connection_id,'CISA_KEV','SCHEDULED','FAILED','{"version":1}',null,repeat('8',64),base + interval '45 minutes',base + interval '40 minutes',base + interval '41 minutes',0,0,0,0,'HTTP_TIMEOUT','Synthetic harness timeout.');

  perform public.refresh_technical_collection_coverage_buckets(owner_a,'HOUR',base,base + interval '1 hour','RECOMPUTED',24);
  if (select coverage_status from public.technical_collection_coverage_buckets b
      where b.owner_id=owner_a and b.connection_id=v_connection_id and b.granularity='HOUR' and b.bucket_start=base) <> 'DEGRADED' then
    raise exception 'failed run did not produce degraded coverage';
  end if;
  if (select expected_runs from public.technical_collection_coverage_buckets b
      where b.owner_id=owner_a and b.connection_id=v_connection_id and b.granularity='HOUR' and b.bucket_start=base) <> 1 then
    raise exception 'expected schedule occurrence not counted';
  end if;

  insert into public.technical_source_schedule_snapshots(
    owner_id,connection_id,source_key,status,interval_minutes,next_run_at,observed_at,reconstructed,configuration_fingerprint
  ) values (
    owner_a,v_connection_id,'CISA_KEV','PAUSED',60,null,base + interval '1 hour 1 minute',false,repeat('9',64)
  );
  perform public.refresh_technical_collection_coverage_buckets(owner_a,'HOUR',base + interval '1 hour',base + interval '2 hours','RECOMPUTED',24);
  if (select coverage_status from public.technical_collection_coverage_buckets b
      where b.owner_id=owner_a and b.connection_id=v_connection_id and b.granularity='HOUR' and b.bucket_start=base + interval '1 hour') <> 'COMPLETE' then
    raise exception 'intentional pause was treated as a collection failure';
  end if;

  insert into public.technical_source_schedule_snapshots(
    owner_id,connection_id,source_key,status,interval_minutes,next_run_at,observed_at,reconstructed,configuration_fingerprint
  ) values (
    owner_a,v_connection_id,'CISA_KEV','ENABLED',60,base + interval '2 hours',base + interval '1 hour 55 minutes',false,repeat('0',64)
  );
  perform public.refresh_technical_collection_coverage_buckets(owner_a,'HOUR',base + interval '2 hours',base + interval '3 hours','RECOMPUTED',24);
  if (select coverage_status from public.technical_collection_coverage_buckets b
      where b.owner_id=owner_a and b.connection_id=v_connection_id and b.granularity='HOUR' and b.bucket_start=base + interval '2 hours') <> 'NO_COVERAGE' then
    raise exception 'missing expected run was not marked NO_COVERAGE';
  end if;

  result := public.advance_technical_history_backfill(owner_a,'ACTIVITY','HOUR','INGESTION_TIME',48);
  if not exists(select 1 from public.technical_history_backfill_state where owner_id=owner_a and history_kind='ACTIVITY' and granularity='HOUR' and time_axis='INGESTION_TIME') then
    raise exception 'bounded backfill state missing';
  end if;

  begin
    update public.technical_source_schedule_snapshots
      set interval_minutes=120
      where id=(select id from public.technical_source_schedule_snapshots where owner_id=owner_a order by observed_at,id limit 1);
    raise exception 'schedule snapshot unexpectedly mutable';
  exception when sqlstate '55000' then null;
  end;
end$$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $$begin
  if not exists(select 1 from public.technical_activity_buckets) then raise exception 'owner cannot read own activity buckets'; end if;
  if not exists(select 1 from public.technical_collection_coverage_buckets) then raise exception 'owner cannot read own coverage buckets'; end if;
  begin
    perform public.refresh_technical_activity_buckets(
      '10000000-0000-4000-8000-000000000001','HOUR','INGESTION_TIME',now()-interval '2 hours',now(),'RECOMPUTED',24
    );
    raise exception 'authenticated historical refresh unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.technical_activity_buckets(
      owner_id,granularity,time_axis,bucket_start,bucket_end,source_system,signal_type,
      observation_count,distinct_signal_count,current_count,supporting_count,stale_count,conflicting_count,calculation_mode
    ) values (
      '10000000-0000-4000-8000-000000000001','HOUR','INGESTION_TIME',now()-interval '2 hours',now()-interval '1 hour','forbidden','IOC_OBSERVATION',0,0,0,0,0,0,'LIVE'
    );
    raise exception 'authenticated historical write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end$$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$begin
  if exists(select 1 from public.technical_activity_buckets) then raise exception 'activity RLS leaked owner A'; end if;
  if exists(select 1 from public.technical_collection_coverage_buckets) then raise exception 'coverage RLS leaked owner A'; end if;
  if exists(select 1 from public.technical_source_schedule_snapshots) then raise exception 'schedule history RLS leaked owner A'; end if;
end$$;
reset role;
SQL

echo "Phase 2.3F-B migration harness passed."
