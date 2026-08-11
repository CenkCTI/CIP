#!/usr/bin/env bash
set -euo pipefail

command -v psql >/dev/null || { echo 'PostgreSQL 16+ psql is required'; exit 2; }
command -v createdb >/dev/null || { echo 'PostgreSQL createdb/dropdb are required'; exit 2; }
major=$(psql --version | sed -E 's/.* ([0-9]+).*/\1/')
(( major >= 16 )) || { echo 'PostgreSQL 16+ is required'; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="citem_phase2_3f_c_$$"
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

# This harness validates the database immediately before and at migration 048.
# Downstream migrations must never be applied before 048 merely because newer files were added later.
find "$ROOT/supabase/migrations" -maxdepth 1 -name '*.sql' | sort | while read -r migration; do
  if [[ "$(basename "$migration")" < "202608110048_phase2_3f_c_source_semantics.sql" ]]; then
    printf "\\i '%s'\n" "$migration"
  fi
done > "$MIGRATIONS_SQL"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$MIGRATIONS_SQL" >/dev/null

"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
insert into auth.users(id) values
('10000000-0000-4000-8000-000000000001'),
('10000000-0000-4000-8000-000000000002');

insert into public.technical_signals(
  id,owner_id,signal_type,canonical_key,title,summary,lifecycle,severity,confidence,facts,
  effective_at,first_seen_at,last_seen_at,current_revision_number
) values (
  '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'TECHNICAL_REPORT','report:semantic-harness:backfill','Semantic backfill harness','',
  'ACTIVE','INFO',null,'{}','2026-08-11T10:00:00Z','2026-08-11T10:00:00Z','2026-08-11T10:00:00Z',1
);

insert into public.technical_signal_observations(
  owner_id,signal_id,source_family,source_system,source_record_key,observation_key,
  received_at,effective_at,disposition,source_snapshot,source_fingerprint
) values
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','VULNERABILITY','cisa-kev','kev',repeat('a',64),'2026-08-11T10:01:00Z','2026-08-11T10:00:00Z','CURRENT','{}',repeat('1',64)),
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','VULNERABILITY','nvd-cve','nvd',repeat('b',64),'2026-08-11T10:02:00Z','2026-08-11T10:00:00Z','SUPPORTING','{}',repeat('2',64)),
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','VULNERABILITY','first-epss','epss',repeat('c',64),'2026-08-11T10:03:00Z','2026-08-11T10:00:00Z','SUPPORTING','{}',repeat('3',64)),
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','IOC_PROVIDER','threatfox','tf',repeat('d',64),'2026-08-11T10:04:00Z','2026-08-11T10:00:00Z','SUPPORTING','{}',repeat('4',64)),
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','IOC_PROVIDER','malwarebazaar','mb',repeat('e',64),'2026-08-11T10:05:00Z','2026-08-11T10:00:00Z','SUPPORTING','{}',repeat('5',64)),
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','OTHER','legacy-provider-x','legacy',repeat('f',64),'2026-08-11T10:06:00Z','2026-08-11T10:00:00Z','SUPPORTING','{}',repeat('6',64));
SQL

"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/202608110048_phase2_3f_c_source_semantics.sql" >/dev/null

"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
do $$
declare
  owner_a uuid := '10000000-0000-4000-8000-000000000001';
  result jsonb;
  recorded_observation uuid;
begin
  if (select count(*) from public.technical_observation_semantics where owner_id=owner_a) <> 6 then
    raise exception 'historical semantics backfill count incorrect';
  end if;
  if not exists(select 1 from public.technical_observation_semantics s join public.technical_signal_observations o on o.id=s.observation_id where o.source_system='cisa-kev' and s.source_class='EXPLOITED_VULNERABILITY_CATALOG' and s.observation_basis='PUBLISHED' and s.semantic_kind='KNOWN_EXPLOITED_VULNERABILITY') then raise exception 'CISA KEV semantics incorrect'; end if;
  if not exists(select 1 from public.technical_observation_semantics s join public.technical_signal_observations o on o.id=s.observation_id where o.source_system='nvd-cve' and s.source_class='VULNERABILITY_DATABASE' and s.observation_basis='PUBLISHED' and s.semantic_kind='VULNERABILITY_RECORD') then raise exception 'NVD semantics incorrect'; end if;
  if not exists(select 1 from public.technical_observation_semantics s join public.technical_signal_observations o on o.id=s.observation_id where o.source_system='first-epss' and s.source_class='EXPLOIT_PROBABILITY' and s.observation_basis='SCORED' and s.semantic_kind='EXPLOIT_PROBABILITY_SCORE') then raise exception 'EPSS semantics incorrect'; end if;
  if not exists(select 1 from public.technical_observation_semantics s join public.technical_signal_observations o on o.id=s.observation_id where o.source_system='threatfox' and s.source_class='IOC_SHARING' and s.observation_basis='REPORTED' and s.semantic_kind='IOC_REPORT') then raise exception 'ThreatFox semantics incorrect'; end if;
  if not exists(select 1 from public.technical_observation_semantics s join public.technical_signal_observations o on o.id=s.observation_id where o.source_system='malwarebazaar' and s.source_class='MALWARE_SAMPLE_REPOSITORY' and s.observation_basis='PUBLISHED' and s.semantic_kind='MALWARE_SAMPLE_RECORD') then raise exception 'MalwareBazaar semantics incorrect'; end if;
  if not exists(select 1 from public.technical_observation_semantics s join public.technical_signal_observations o on o.id=s.observation_id where o.source_system='legacy-provider-x' and s.source_class='UNKNOWN' and s.observation_basis='UNKNOWN' and s.semantic_kind='UNKNOWN' and s.classification_basis='UNKNOWN') then raise exception 'unknown fallback incorrect'; end if;

  if has_table_privilege('authenticated','public.technical_observation_semantics','INSERT') then raise exception 'authenticated semantic insert privilege leaked'; end if;
  if has_function_privilege('authenticated','public.record_technical_signal_with_semantics(uuid,jsonb,jsonb,jsonb,jsonb)','EXECUTE') then raise exception 'authenticated semantic recorder execute leaked'; end if;
  if not has_function_privilege('service_role','public.record_technical_signal_with_semantics(uuid,jsonb,jsonb,jsonb,jsonb)','EXECUTE') then raise exception 'service role semantic recorder execute missing'; end if;

  result := public.record_technical_signal_with_semantics(
    owner_a,
    '{"signalType":"PROVIDER_ALERT","canonicalKey":"report:first-epss:CVE-2026-9999","title":"FIRST EPSS score for CVE-2026-9999","summary":"score","lifecycle":"ACTIVE","severity":"UNKNOWN","confidence":null,"facts":{"cve":"CVE-2026-9999","epss":0.9},"publishedAt":"2026-08-11T00:00:00Z","observedAt":"2026-08-11T00:00:00Z","effectiveAt":"2026-08-11T00:00:00Z"}',
    '{"sourceFamily":"VULNERABILITY","sourceSystem":"first-epss","sourceRecordKey":"CVE-2026-9999","sourceRevisionKey":"2026-08-11:0.9","sourceUrl":null,"sourceTitle":"FIRST EPSS score for CVE-2026-9999","sourcePublishedAt":"2026-08-11T00:00:00Z","sourceModifiedAt":"2026-08-11T00:00:00Z","sourceObservedAt":"2026-08-11T00:00:00Z","receivedAt":"2026-08-11T12:00:00Z","effectiveAt":"2026-08-11T00:00:00Z","sourceSnapshot":{"cve":"CVE-2026-9999","epss":0.9}}',
    '[]',
    '{"sourceClass":"EXPLOIT_PROBABILITY","observationBasis":"SCORED","semanticKind":"EXPLOIT_PROBABILITY_SCORE","semanticsVersion":"2.3F-C-v1","classificationBasis":"DETERMINISTIC_SOURCE_MAPPING"}'
  );
  recorded_observation := (result->>'observation_id')::uuid;
  if not exists(select 1 from public.technical_observation_semantics where owner_id=owner_a and observation_id=recorded_observation and source_class='EXPLOIT_PROBABILITY' and observation_basis='SCORED' and semantic_kind='EXPLOIT_PROBABILITY_SCORE') then
    raise exception 'trusted semantic recording did not persist projection';
  end if;

  begin
    perform public.record_technical_signal_with_semantics(
      owner_a,
      '{"signalType":"PROVIDER_ALERT","canonicalKey":"report:first-epss:CVE-2026-9998","title":"Mismatch","summary":"","lifecycle":"ACTIVE","severity":"UNKNOWN","confidence":null,"facts":{},"publishedAt":null,"observedAt":null,"effectiveAt":"2026-08-11T01:00:00Z"}',
      '{"sourceFamily":"VULNERABILITY","sourceSystem":"first-epss","sourceRecordKey":"CVE-2026-9998","receivedAt":"2026-08-11T12:00:00Z","effectiveAt":"2026-08-11T01:00:00Z","sourceSnapshot":{}}',
      '[]',
      '{"sourceClass":"EXPLOIT_PROBABILITY","observationBasis":"OBSERVED","semanticKind":"EXPLOIT_PROBABILITY_SCORE","semanticsVersion":"2.3F-C-v1","classificationBasis":"DETERMINISTIC_SOURCE_MAPPING"}'
    );
    raise exception 'semantic mismatch unexpectedly accepted';
  exception when invalid_parameter_value then null;
  end;
  if exists(select 1 from public.technical_signals where canonical_key='report:first-epss:CVE-2026-9998') then raise exception 'semantic mismatch failed atomic rollback'; end if;

  begin
    update public.technical_observation_semantics set semantic_kind='UNKNOWN' where observation_id=recorded_observation;
    raise exception 'semantic projection unexpectedly mutable';
  exception when sqlstate '55000' then null;
  end;
end$$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $$begin
  if (select count(*) from public.technical_observation_semantics) < 6 then raise exception 'owner cannot read own semantics'; end if;
  begin
    insert into public.technical_observation_semantics(owner_id,observation_id,signal_id,source_class,observation_basis,semantic_kind,semantics_version,classification_basis)
    select owner_id,id,signal_id,'UNKNOWN','UNKNOWN','UNKNOWN','forbidden','UNKNOWN' from public.technical_signal_observations limit 1;
    raise exception 'authenticated semantic write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end$$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$begin
  if exists(select 1 from public.technical_observation_semantics) then raise exception 'semantic RLS leaked owner A'; end if;
end$$;
reset role;
SQL

echo "Phase 2.3F-C migration harness passed."
