#!/usr/bin/env bash
set -euo pipefail

command -v psql >/dev/null || { echo 'PostgreSQL 16+ psql is required'; exit 2; }
command -v createdb >/dev/null || { echo 'PostgreSQL createdb/dropdb are required'; exit 2; }
major=$(psql --version | sed -E 's/.* ([0-9]+).*/\1/')
(( major >= 16 )) || { echo 'PostgreSQL 16+ is required'; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="citem_phase2_3e_$$"
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
  owner_a uuid:='10000000-0000-4000-8000-000000000001';
  owner_b uuid:='10000000-0000-4000-8000-000000000002';
  profile_id uuid;
  vendor_item uuid;
  product_item uuid;
  match_before uuid;
  match_after uuid;
  product_entity uuid;
  result jsonb;
begin
  profile_id:=public.create_standalone_intel_profile(owner_a,'Splunk Watch','','Watch Splunk technical developments','CRITICAL',90,null,1);
  vendor_item:=public.add_explicit_intel_profile_item(owner_a,profile_id,'VENDOR','Splunk',null,null);
  product_item:=public.add_explicit_intel_profile_item(owner_a,profile_id,'PRODUCT','Splunk Enterprise',null,null);

  insert into public.technical_signals(
    id,owner_id,signal_type,canonical_key,title,summary,lifecycle,severity,confidence,facts,
    effective_at,first_seen_at,last_seen_at,current_revision_number
  ) values
  ('20000000-0000-4000-8000-000000000001',owner_a,'ACTIVE_EXPLOITATION','cve:CVE-2026-20253',
   'Splunk Enterprise Missing Authentication for Critical Function Vulnerability','Known exploited vulnerability CVE-2026-20253 affecting Splunk Enterprise.',
   'ACTIVE','UNKNOWN',null,'{}',now()-interval '1 hour',now()-interval '1 hour',now()-interval '1 hour',1),
  ('20000000-0000-4000-8000-000000000002',owner_a,'PROVIDER_ALERT','report:first-epss:CVE-2026-20253',
   'FIRST EPSS score for CVE-2026-20253','High exploitation probability context.','ACTIVE','UNKNOWN',null,
   '{"cve":"CVE-2026-20253","epss":0.96,"percentile":0.995}',now()-interval '30 minutes',now()-interval '30 minutes',now()-interval '30 minutes',1),
  ('20000000-0000-4000-8000-000000000003',owner_a,'VULNERABILITY_CHANGE','cve:CVE-2026-99999',
   'Old critical-severity source record','Severity alone must not become Global Priority CRITICAL.','ACTIVE','CRITICAL',null,'{}',
   now()-interval '10 days',now()-interval '10 days',now()-interval '10 days',1);

  insert into public.technical_signal_observations(
    id,owner_id,signal_id,source_family,source_system,source_record_key,observation_key,received_at,effective_at,disposition,source_snapshot,source_fingerprint
  ) values
  ('30000000-0000-4000-8000-000000000001',owner_a,'20000000-0000-4000-8000-000000000001','VULNERABILITY','cisa-kev','CVE-2026-20253',repeat('1',64),now(),now()-interval '1 hour','CURRENT','{}',repeat('a',64)),
  ('30000000-0000-4000-8000-000000000002',owner_a,'20000000-0000-4000-8000-000000000002','VULNERABILITY','first-epss','CVE-2026-20253',repeat('2',64),now(),now()-interval '30 minutes','CURRENT','{"epss":0.96,"percentile":0.995}',repeat('b',64)),
  ('30000000-0000-4000-8000-000000000003',owner_a,'20000000-0000-4000-8000-000000000003','VULNERABILITY','nvd','CVE-2026-99999',repeat('3',64),now(),now()-interval '10 days','CURRENT','{}',repeat('c',64));

  insert into public.technical_signal_entity_assertions(
    id,owner_id,signal_id,source_observation_id,entity_kind,display_value,normalized_value,semantic_role,assertion_basis,indicator_type
  ) values
  ('40000000-0000-4000-8000-000000000001',owner_a,'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','VENDOR','Splunk','splunk','AFFECTS','PROVIDER_ASSERTED',null),
  ('40000000-0000-4000-8000-000000000002',owner_a,'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','PRODUCT','Enterprise','enterprise','AFFECTS','PROVIDER_ASSERTED',null),
  ('40000000-0000-4000-8000-000000000003',owner_a,'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','CVE','CVE-2026-20253','CVE-2026-20253','SUBJECT','PROVIDER_ASSERTED',null),
  ('40000000-0000-4000-8000-000000000004',owner_a,'20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','CVE','CVE-2026-20253','CVE-2026-20253','SUBJECT','PROVIDER_ASSERTED',null),
  ('40000000-0000-4000-8000-000000000005',owner_a,'20000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','CVE','CVE-2026-99999','CVE-2026-99999','SUBJECT','PROVIDER_ASSERTED',null);

  result:=public.reconcile_new_technical_entity_assertions(owner_a,500);
  if (select status from public.technical_entity_assertion_resolutions where assertion_id='40000000-0000-4000-8000-000000000001')<>'NEEDS_REVIEW' then raise exception 'Splunk vendor should remain reviewable'; end if;
  if (select status from public.technical_entity_assertion_resolutions where assertion_id='40000000-0000-4000-8000-000000000002')<>'NEEDS_REVIEW' then raise exception 'Enterprise product should remain reviewable'; end if;

  result:=public.evaluate_technical_signal_intelligence_batch(owner_a,array[
    '20000000-0000-4000-8000-000000000001'::uuid,
    '20000000-0000-4000-8000-000000000002'::uuid,
    '20000000-0000-4000-8000-000000000003'::uuid
  ]);
  if result->>'engine_version'<>'2.3E-v1' then raise exception 'engine version missing'; end if;

  if (select priority from public.technical_signal_global_priorities where owner_id=owner_a and signal_id='20000000-0000-4000-8000-000000000001')<>'CRITICAL' then
    raise exception 'KEV + exploitation + EPSS + freshness + multi-source should be CRITICAL';
  end if;
  if (select priority from public.technical_signal_global_priorities where owner_id=owner_a and signal_id='20000000-0000-4000-8000-000000000003')='CRITICAL' then
    raise exception 'source severity CRITICAL alone became Global Priority CRITICAL';
  end if;

  select id into match_before from public.technical_signal_profile_matches where owner_id=owner_a and signal_id='20000000-0000-4000-8000-000000000001' and profile_id=profile_id;
  if match_before is null then raise exception 'unresolved Splunk signal was hidden from profile'; end if;
  if (select match_quality from public.technical_signal_profile_matches where id=match_before)<>'PROVISIONAL' then raise exception 'unresolved Splunk match should be PROVISIONAL'; end if;
  if (select relevance from public.technical_signal_profile_matches where id=match_before)<>'HIGH' then raise exception 'Splunk profile match should be HIGH relevance'; end if;
  if not exists(select 1 from public.technical_signal_profile_matches where id=match_before and vendor_item=any(matched_profile_item_ids)) then raise exception 'direct vendor reason item not preserved'; end if;

  product_entity:=(public.create_technical_entity_from_assertion(owner_a,'40000000-0000-4000-8000-000000000002','Splunk Enterprise',false)->>'entity_id')::uuid;
  if product_entity is null then raise exception 'product canonical resolution failed'; end if;

  select id into match_after from public.technical_signal_profile_matches where owner_id=owner_a and signal_id='20000000-0000-4000-8000-000000000001' and profile_id=profile_id;
  if match_after<>match_before then raise exception 'resolution upgrade created duplicate profile match'; end if;
  if (select match_quality from public.technical_signal_profile_matches where id=match_after)<>'CONFIRMED' then raise exception 'canonical product resolution did not upgrade match to CONFIRMED'; end if;
  if not exists(select 1 from public.technical_signal_profile_matches where id=match_after and product_item=any(matched_profile_item_ids)) then raise exception 'resolved product item not preserved'; end if;

  perform public.evaluate_technical_signal_intelligence_batch(owner_a,array['20000000-0000-4000-8000-000000000001'::uuid]);
  if (select count(*) from public.technical_signal_profile_matches where owner_id=owner_a and signal_id='20000000-0000-4000-8000-000000000001' and profile_id=profile_id)<>1 then raise exception 're-evaluation not idempotent'; end if;

  perform public.set_technical_signal_profile_match_lifecycle(owner_a,match_after,'REVIEWED',null);
  perform public.set_technical_signal_profile_match_lifecycle(owner_a,match_after,'ACCEPTED',null);
  perform public.set_technical_signal_profile_match_lifecycle(owner_a,match_after,'SNOOZED',now()+interval '1 day');
  perform public.unsnooze_technical_signal_profile_match(owner_a,match_after);
  perform public.set_technical_signal_profile_match_lifecycle(owner_a,match_after,'NOT_RELEVANT',null);
  if (select lifecycle from public.technical_signal_profile_matches where id=match_after)<>'NOT_RELEVANT' then raise exception 'match lifecycle transition failed'; end if;
  if (select count(*) from public.technical_signal_profile_match_events where match_id=match_after)<5 then raise exception 'match lifecycle audit history incomplete'; end if;

  if (select display_value from public.technical_signal_entity_assertions where id='40000000-0000-4000-8000-000000000002')<>'Enterprise' then raise exception 'source assertion was rewritten'; end if;
  if (select display_value from public.technical_signal_entity_assertions where id='40000000-0000-4000-8000-000000000001')<>'Splunk' then raise exception 'source vendor assertion was rewritten'; end if;

  begin
    perform public.evaluate_technical_profile(owner_b,profile_id);
    raise exception 'cross-owner profile evaluation unexpectedly succeeded';
  exception when no_data_found then null; when sqlstate 'P0002' then null;
  end;
end$$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $$begin
  if exists(select 1 from public.technical_signal_profile_matches where owner_id='10000000-0000-4000-8000-000000000002') then raise exception 'foreign owner rows visible'; end if;
  begin
    insert into public.technical_signal_global_priorities(owner_id,signal_id,priority,internal_score,engine_version,evaluated_at)
    values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','INFO',0,'bad',now());
    raise exception 'authenticated projection write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.evaluate_technical_signal_intelligence_batch('10000000-0000-4000-8000-000000000001',array['20000000-0000-4000-8000-000000000001'::uuid]);
    raise exception 'authenticated trusted RPC execution unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end$$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$begin
  if exists(select 1 from public.technical_signal_global_priorities where owner_id='10000000-0000-4000-8000-000000000001') then raise exception 'Global Priority RLS leaked owner A'; end if;
  if exists(select 1 from public.technical_signal_profile_matches where owner_id='10000000-0000-4000-8000-000000000001') then raise exception 'Profile Match RLS leaked owner A'; end if;
end$$;
reset role;
SQL

echo "Phase 2.3E migration harness passed."
