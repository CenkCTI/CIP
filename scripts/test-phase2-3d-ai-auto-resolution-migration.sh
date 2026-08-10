#!/usr/bin/env bash
set -euo pipefail
command -v psql >/dev/null || { echo 'PostgreSQL 16+ psql is required'; exit 2; }
command -v createdb >/dev/null || { echo 'PostgreSQL createdb/dropdb are required'; exit 2; }
major=$(psql --version | sed -E 's/.* ([0-9]+).*/\1/')
(( major >= 16 )) || { echo 'PostgreSQL 16+ is required'; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="citem_phase2_3d_ai_$$"
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
('11000000-0000-4000-8000-000000000001'),
('11000000-0000-4000-8000-000000000002');

insert into public.technical_signals(id,owner_id,signal_type,canonical_key,title,summary,lifecycle,severity,confidence,facts,effective_at,first_seen_at,last_seen_at,current_revision_number)
values
('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','MALWARE_ACTIVITY','report:test:ai-malware','AI malware test','','ACTIVE','UNKNOWN',null,'{}','2026-08-09T08:00:00Z','2026-08-09T08:00:00Z','2026-08-09T08:00:00Z',1),
('21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','VULNERABILITY_CHANGE','cve:CVE-2099-99001','Generic product test','','ACTIVE','UNKNOWN',null,'{}','2026-08-09T08:00:01Z','2026-08-09T08:00:01Z','2026-08-09T08:00:01Z',1);

insert into public.technical_signal_observations(id,owner_id,signal_id,source_family,source_system,source_record_key,observation_key,received_at,effective_at,disposition,source_snapshot,source_fingerprint)
values
('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','IOC_PROVIDER','test','ai-malware',repeat('6',64),'2026-08-09T08:01:00Z','2026-08-09T08:00:00Z','CURRENT','{}',repeat('f',64)),
('31000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000002','VULNERABILITY','test','generic-product',repeat('7',64),'2026-08-09T08:01:01Z','2026-08-09T08:00:01Z','CURRENT','{}',repeat('1',64));

insert into public.technical_signal_entity_assertions(id,owner_id,signal_id,source_observation_id,entity_kind,display_value,normalized_value,semantic_role,assertion_basis,indicator_type)
values
('41000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','MALWARE','LummaStealer','lummastealer','RELATED_TO','PROVIDER_ASSERTED',null),
('41000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000002','PRODUCT','Multiple Products','multiple products','AFFECTS','PROVIDER_ASSERTED',null);

do $$
declare malware_entity uuid;other_owner_entity uuid;
begin
  malware_entity:=(public.create_technical_entity('11000000-0000-4000-8000-000000000001','MALWARE','Lumma Stealer',null)->>'entity_id')::uuid;
  perform public.reset_technical_entity_assertion_review('11000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001');
  perform public.ai_resolve_technical_entity_assertion(
    '11000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    malware_entity,
    'nvidia_nim',
    'test-model',
    '{"candidateUnique":true,"candidateStrong":true,"kindMatch":true,"genericLabel":false,"contextConflict":false,"aliasTaught":false}'::jsonb
  );

  if (select basis from public.technical_entity_assertion_resolutions where assertion_id='41000000-0000-4000-8000-000000000001') <> 'AI_VERIFIED' then raise exception 'AI verified basis missing'; end if;
  if (select alias_id from public.technical_entity_assertion_resolutions where assertion_id='41000000-0000-4000-8000-000000000001') is not null then raise exception 'AI auto resolution taught an alias'; end if;
  if exists(select 1 from public.technical_entity_aliases where owner_id='11000000-0000-4000-8000-000000000001') then raise exception 'AI auto resolution created alias row'; end if;
  if not exists(select 1 from public.technical_entity_audit_events where assertion_id='41000000-0000-4000-8000-000000000001' and action='ASSERTION_AI_AUTO_RESOLVED' and details->>'provider'='nvidia_nim' and details->>'model'='test-model' and details->>'confidence'='HIGH') then raise exception 'AI audit metadata missing'; end if;
  if (select display_value from public.technical_signal_entity_assertions where id='41000000-0000-4000-8000-000000000001') <> 'LummaStealer' then raise exception 'source assertion changed'; end if;

  begin
    perform public.ai_resolve_technical_entity_assertion(
      '11000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002',
      (public.create_technical_entity('11000000-0000-4000-8000-000000000001','PRODUCT','Multiple Products',null)->>'entity_id')::uuid,
      'nvidia_nim','test-model','{}'::jsonb
    );
    raise exception 'generic product label auto-resolved';
  exception when invalid_parameter_value then null;
  end;

  other_owner_entity:=(public.create_technical_entity('11000000-0000-4000-8000-000000000002','MALWARE','Lumma Stealer',null)->>'entity_id')::uuid;
  perform public.reset_technical_entity_assertion_review('11000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001');
  begin
    perform public.ai_resolve_technical_entity_assertion('11000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',other_owner_entity,'nvidia_nim','test-model','{}');
    raise exception 'cross-owner entity accepted';
  exception when no_data_found then null;
  end;
end$$;

set role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false);
do $$begin
  if has_function_privilege('authenticated','public.ai_resolve_technical_entity_assertion(uuid,uuid,uuid,text,text,jsonb)','EXECUTE') then raise exception 'authenticated AI trusted RPC execute accepted'; end if;
end$$;
reset role;

do $$begin
  if not has_function_privilege('service_role','public.ai_resolve_technical_entity_assertion(uuid,uuid,uuid,text,text,jsonb)','EXECUTE') then raise exception 'service-role AI trusted RPC execute missing'; end if;
  if not exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='technical_entity_resolution_basis' and e.enumlabel='AI_VERIFIED') then raise exception 'AI_VERIFIED enum missing'; end if;
  if not exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='technical_entity_audit_action' and e.enumlabel='ASSERTION_AI_AUTO_RESOLVED') then raise exception 'AI audit action missing'; end if;
  begin
    update public.technical_entity_audit_events set details='{}' where action='ASSERTION_AI_AUTO_RESOLVED';
    raise exception 'AI audit mutation accepted';
  exception when sqlstate '55000' then null;
  end;
end$$;
SQL

echo 'Phase 2.3D AI auto-resolution migration harness passed.'
