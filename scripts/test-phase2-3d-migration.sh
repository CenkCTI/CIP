#!/usr/bin/env bash
set -euo pipefail
command -v psql >/dev/null || { echo 'PostgreSQL 16+ psql is required'; exit 2; }
command -v createdb >/dev/null || { echo 'PostgreSQL createdb/dropdb are required'; exit 2; }
major=$(psql --version | sed -E 's/.* ([0-9]+).*/\1/')
(( major >= 16 )) || { echo 'PostgreSQL 16+ is required'; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="citem_phase2_3d_$$"
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

-- Four source-backed assertions: three deterministic identities and one ambiguous malware name.
insert into public.technical_signals(id,owner_id,signal_type,canonical_key,title,summary,lifecycle,severity,confidence,facts,effective_at,first_seen_at,last_seen_at,current_revision_number)
values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','VULNERABILITY_CHANGE','cve:CVE-2026-12345','CVE signal','','ACTIVE','HIGH',null,'{}','2026-08-08T08:00:00Z','2026-08-08T08:00:00Z','2026-08-08T08:00:00Z',1),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','TTP_UPDATE','attack:T1059.001','ATT&CK signal','','ACTIVE','UNKNOWN',null,'{}','2026-08-08T08:00:01Z','2026-08-08T08:00:01Z','2026-08-08T08:00:01Z',1),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','IOC_OBSERVATION','indicator:DOMAIN:evil.example','IOC signal','','ACTIVE','UNKNOWN',null,'{}','2026-08-08T08:00:02Z','2026-08-08T08:00:02Z','2026-08-08T08:00:02Z',1),
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','MALWARE_ACTIVITY','report:test:malware-1','Malware signal','','ACTIVE','UNKNOWN',null,'{}','2026-08-08T08:00:03Z','2026-08-08T08:00:03Z','2026-08-08T08:00:03Z',1),
('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','MALWARE_ACTIVITY','report:test:malware-2','Malware signal 2','','ACTIVE','UNKNOWN',null,'{}','2026-08-08T08:00:04Z','2026-08-08T08:00:04Z','2026-08-08T08:00:04Z',1);

insert into public.technical_signal_observations(id,owner_id,signal_id,source_family,source_system,source_record_key,observation_key,received_at,effective_at,disposition,source_snapshot,source_fingerprint)
values
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','VULNERABILITY','test','cve-1',repeat('1',64),'2026-08-08T08:01:00Z','2026-08-08T08:00:00Z','CURRENT','{}',repeat('a',64)),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','STIX','test','attack-1',repeat('2',64),'2026-08-08T08:01:01Z','2026-08-08T08:00:01Z','CURRENT','{}',repeat('b',64)),
('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','IOC_PROVIDER','test','ioc-1',repeat('3',64),'2026-08-08T08:01:02Z','2026-08-08T08:00:02Z','CURRENT','{}',repeat('c',64)),
('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','IOC_PROVIDER','test','malware-1',repeat('4',64),'2026-08-08T08:01:03Z','2026-08-08T08:00:03Z','CURRENT','{}',repeat('d',64)),
('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000005','IOC_PROVIDER','test','malware-2',repeat('5',64),'2026-08-08T08:01:04Z','2026-08-08T08:00:04Z','CURRENT','{}',repeat('e',64));

insert into public.technical_signal_entity_assertions(id,owner_id,signal_id,source_observation_id,entity_kind,display_value,normalized_value,semantic_role,assertion_basis,indicator_type)
values
('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','CVE','CVE-2026-12345','CVE-2026-12345','SUBJECT','PROVIDER_ASSERTED',null),
('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','ATTACK_TECHNIQUE','T1059.001','T1059.001','USES','PROVIDER_ASSERTED',null),
('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','INDICATOR','evil.example','evil.example','SUBJECT','PROVIDER_ASSERTED','DOMAIN'),
('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000004','MALWARE','LummaStealer','lummastealer','RELATED_TO','PROVIDER_ASSERTED',null),
('40000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000005','MALWARE','LummaStealer','lummastealer','RELATED_TO','PROVIDER_ASSERTED',null);

