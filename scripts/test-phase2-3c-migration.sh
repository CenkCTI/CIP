#!/usr/bin/env bash
set -euo pipefail
command -v psql >/dev/null || { echo 'PostgreSQL 16+ psql is required'; exit 2; }
command -v createdb >/dev/null || { echo 'PostgreSQL createdb/dropdb are required'; exit 2; }
major=$(psql --version | sed -E 's/.* ([0-9]+).*/\1/')
(( major >= 16 )) || { echo 'PostgreSQL 16+ is required'; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="citem_phase2_3c_$$"
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
create schema extensions;create extension pgcrypto with schema extensions;create schema auth;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt()returns jsonb language sql stable as $$select '{}'::jsonb$$;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);create function storage.foldername(name text)returns text[] language sql immutable as $$select string_to_array(name,'/')$$;create function storage.filename(name text)returns text language sql immutable as $$select(string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)]$$;
SQL
find "$ROOT/supabase/migrations" -maxdepth 1 -name '*.sql' | sort | while read -r migration; do printf "\\i '%s'\n" "$migration"; done > "$MIGRATIONS_SQL"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$MIGRATIONS_SQL" >/dev/null
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
do $$
declare
  v_connection_id uuid; claim jsonb; v_run_id uuid; token text; before_cursor jsonb; issue_id uuid;
  cisa_connection uuid; synthetic_connection uuid; scheduled_claim jsonb; scheduled_run uuid; scheduled_token text;
  recovered_count integer;
