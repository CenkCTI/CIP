#!/usr/bin/env bash
set -euo pipefail
command -v psql >/dev/null || { echo 'PostgreSQL 16+ psql is required'; exit 2; }
command -v createdb >/dev/null || { echo 'PostgreSQL createdb/dropdb are required'; exit 2; }
major=$(psql --version | sed -E 's/.* ([0-9]+).*/\1/')
(( major >= 16 )) || { echo 'PostgreSQL 16+ is required'; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="citem_phase2_3b_$$"
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
do $$declare r jsonb; sid uuid; oid uuid;begin
 if has_table_privilege('authenticated','public.technical_signals','INSERT') or has_function_privilege('authenticated','public.record_technical_signal(uuid,jsonb,jsonb,jsonb)','EXECUTE') or not has_function_privilege('service_role','public.record_technical_signal(uuid,jsonb,jsonb,jsonb)','EXECUTE') then raise exception 'ACL failure';end if;
 r:=public.record_technical_signal('10000000-0000-4000-8000-000000000001','{"signalType":"VULNERABILITY_CHANGE","canonicalKey":"cve:CVE-2026-1234","title":"Initial","summary":"","lifecycle":"ACTIVE","severity":"HIGH","confidence":80,"facts":{"state":"one"},"publishedAt":null,"observedAt":null,"effectiveAt":"2026-08-05T10:00:00Z"}','{"sourceFamily":"MANUAL_TEST","sourceSystem":"synthetic","sourceRecordKey":"one","sourceRevisionKey":"1","sourceUrl":"https://example.test/Case?Q=UP","sourceTitle":null,"sourcePublishedAt":null,"sourceModifiedAt":null,"sourceObservedAt":null,"receivedAt":"2026-08-05T10:01:00Z","effectiveAt":"2026-08-05T10:00:00Z","sourceSnapshot":{"v":1}}','[{"entityKind":"CVE","displayValue":"CVE-2026-1234","normalizedValue":"CVE-2026-1234","semanticRole":"SUBJECT","assertionBasis":"PROVIDER_ASSERTED","confidence":90}]');
 sid:=(r->>'signal_id')::uuid;oid:=(r->>'observation_id')::uuid;if not (r->>'signal_created')::boolean or (select count(*) from public.technical_signal_revisions where signal_id=sid)<>1 then raise exception 'creation failure';end if;
 r:=public.record_technical_signal('10000000-0000-4000-8000-000000000001','{"signalType":"VULNERABILITY_CHANGE","canonicalKey":"cve:CVE-2026-1234","title":"Initial","summary":"","lifecycle":"ACTIVE","severity":"HIGH","confidence":80,"facts":{"state":"one"},"publishedAt":null,"observedAt":null,"effectiveAt":"2026-08-05T10:00:00Z"}','{"sourceFamily":"MANUAL_TEST","sourceSystem":"synthetic","sourceRecordKey":"one","sourceRevisionKey":"1","sourceUrl":"https://example.test/Case?Q=UP","sourceTitle":null,"sourcePublishedAt":null,"sourceModifiedAt":null,"sourceObservedAt":null,"receivedAt":"2026-08-05T10:01:00Z","effectiveAt":"2026-08-05T10:00:00Z","sourceSnapshot":{"v":1}}','[]');if not (r->>'duplicate_observation')::boolean or (select count(*) from public.technical_signal_observations where signal_id=sid)<>1 then raise exception 'idempotency failure';end if;
 r:=public.record_technical_signal('10000000-0000-4000-8000-000000000001','{"signalType":"VULNERABILITY_CHANGE","canonicalKey":"cve:CVE-2026-1234","title":"Initial","summary":"","lifecycle":"ACTIVE","severity":"HIGH","confidence":80,"facts":{"state":"one"},"publishedAt":null,"observedAt":null,"effectiveAt":"2026-08-05T11:00:00Z"}','{"sourceFamily":"OTHER","sourceSystem":"second","sourceRecordKey":"two","receivedAt":"2026-08-05T11:01:00Z","effectiveAt":"2026-08-05T11:00:00Z","sourceSnapshot":{"v":1}}','[]');if r->>'disposition'<>'SUPPORTING' then raise exception 'support failure';end if;
 r:=public.record_technical_signal('10000000-0000-4000-8000-000000000001','{"signalType":"VULNERABILITY_CHANGE","canonicalKey":"cve:CVE-2026-1234","title":"Changed","summary":"","lifecycle":"RETRACTED","severity":"CRITICAL","confidence":90,"facts":{"state":"two"},"publishedAt":null,"observedAt":null,"effectiveAt":"2026-08-05T12:00:00Z"}','{"sourceFamily":"OTHER","sourceSystem":"second","sourceRecordKey":"three","receivedAt":"2026-08-05T12:01:00Z","effectiveAt":"2026-08-05T12:00:00Z","sourceSnapshot":{"v":2}}','[]');if r->>'disposition'<>'CURRENT' or (select current_revision_number from public.technical_signals where id=sid)<>2 then raise exception 'change failure';end if;
 r:=public.record_technical_signal('10000000-0000-4000-8000-000000000001','{"signalType":"VULNERABILITY_CHANGE","canonicalKey":"cve:CVE-2026-1234","title":"Old","summary":"","lifecycle":"ACTIVE","severity":"LOW","confidence":10,"facts":{"state":"old"},"publishedAt":null,"observedAt":null,"effectiveAt":"2026-08-05T09:00:00Z"}','{"sourceFamily":"OTHER","sourceSystem":"late","sourceRecordKey":"old","receivedAt":"2026-08-05T13:00:00Z","effectiveAt":"2026-08-05T09:00:00Z","sourceSnapshot":{"v":0}}','[]');if r->>'disposition'<>'STALE' then raise exception 'stale failure';end if;
 begin update public.technical_signal_observations set source_title='x' where id=oid;raise exception 'append update accepted';exception when object_not_in_prerequisite_state then null;end;
 begin perform public.record_technical_signal('10000000-0000-4000-8000-000000000001','{"signalType":"TECHNICAL_REPORT","canonicalKey":"bad","title":"Atomic","summary":"","lifecycle":"ACTIVE","severity":"INFO","confidence":null,"facts":{},"effectiveAt":"2026-08-06T00:00:00Z"}','{"sourceFamily":"MANUAL_TEST","sourceSystem":"synthetic","sourceRecordKey":"atomic","receivedAt":"2026-08-06T00:00:01Z","effectiveAt":"2026-08-06T00:00:00Z","sourceSnapshot":{}}','[{"entityKind":"TAG","displayValue":"x","normalizedValue":"x","semanticRole":"MENTIONS","assertionBasis":"AI_SUGGESTED"}]');raise exception 'reserved assertion accepted';exception when invalid_parameter_value then null;end;
 if exists(select 1 from public.technical_signals where canonical_key='bad') then raise exception 'atomic rollback failed';end if;
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);set local role authenticated;if exists(select 1 from public.technical_signals where id=sid) then raise exception 'cross-owner RLS failure';end if;reset role;
end$$;
SQL
echo 'Phase 2.3B PostgreSQL migration harness passed'