-- Reconcile only the first four initially.
do $$
declare r jsonb;e1 uuid;e2 uuid;malware_entity uuid;alias_id uuid;before_projects bigint;before_actors bigint;before_malware bigint;before_campaigns bigint;before_cves bigint;before_indicators bigint;before_mitre bigint;before_profiles bigint;
begin
  before_projects:=(select count(*) from public.projects);
  before_actors:=(select count(*) from public.threat_actors);
  before_malware:=(select count(*) from public.malware);
  before_campaigns:=(select count(*) from public.campaigns);
  before_cves:=(select count(*) from public.cves);
  before_indicators:=(select count(*) from public.indicators);
  before_mitre:=(select count(*) from public.mitre_techniques);
  before_profiles:=(select count(*) from public.intel_profile_items);

  -- Temporarily dismiss the fifth row so the first pass has exactly four processable rows.
  perform public.dismiss_technical_entity_assertion('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000005');
  r:=public.reconcile_technical_entity_assertions('10000000-0000-4000-8000-000000000001',500);
  if (r->>'resolved')::int<>3 or (r->>'needs_review')::int<>1 or (r->>'entities_created')::int<>3 then raise exception 'initial reconciliation mismatch: %',r; end if;
  if (select count(*) from public.technical_entities where owner_id='10000000-0000-4000-8000-000000000001' and deterministic_key is not null)<>3 then raise exception 'deterministic entity count mismatch'; end if;
  if (select status from public.technical_entity_assertion_resolutions where assertion_id='40000000-0000-4000-8000-000000000004')<>'NEEDS_REVIEW' then raise exception 'ambiguous malware auto-resolved'; end if;

  -- Exact replay is idempotent: only the still-unresolved ambiguous row is reconsidered.
  r:=public.reconcile_technical_entity_assertions('10000000-0000-4000-8000-000000000001',500);
  if (r->>'processed')::int<>1 or (r->>'entities_created')::int<>0 then raise exception 'replay not idempotent: %',r; end if;

  e1:=(public.create_technical_entity('10000000-0000-4000-8000-000000000001','CVE','cve-2026-12345',null)->>'entity_id')::uuid;
  e2:=(public.create_technical_entity('10000000-0000-4000-8000-000000000001','CVE','CVE-2026-12345',null)->>'entity_id')::uuid;
  if e1<>e2 then raise exception 'deterministic get/create not idempotent'; end if;

  -- Analyst creates one malware entity and links the first assertion WITHOUT teaching an alias.
  malware_entity:=(public.create_technical_entity_from_assertion('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000004','Lumma Stealer',false)->>'entity_id')::uuid;
  perform public.reset_technical_entity_assertion_review('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000005');
  r:=public.reconcile_technical_entity_assertions('10000000-0000-4000-8000-000000000001',500);
  if (select status from public.technical_entity_assertion_resolutions where assertion_id='40000000-0000-4000-8000-000000000005')<>'NEEDS_REVIEW' then raise exception 'per-assertion link leaked into global alias'; end if;

  alias_id:=public.add_technical_entity_alias('10000000-0000-4000-8000-000000000001',malware_entity,'LummaStealer','40000000-0000-4000-8000-000000000004');
  r:=public.reconcile_technical_entity_assertions('10000000-0000-4000-8000-000000000001',500);
  if (select basis from public.technical_entity_assertion_resolutions where assertion_id='40000000-0000-4000-8000-000000000005')<>'CONFIRMED_ALIAS' then raise exception 'confirmed alias did not resolve exact assertion'; end if;

  -- A second entity cannot steal the active resolving alias.
  e2:=(public.create_technical_entity('10000000-0000-4000-8000-000000000001','MALWARE','Different Lumma',null)->>'entity_id')::uuid;
  begin
    perform public.add_technical_entity_alias('10000000-0000-4000-8000-000000000001',e2,'LummaStealer',null);
    raise exception 'alias conflict accepted';
  exception when unique_violation then null;
  end;

  perform public.revoke_technical_entity_alias('10000000-0000-4000-8000-000000000001',alias_id);
  if (select status from public.technical_entity_assertion_resolutions where assertion_id='40000000-0000-4000-8000-000000000005')<>'NEEDS_REVIEW' then raise exception 'revoked alias resolution remained trusted'; end if;
  if (select basis from public.technical_entity_assertion_resolutions where assertion_id='40000000-0000-4000-8000-000000000004')<>'ANALYST_CREATED' then raise exception 'analyst link was incorrectly reset by alias revocation'; end if;

  if before_projects<>(select count(*) from public.projects) or before_actors<>(select count(*) from public.threat_actors) or before_malware<>(select count(*) from public.malware) or before_campaigns<>(select count(*) from public.campaigns) or before_cves<>(select count(*) from public.cves) or before_indicators<>(select count(*) from public.indicators) or before_mitre<>(select count(*) from public.mitre_techniques) or before_profiles<>(select count(*) from public.intel_profile_items) then raise exception 'taxonomy reconciliation mutated analytical/profile tables'; end if;

  begin
    update public.technical_signal_entity_assertions set display_value='changed' where id='40000000-0000-4000-8000-000000000001';
    raise exception 'source assertion update accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.technical_entity_audit_events set details='{}' where owner_id='10000000-0000-4000-8000-000000000001';
    raise exception 'audit mutation accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    insert into public.technical_entity_assertion_resolutions(owner_id,assertion_id,entity_kind,status)
    values('10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','CVE','NEEDS_REVIEW');
    raise exception 'cross-owner assertion FK accepted';
  exception when foreign_key_violation then null;
  end;
