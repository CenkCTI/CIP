#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ! command -v psql >/dev/null; then echo "psql is required" >&2; exit 1; fi
DB_URL="${PHASE23B_DATABASE_URL:-postgres://postgres:postgres@127.0.0.1:5432/postgres}"
DB="cip_phase23b_${RANDOM}_$$"
psql "$DB_URL" -v ON_ERROR_STOP=1 -c "create database $DB" >/dev/null
trap 'psql "$DB_URL" -v ON_ERROR_STOP=1 -c "drop database if exists '$DB' with (force)" >/dev/null' EXIT
BASE_URL="${DB_URL%/*}/$DB"
psql "$BASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;
create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb);
create schema if not exists storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default extensions.gen_random_uuid(),bucket_id text not null,name text not null,owner uuid,created_at timestamptz default now(),updated_at timestamptz default now());
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
create function storage.filename(name text) returns text language sql immutable as $$select nullif(regexp_replace(name,'^.*/','',''),'')$$;
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('sub', current_setting('request.jwt.claim.sub', true))$$;
do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if; end$$;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
SQL
for m in "$ROOT"/supabase/migrations/*.sql; do psql "$BASE_URL" -v ON_ERROR_STOP=1 -f "$m" >/dev/null; done
psql "$BASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
select case when to_regclass('public.technical_signals') is null then 1/0 else 1 end;
select case when coalesce((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='technical_signals'),false) is not true then 1/0 else 1 end;
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$begin begin insert into public.technical_signals(owner_id,signal_type,canonical_key,title,effective_at,first_seen_at,last_seen_at) values('00000000-0000-0000-0000-000000000001','TECHNICAL_REPORT','x:y','x',now(),now(),now()); raise exception 'direct insert allowed'; exception when insufficient_privilege then null; end; end$$;
reset role;
select public.record_technical_signal('00000000-0000-0000-0000-000000000001','{"signal_type":"VULNERABILITY_CHANGE","canonical_key":"cve:CVE-2026-1234","title":"CVE-2026-1234 changed","lifecycle":"ACTIVE","severity":"HIGH","facts":{"cve":"CVE-2026-1234"},"effective_at":"2026-08-05T00:00:00Z"}','{"source_family":"MANUAL_TEST","source_system":"manual","source_record_key":"rec-1","source_url":"https://example.test/Path?Q=A","received_at":"2026-08-05T00:01:00Z","source_snapshot":{"note":"synthetic"}}','[{"entity_kind":"CVE","display_value":"cve-2026-1234","semantic_role":"SUBJECT","assertion_basis":"PROVIDER_ASSERTED"}]');
select case when count(*)<>1 then 1/0 else 1 end from public.technical_signals;
select case when count(*)<>1 then 1/0 else 1 end from public.technical_signal_observations;
select case when count(*)<>1 then 1/0 else 1 end from public.technical_signal_revisions;
select case when count(*)<>1 then 1/0 else 1 end from public.technical_signal_entity_assertions;
select case when (public.record_technical_signal('00000000-0000-0000-0000-000000000001','{"signal_type":"VULNERABILITY_CHANGE","canonical_key":"cve:CVE-2026-1234","title":"CVE-2026-1234 changed","lifecycle":"ACTIVE","severity":"HIGH","facts":{"cve":"CVE-2026-1234"},"effective_at":"2026-08-05T00:00:00Z"}','{"source_family":"MANUAL_TEST","source_system":"manual","source_record_key":"rec-1","source_url":"https://example.test/Path?Q=A","received_at":"2026-08-05T00:01:00Z","source_snapshot":{"note":"synthetic"}}','[]')->>'duplicate_observation')::boolean is not true then 1/0 else 1 end;
select public.record_technical_signal('00000000-0000-0000-0000-000000000001','{"signal_type":"VULNERABILITY_CHANGE","canonical_key":"cve:CVE-2026-1234","title":"CVE-2026-1234 changed","lifecycle":"ACTIVE","severity":"HIGH","facts":{"cve":"CVE-2026-1234"},"effective_at":"2026-08-05T00:00:00Z"}','{"source_family":"MANUAL_TEST","source_system":"manual","source_record_key":"rec-2","received_at":"2026-08-05T00:02:00Z","source_snapshot":{"note":"support"}}','[]');
select case when count(*) filter(where disposition='SUPPORTING')<>1 or (select count(*) from public.technical_signal_revisions)<>1 then 1/0 else 1 end from public.technical_signal_observations;
select public.record_technical_signal('00000000-0000-0000-0000-000000000001','{"signal_type":"VULNERABILITY_CHANGE","canonical_key":"cve:CVE-2026-1234","title":"CVE changed again","lifecycle":"ACTIVE","severity":"CRITICAL","facts":{"cve":"CVE-2026-1234","changed":true},"effective_at":"2026-08-06T00:00:00Z"}','{"source_family":"MANUAL_TEST","source_system":"manual","source_record_key":"rec-3","received_at":"2026-08-06T00:02:00Z","source_snapshot":{"note":"changed"}}','[]');
select case when current_revision_number<>2 or severity<>'CRITICAL' then 1/0 else 1 end from public.technical_signals;
select public.record_technical_signal('00000000-0000-0000-0000-000000000001','{"signal_type":"VULNERABILITY_CHANGE","canonical_key":"cve:CVE-2026-1234","title":"old","lifecycle":"ACTIVE","severity":"LOW","effective_at":"2026-08-01T00:00:00Z"}','{"source_family":"MANUAL_TEST","source_system":"manual","source_record_key":"rec-4","received_at":"2026-08-07T00:02:00Z"}','[]');
select case when count(*) filter(where disposition='STALE')<>1 or (select current_revision_number from public.technical_signals)<>2 then 1/0 else 1 end from public.technical_signal_observations;
select public.record_technical_signal('00000000-0000-0000-0000-000000000001','{"signal_type":"VULNERABILITY_CHANGE","canonical_key":"cve:CVE-2026-1234","title":"conflict","lifecycle":"ACTIVE","severity":"LOW","effective_at":"2026-08-06T00:00:00Z"}','{"source_family":"MANUAL_TEST","source_system":"manual","source_record_key":"rec-5","received_at":"2026-08-07T00:03:00Z"}','[]');
select case when count(*) filter(where disposition='CONFLICTING')<>1 or (select current_revision_number from public.technical_signals)<>2 then 1/0 else 1 end from public.technical_signal_observations;
select public.record_technical_signal('00000000-0000-0000-0000-000000000001','{"signal_type":"VULNERABILITY_CHANGE","canonical_key":"cve:CVE-2026-1234","title":"retracted","lifecycle":"RETRACTED","severity":"UNKNOWN","effective_at":"2026-08-08T00:00:00Z"}','{"source_family":"MANUAL_TEST","source_system":"manual","source_record_key":"rec-6","received_at":"2026-08-08T00:03:00Z"}','[]');
select public.record_technical_signal('00000000-0000-0000-0000-000000000001','{"signal_type":"VULNERABILITY_CHANGE","canonical_key":"cve:CVE-2026-1234","title":"active again","lifecycle":"ACTIVE","severity":"HIGH","effective_at":"2026-08-09T00:00:00Z"}','{"source_family":"MANUAL_TEST","source_system":"manual","source_record_key":"rec-7","received_at":"2026-08-09T00:03:00Z"}','[]');
select case when count(*) filter(where change_kind='RETRACTED')<>1 or count(*) filter(where change_kind='REACTIVATED')<>1 then 1/0 else 1 end from public.technical_signal_revisions;
do $$begin begin update public.technical_signal_revisions set title='bad'; raise exception 'revision update allowed'; exception when others then if sqlerrm='revision update allowed' then raise; end if; end; begin perform public.record_technical_signal('00000000-0000-0000-0000-000000000001','{"signal_type":"TECHNICAL_REPORT","canonical_key":"report:manual:bad","title":"bad","effective_at":"2026-08-05T00:00:00Z"}','{"source_family":"MANUAL_TEST","source_system":"manual","source_record_key":"bad","source_url":"https://user:pass@example.test"}','[]'); raise exception 'credential url accepted'; exception when others then if sqlerrm='credential url accepted' then raise; end if; end; end$$;
SQL
