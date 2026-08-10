#!/usr/bin/env bash
set -euo pipefail
command -v psql >/dev/null || { echo 'PostgreSQL 16+ psql is required'; exit 2; }
command -v createdb >/dev/null || { echo 'PostgreSQL createdb/dropdb are required'; exit 2; }
major=$(psql --version | sed -E 's/.* ([0-9]+).*/\1/')
(( major >= 16 )) || { echo 'PostgreSQL 16+ is required'; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="citem_phase2_3d_ai_bootstrap_$$"
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
('12000000-0000-4000-8000-000000000001'),
('12000000-0000-4000-8000-000000000002');

insert into public.technical_signals(id,owner_id,signal_type,canonical_key,title,summary,lifecycle,severity,confidence,facts,effective_at,first_seen_at,last_seen_at,current_revision_number)
values
('22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','VULNERABILITY_CHANGE','cve:CVE-2099-99101','Google Chromium vulnerability','','ACTIVE','HIGH',null,'{}','2026-08-09T09:00:00Z','2026-08-09T09:00:00Z','2026-08-09T09:00:00Z',1),
('22000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001','VULNERABILITY_CHANGE','cve:CVE-2099-99102','Generic product vulnerability','','ACTIVE','HIGH',null,'{}','2026-08-09T09:00:01Z','2026-08-09T09:00:01Z','2026-08-09T09:00:01Z',1),
('22000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000001','VULNERABILITY_CHANGE','cve:CVE-2099-99103','Second Google vulnerability','','ACTIVE','HIGH',null,'{}','2026-08-09T09:00:02Z','2026-08-09T09:00:02Z','2026-08-09T09:00:02Z',1);

insert into public.technical_signal_observations(id,owner_id,signal_id,source_family,source_system,source_record_key,observation_key,received_at,effective_at,disposition,source_snapshot,source_fingerprint)
values
('32000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','VULNERABILITY','cisa-kev','google-1',repeat('8',64),'2026-08-09T09:01:00Z','2026-08-09T09:00:00Z','CURRENT','{}',repeat('8',64)),
('32000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002','VULNERABILITY','cisa-kev','generic-1',repeat('9',64),'2026-08-09T09:01:01Z','2026-08-09T09:00:01Z','CURRENT','{}',repeat('9',64)),
('32000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000003','VULNERABILITY','cisa-kev','google-2',repeat('a',64),'2026-08-09T09:01:02Z','2026-08-09T09:00:02Z','CURRENT','{}',repeat('a',64));

insert into public.technical_signal_entity_assertions(id,owner_id,signal_id,source_observation_id,entity_kind,display_value,normalized_value,semantic_role,assertion_basis,indicator_type)
values
('42000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','VENDOR','Google','google','AFFECTS','PROVIDER_ASSERTED',null),
('42000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000002','PRODUCT','Multiple Products','multiple products','AFFECTS','PROVIDER_ASSERTED',null),
('42000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000003','32000000-0000-4000-8000-000000000003','VENDOR','Google','google','AFFECTS','PROVIDER_ASSERTED',null);

do $$
declare result jsonb;google_entity uuid;
begin
  result:=public.ai_create_technical_entity_from_assertion(
    '12000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000001',
    'Google',
    'nvidia_nim',
    'test-model',
    '{"noExistingStrongCandidate":true,"canonicalNameEquivalent":true,"kindMatch":true,"genericLabel":false,"contextConflict":false,"contextVerified":true,"aliasTaught":false}'::jsonb
  );
  google_entity:=(result->>'entity_id')::uuid;

  if (select origin from public.technical_entities where id=google_entity)<>'AI_VERIFIED' then raise exception 'AI entity origin missing'; end if;
  if (select basis from public.technical_entity_assertion_resolutions where assertion_id='42000000-0000-4000-8000-000000000001')<>'AI_VERIFIED' then raise exception 'AI resolution basis missing'; end if;
  if exists(select 1 from public.technical_entity_aliases where owner_id='12000000-0000-4000-8000-000000000001') then raise exception 'AI canonical bootstrap created an alias'; end if;
  if not exists(select 1 from public.technical_entity_audit_events where entity_id=google_entity and action='ENTITY_AI_AUTO_CREATED' and details->>'provider'='nvidia_nim' and details->>'model'='test-model') then raise exception 'AI entity creation audit missing'; end if;
  if not exists(select 1 from public.technical_entity_audit_events where assertion_id='42000000-0000-4000-8000-000000000001' and action='ASSERTION_AI_AUTO_RESOLVED') then raise exception 'AI assertion audit missing'; end if;
  if (select display_value from public.technical_signal_entity_assertions where id='42000000-0000-4000-8000-000000000001')<>'Google' then raise exception 'source assertion mutated'; end if;

  -- Remaining same-label occurrences link to the bootstrapped entity rather than creating another one.
  perform public.ai_resolve_technical_entity_assertion(
    '12000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000003',google_entity,
    'nvidia_nim','test-model','{"aliasTaught":false}'::jsonb
  );
  if (select entity_id from public.technical_entity_assertion_resolutions where assertion_id='42000000-0000-4000-8000-000000000003')<>google_entity then raise exception 'group follow-up did not reuse AI entity'; end if;

  begin
    perform public.ai_create_technical_entity_from_assertion(
      '12000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000002','Multiple Products',
      'nvidia_nim','test-model','{"contextVerified":true}'::jsonb
    );
    raise exception 'generic label AI-created';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.reset_technical_entity_assertion_review('12000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000003');
    perform public.ai_create_technical_entity_from_assertion(
      '12000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000003','Alphabet Google Cloud',
      'nvidia_nim','test-model','{"contextVerified":true}'::jsonb
    );
    raise exception 'materially different AI canonical name accepted';
  exception when invalid_parameter_value then null;
  end;

  -- Exact/compact-equivalent duplicate creation fails closed even after reset.
  begin
    perform public.ai_create_technical_entity_from_assertion(
      '12000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000003','Google',
      'nvidia_nim','test-model','{"contextVerified":true}'::jsonb
    );
    raise exception 'duplicate AI canonical identity accepted';
  exception when unique_violation then null;
  end;

  begin
    perform public.ai_create_technical_entity_from_assertion(
      '12000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000001','Google',
      'nvidia_nim','test-model','{"contextVerified":true}'::jsonb
    );
    raise exception 'cross-owner assertion accepted';
  exception when no_data_found then null;
  end;
end$$;

set role authenticated;
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000001',false);
do $$begin
  if has_function_privilege('authenticated','public.ai_create_technical_entity_from_assertion(uuid,uuid,text,text,text,jsonb)','EXECUTE') then raise exception 'authenticated AI create RPC execute accepted'; end if;
end$$;
reset role;

do $$begin
  if not has_function_privilege('service_role','public.ai_create_technical_entity_from_assertion(uuid,uuid,text,text,text,jsonb)','EXECUTE') then raise exception 'service-role AI create RPC execute missing'; end if;
  if not exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='technical_entity_origin' and e.enumlabel='AI_VERIFIED') then raise exception 'AI entity origin enum missing'; end if;
  if not exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='technical_entity_audit_action' and e.enumlabel='ENTITY_AI_AUTO_CREATED') then raise exception 'AI entity audit action missing'; end if;
end$$;
SQL

echo 'Phase 2.3D AI canonical bootstrap migration harness passed.'