end$$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $$begin
  if not exists(select 1 from public.technical_entities where owner_id='10000000-0000-4000-8000-000000000001') then raise exception 'owner SELECT failed'; end if;
  begin insert into public.technical_entities(owner_id,entity_kind,canonical_name,canonical_normalized,origin) values('10000000-0000-4000-8000-000000000001','MALWARE','x','x','ANALYST');raise exception 'authenticated entity insert accepted';exception when insufficient_privilege then null;end;
  begin update public.technical_entity_aliases set display_value='x';raise exception 'authenticated alias update accepted';exception when insufficient_privilege then null;end;
  begin delete from public.technical_entity_assertion_resolutions;raise exception 'authenticated resolution delete accepted';exception when insufficient_privilege then null;end;
  if has_function_privilege('authenticated','public.reconcile_technical_entity_assertions(uuid,integer)','EXECUTE') then raise exception 'authenticated trusted RPC execute accepted'; end if;
end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$begin
  if exists(select 1 from public.technical_entities) or exists(select 1 from public.technical_entity_aliases) or exists(select 1 from public.technical_entity_assertion_resolutions) or exists(select 1 from public.technical_entity_audit_events) then raise exception 'cross-owner RLS failure'; end if;
end$$;
reset role;

set role anon;
do $$begin
  begin perform 1 from public.technical_entities limit 1; raise exception 'anonymous SELECT accepted'; exception when insufficient_privilege then null; end;
end$$;
reset role;

do $$begin
  if not has_function_privilege('service_role','public.reconcile_technical_entity_assertions(uuid,integer)','EXECUTE') then raise exception 'service-role reconcile privilege missing'; end if;
  if not exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='technical_entity_alias_basis' and e.enumlabel='AUTHORITATIVE_SOURCE') then raise exception 'authoritative alias basis missing'; end if;
  if public.technical_entity_normalize_lookup('Lumma-Stealer')=public.technical_entity_normalize_lookup('Lumma Stealer') then raise exception 'punctuation normalization too aggressive'; end if;
end$$;
SQL

echo 'Phase 2.3D migration harness passed.'
