#!/usr/bin/env bash
set -euo pipefail
command -v psql >/dev/null || { echo 'PostgreSQL 16+ psql is required'; exit 2; }
command -v createdb >/dev/null || { echo 'PostgreSQL createdb/dropdb are required'; exit 2; }
major=$(psql --version | sed -E 's/.* ([0-9]+).*/\1/')
(( major >= 16 )) || { echo 'PostgreSQL 16+ is required'; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="citem_phase2_3c_source_pack_$$"
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
insert into auth.users(id) values
('10000000-0000-4000-8000-000000000001'),
('10000000-0000-4000-8000-000000000002');

do $$
declare
  epss_connection uuid;
  threatfox_connection uuid;
  bazaar_connection uuid;
  claim jsonb;
  run_id uuid;
  token text;
  before_cursor jsonb;
begin
  if not exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='technical_source_key' and e.enumlabel='FIRST_EPSS') then raise exception 'FIRST_EPSS enum missing'; end if;
  if not exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='technical_source_key' and e.enumlabel='THREATFOX') then raise exception 'THREATFOX enum missing'; end if;
  if not exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='technical_source_key' and e.enumlabel='MALWAREBAZAAR') then raise exception 'MALWAREBAZAAR enum missing'; end if;

  perform public.technical_source_validate_settings('FIRST_EPSS','{"minimumEpss":0.25}',360);
  perform public.technical_source_validate_settings('THREATFOX','{"lookbackDays":7}',120);
  perform public.technical_source_validate_settings('MALWAREBAZAAR','{}',120);
  perform public.technical_source_validate_cursor('FIRST_EPSS','{"version":1,"lastModified":"Fri, 02 Jan 2099 01:00:00 GMT"}');
  perform public.technical_source_validate_cursor('THREATFOX','{"version":1,"maxProviderId":"999999999999999999999"}');
  perform public.technical_source_validate_cursor('MALWAREBAZAAR','{"version":1,"lastFirstSeen":"2099-01-01T00:00:00Z"}');

  begin perform public.technical_source_validate_settings('FIRST_EPSS','{"minimumEpss":-0.1}',360);raise exception 'invalid EPSS accepted';exception when invalid_parameter_value then null;end;
  begin perform public.technical_source_validate_settings('THREATFOX','{"lookbackDays":0}',120);raise exception 'invalid ThreatFox lookback accepted';exception when invalid_parameter_value then null;end;
  begin perform public.technical_source_validate_settings('MALWAREBAZAAR','{"download":true}',120);raise exception 'MalwareBazaar arbitrary setting accepted';exception when invalid_parameter_value then null;end;
  begin perform public.technical_source_validate_cursor('THREATFOX','{"version":1,"maxProviderId":"1e6"}');raise exception 'invalid ThreatFox cursor accepted';exception when invalid_parameter_value then null;end;

  -- Exercise the source-specific database defaults, not only UI-supplied intervals.
  epss_connection:=public.enable_technical_source('10000000-0000-4000-8000-000000000001','FIRST_EPSS','{"minimumEpss":0.1}');
  threatfox_connection:=public.enable_technical_source('10000000-0000-4000-8000-000000000001','THREATFOX','{"lookbackDays":1}');
  bazaar_connection:=public.enable_technical_source('10000000-0000-4000-8000-000000000001','MALWAREBAZAAR','{}');
  if (select interval_minutes from public.technical_source_connections where id=epss_connection)<>360 then raise exception 'FIRST_EPSS default interval mismatch';end if;
  if (select interval_minutes from public.technical_source_connections where id=threatfox_connection)<>120 then raise exception 'THREATFOX default interval mismatch';end if;
  if (select interval_minutes from public.technical_source_connections where id=bazaar_connection)<>120 then raise exception 'MALWAREBAZAAR default interval mismatch';end if;
  if (select count(*) from public.technical_source_connections where owner_id='10000000-0000-4000-8000-000000000001' and id in(epss_connection,threatfox_connection,bazaar_connection))<>3 then raise exception 'new source enable failed';end if;

  update public.technical_source_connections set last_started_at=now()-interval '1 minute' where id=epss_connection;
  claim:=public.claim_manual_technical_collection('10000000-0000-4000-8000-000000000001',epss_connection,'MANUAL');
  run_id:=(claim->>'run_id')::uuid; token:=claim->>'lease_token'; before_cursor:=claim->'cursor';
  perform public.fail_technical_collection_run(run_id,token,'HTTP_TIMEOUT','Safe timeout','{"recordsSeen":0,"recordsMapped":0,"signalsCreated":0,"observationsCreated":0,"revisionsCreated":0,"duplicateObservations":0,"supportingObservations":0,"staleObservations":0,"conflictingObservations":0,"skippedRecords":0,"failedRecords":1}','[]');
  if (select cursor from public.technical_source_connections where id=epss_connection)<>before_cursor then raise exception 'failed EPSS run advanced cursor';end if;

  update public.technical_source_connections set last_started_at=now()-interval '1 minute' where id=epss_connection;
  claim:=public.claim_manual_technical_collection('10000000-0000-4000-8000-000000000001',epss_connection,'MANUAL');
  run_id:=(claim->>'run_id')::uuid; token:=claim->>'lease_token';
  perform public.complete_technical_collection_run(run_id,token,'{"version":1,"lastModified":"Fri, 02 Jan 2099 01:00:00 GMT"}','{"recordsSeen":1,"recordsMapped":1,"signalsCreated":1,"observationsCreated":1,"revisionsCreated":1,"duplicateObservations":0,"supportingObservations":0,"staleObservations":0,"conflictingObservations":0,"skippedRecords":0,"failedRecords":0}','[]');
  if (select cursor->>'lastModified' from public.technical_source_connections where id=epss_connection)<>'Fri, 02 Jan 2099 01:00:00 GMT' then raise exception 'successful EPSS run did not advance cursor';end if;

  begin perform public.set_technical_source_status('10000000-0000-4000-8000-000000000002',threatfox_connection,'PAUSED');raise exception 'cross-owner source mutation accepted';exception when no_data_found then null;end;
end$$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $$begin
  if (select count(*) from public.technical_source_connections where source_key in('FIRST_EPSS','THREATFOX','MALWAREBAZAAR'))<>3 then raise exception 'owner read failed';end if;
  begin insert into public.technical_source_connections(owner_id,source_key,interval_minutes) values('10000000-0000-4000-8000-000000000001','FIRST_EPSS',360);raise exception 'authenticated insert accepted';exception when insufficient_privilege then null;end;
  if has_column_privilege('authenticated','public.technical_collection_runs','lease_token_hash','SELECT') then raise exception 'lease hash disclosure';end if;
  if has_function_privilege('authenticated','public.enable_technical_source(uuid,public.technical_source_key,jsonb,integer)','EXECUTE') then raise exception 'authenticated source RPC execution accepted';end if;
end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$begin
  if exists(select 1 from public.technical_source_connections where source_key in('FIRST_EPSS','THREATFOX','MALWAREBAZAAR')) then raise exception 'cross-owner RLS failure';end if;
end$$;
reset role;
SQL

echo 'Phase 2.3C source-pack migration harness passed.'