begin
  if to_regclass('public.technical_source_connections') is null or to_regclass('public.technical_collection_runs') is null or to_regclass('public.technical_collection_run_issues') is null or to_regclass('public.technical_source_audit_events') is null then raise exception 'schema missing'; end if;
  if exists(
    select 1 from (values
      ('public.technical_source_connections'::regclass),
      ('public.technical_collection_runs'::regclass),
      ('public.technical_collection_run_issues'::regclass),
      ('public.technical_source_audit_events'::regclass)
    ) as expected(oid)
    where not (select relrowsecurity from pg_class where pg_class.oid=expected.oid)
  ) then raise exception 'RLS missing'; end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='technical_collection_runs_one_active_idx') then raise exception 'active-run uniqueness missing'; end if;
  if has_table_privilege('authenticated','public.technical_source_connections','INSERT') or has_table_privilege('authenticated','public.technical_collection_runs','UPDATE') then raise exception 'direct mutation ACL failure'; end if;
  if has_column_privilege('authenticated','public.technical_collection_runs','lease_token_hash','SELECT') or has_column_privilege('authenticated','public.technical_collection_runs','claimed_cursor','SELECT') then raise exception 'lease/cursor disclosure'; end if;
  if has_function_privilege('authenticated','public.claim_manual_technical_collection(uuid,uuid,public.technical_collection_trigger)','EXECUTE') or not has_function_privilege('service_role','public.claim_manual_technical_collection(uuid,uuid,public.technical_collection_trigger)','EXECUTE') or not has_function_privilege('service_role','public.recover_expired_technical_collection_runs()','EXECUTE') then raise exception 'RPC ACL failure'; end if;

  begin perform public.enable_technical_source('10000000-0000-4000-8000-000000000001','NVD_CVE','{"initialLookbackHours":169}',120);raise exception 'invalid lookback accepted';exception when invalid_parameter_value then null;end;
  begin perform public.enable_technical_source('10000000-0000-4000-8000-000000000001','CISA_KEV','{"endpoint":"https://evil.example"}',360);raise exception 'arbitrary settings accepted';exception when invalid_parameter_value then null;end;
  v_connection_id:=public.enable_technical_source('10000000-0000-4000-8000-000000000001','NVD_CVE','{"initialLookbackHours":24}',120);
  if (select status from public.technical_source_connections where id=v_connection_id)<>'ENABLED' then raise exception 'enable failed'; end if;
  perform public.set_technical_source_status('10000000-0000-4000-8000-000000000001',v_connection_id,'PAUSED');
  perform public.set_technical_source_status('10000000-0000-4000-8000-000000000001',v_connection_id,'ENABLED');
  perform public.update_technical_source_settings('10000000-0000-4000-8000-000000000001',v_connection_id,'{"initialLookbackHours":48}',180);
  claim:=public.claim_manual_technical_collection('10000000-0000-4000-8000-000000000001',v_connection_id,'MANUAL');
  v_run_id:=(claim->>'run_id')::uuid;token:=claim->>'lease_token';before_cursor:=(claim->'cursor');
  if token is null or length(token)<>64 or (select lease_token_hash from public.technical_collection_runs where id=v_run_id)=token then raise exception 'lease storage failure';end if;
  begin perform public.update_technical_source_settings('10000000-0000-4000-8000-000000000001',v_connection_id,'{"initialLookbackHours":72}',240);raise exception 'active-run settings changed';exception when object_not_in_prerequisite_state then null;end;
  begin perform public.claim_manual_technical_collection('10000000-0000-4000-8000-000000000001',v_connection_id,'MANUAL');raise exception 'duplicate active run accepted';exception when object_not_in_prerequisite_state then null;end;
  begin perform public.complete_technical_collection_run(v_run_id,'wrong','{"version":1,"lastModifiedWatermark":"2099-01-01T00:00:00Z"}','{}','[]');raise exception 'wrong token accepted';exception when object_not_in_prerequisite_state then null;end;
  perform public.complete_technical_collection_run(v_run_id,token,'{"version":1,"lastModifiedWatermark":"2099-01-01T00:00:00Z"}','{"recordsSeen":1,"recordsMapped":1,"signalsCreated":1,"observationsCreated":1,"revisionsCreated":1,"duplicateObservations":0,"supportingObservations":0,"staleObservations":0,"conflictingObservations":0,"skippedRecords":0,"failedRecords":0}','[{"kind":"WARNING","code":"TEST_WARNING","message":"Bounded test warning"}]');
  if (select status from public.technical_collection_runs where id=v_run_id)<>'SUCCEEDED' or (select cursor from public.technical_source_connections where id=v_connection_id)=before_cursor then raise exception 'completion/cursor failure';end if;
  select i.id into issue_id from public.technical_collection_run_issues i where i.run_id=v_run_id limit 1;
  begin update public.technical_collection_run_issues set safe_message='changed' where id=issue_id;raise exception 'issue update accepted';exception when object_not_in_prerequisite_state then null;end;
  update public.technical_source_connections set last_started_at=now()-interval '1 minute' where id=v_connection_id;
  claim:=public.claim_manual_technical_collection('10000000-0000-4000-8000-000000000001',v_connection_id,'MANUAL');v_run_id:=(claim->>'run_id')::uuid;token:=claim->>'lease_token';before_cursor:=(select cursor from public.technical_source_connections where id=v_connection_id);
  perform public.fail_technical_collection_run(v_run_id,token,'HTTP_TIMEOUT','Safe timeout','{"recordsSeen":0,"recordsMapped":0,"signalsCreated":0,"observationsCreated":0,"revisionsCreated":0,"duplicateObservations":0,"supportingObservations":0,"staleObservations":0,"conflictingObservations":0,"skippedRecords":0,"failedRecords":1}','[]');
  if (select cursor from public.technical_source_connections where id=v_connection_id)<>before_cursor or (select status from public.technical_collection_runs where id=v_run_id)<>'FAILED' then raise exception 'failure advanced cursor';end if;
  if not exists(select 1 from public.technical_source_audit_events where connection_id=v_connection_id and action='SETTINGS_CHANGED')
     or not exists(select 1 from public.technical_source_audit_events where connection_id=v_connection_id and action='SCHEDULE_CHANGED') then raise exception 'settings/schedule audit missing';end if;

  cisa_connection:=public.enable_technical_source('10000000-0000-4000-8000-000000000001','CISA_KEV','{}',360);
  update public.technical_source_connections set next_run_at=now()-interval '1 minute' where id=cisa_connection;
  select value into scheduled_claim from public.claim_due_technical_collections(1) as due(value) limit 1;
  if scheduled_claim is null or scheduled_claim->>'source_key'<>'CISA_KEV' then raise exception 'scheduled due claim failed';end if;
  scheduled_run:=(scheduled_claim->>'run_id')::uuid; scheduled_token:=scheduled_claim->>'lease_token';
  if (select trigger from public.technical_collection_runs where id=scheduled_run)<>'SCHEDULED' then raise exception 'scheduled trigger missing';end if;
  before_cursor:=(select cursor from public.technical_source_connections where id=cisa_connection);
  update public.technical_collection_runs set lease_expires_at=now()-interval '1 second' where id=scheduled_run;
  recovered_count:=public.recover_expired_technical_collection_runs();
  if recovered_count<1 or (select status from public.technical_collection_runs where id=scheduled_run)<>'FAILED'
     or (select controlled_error_code from public.technical_collection_runs where id=scheduled_run)<>'LEASE_EXPIRED'
     or (select cursor from public.technical_source_connections where id=cisa_connection)<>before_cursor then raise exception 'expired lease recovery failed';end if;
  begin perform public.complete_technical_collection_run(scheduled_run,scheduled_token,'{"version":1}','{}','[]');raise exception 'expired completion accepted';exception when object_not_in_prerequisite_state then null;end;

  update public.technical_source_connections set status='ENABLED',next_run_at=now()+interval '1 hour' where id=cisa_connection;
  if exists(select 1 from public.claim_due_technical_collections(1)) then raise exception 'future source claimed';end if;
  perform public.set_technical_source_status('10000000-0000-4000-8000-000000000001',cisa_connection,'PAUSED');
  if exists(select 1 from public.claim_due_technical_collections(1)) then raise exception 'paused source claimed';end if;
  perform public.set_technical_source_status('10000000-0000-4000-8000-000000000001',cisa_connection,'ARCHIVED');
  if exists(select 1 from public.claim_due_technical_collections(1)) then raise exception 'archived source claimed';end if;
  perform public.set_technical_source_status('10000000-0000-4000-8000-000000000001',cisa_connection,'PAUSED');

  synthetic_connection:=public.enable_technical_source('10000000-0000-4000-8000-000000000001','TEST_SYNTHETIC','{}',0);
  if (select next_run_at from public.technical_source_connections where id=synthetic_connection) is not null then raise exception 'synthetic scheduling enabled';end if;
  if exists(select 1 from public.claim_due_technical_collections(10)) then raise exception 'manual-only source claimed by scheduler';end if;
  claim:=public.claim_manual_technical_collection('10000000-0000-4000-8000-000000000001',synthetic_connection,'TEST');
  perform public.fail_technical_collection_run((claim->>'run_id')::uuid,claim->>'lease_token','COLLECTION_FAILED','Synthetic harness close','{}','[]');

  perform public.set_technical_source_status('10000000-0000-4000-8000-000000000001',v_connection_id,'ARCHIVED');
  begin perform public.claim_manual_technical_collection('10000000-0000-4000-8000-000000000001',v_connection_id,'MANUAL');raise exception 'archived source ran';exception when object_not_in_prerequisite_state then null;end;
  begin perform public.set_technical_source_status('10000000-0000-4000-8000-000000000002',v_connection_id,'PAUSED');raise exception 'cross-owner mutation accepted';exception when no_data_found then null;end;
  if (select count(*) from public.technical_source_audit_events a where a.connection_id=v_connection_id)<5 then raise exception 'audit history missing';end if;
  begin update public.technical_source_audit_events set details='{}' where technical_source_audit_events.connection_id=v_connection_id;raise exception 'audit update accepted';exception when object_not_in_prerequisite_state then null;end;
end$$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $$begin
  if (select count(id) from public.technical_source_connections)<>3 then raise exception 'owner connection read failure';end if;
  if (select count(id) from public.technical_collection_runs)<4 then raise exception 'owner run read failure';end if;
  if (select count(id) from public.technical_collection_run_issues)<1 then raise exception 'owner issue read failure';end if;
  if (select count(id) from public.technical_source_audit_events)<8 then raise exception 'owner audit read failure';end if;
  begin insert into public.technical_source_connections(owner_id,source_key,interval_minutes) values('10000000-0000-4000-8000-000000000001','CISA_KEV',360);raise exception 'authenticated insert accepted';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$begin
  if (select count(id) from public.technical_source_connections)<>0
     or (select count(id) from public.technical_collection_runs)<>0
     or (select count(id) from public.technical_collection_run_issues)<>0
     or (select count(id) from public.technical_source_audit_events)<>0 then raise exception 'cross-owner RLS failure';end if;
end$$;
reset role;
set role anon;
do $$begin
  begin perform count(*) from public.technical_source_connections;raise exception 'anon read accepted';exception when insufficient_privilege then null;end;
end$$;
reset role;
SQL
[[ -f "$ROOT/supabase/migrations/202608060033_phase2_3c_technical_source_collection.sql" ]] || { echo 'Migration 033 missing' >&2; exit 1; }
echo 'Phase 2.3C migration harness passed.'
