#!/usr/bin/env bash
set -euo pipefail
command -v psql >/dev/null || { echo 'PostgreSQL 16+ psql is required'; exit 2; }
command -v createdb >/dev/null || { echo 'PostgreSQL createdb/dropdb are required'; exit 2; }
major=$(psql --version | sed -E 's/.* ([0-9]+).*/\1/')
(( major >= 16 )) || { echo 'PostgreSQL 16+ is required'; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="citem_phase2_3a_$$"
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
insert into auth.users(id)values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.projects(id,owner_id,name,research_type)values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Alpha','CTI'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Beta','CTI'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Gamma','CTI');
insert into public.threat_actors(id,project_id,name)values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Actor One');
insert into public.campaigns(id,project_id,name)values('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Campaign One');
insert into public.malware(id,project_id,name)values('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','Malware One');
insert into public.cves(id,project_id,cve_id,severity)values('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','CVE-2026-1234','HIGH');
insert into public.indicators(id,project_id,value,type)values('30000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000001','198.51.100.10','IP'),('30000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000001','https://Example.com/CasePath?a=UP','URL'),('30000000-0000-4000-8000-000000000008','20000000-0000-4000-8000-000000000001','https://Example.com/casepath?a=UP','URL');
insert into public.mitre_techniques(id,project_id,technique_id,technique_name,tactic)values('30000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000001','T1059','Command and Scripting Interpreter','Execution');

do $$declare standalone uuid; inv jsonb; inv_id uuid; counts jsonb; item uuid; excluded uuid; removed uuid;begin
 -- ACL assertions and direct browser mutation denial.
 if has_table_privilege('authenticated','public.intel_profiles','INSERT') or has_table_privilege('authenticated','public.intel_profile_items','UPDATE') or has_table_privilege('authenticated','public.intel_profile_audit_events','INSERT') then raise exception 'direct table ACL too broad';end if;
 if has_function_privilege('authenticated','public.create_standalone_intel_profile(uuid,text,text,text,public.intel_profile_priority,integer,integer,integer)','EXECUTE') then raise exception 'authenticated can execute trusted RPC';end if;
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);set local role authenticated;
 begin insert into public.intel_profiles(owner_id,kind,name,created_by,updated_by)values('10000000-0000-4000-8000-000000000001','STANDALONE','Bad','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');raise exception 'direct profile insert accepted';exception when insufficient_privilege then null;end;
 begin insert into public.intel_profile_audit_events(owner_id,profile_id,actor_id,action)values('10000000-0000-4000-8000-000000000001',gen_random_uuid(),'10000000-0000-4000-8000-000000000001','PROFILE_CREATED');raise exception 'direct audit insert accepted';exception when insufficient_privilege then null;end;
 reset role;
 -- Kind/project constraints.
 begin insert into public.intel_profiles(owner_id,kind,project_id,name,created_by,updated_by)values('10000000-0000-4000-8000-000000000001','STANDALONE','20000000-0000-4000-8000-000000000001','Bad','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');raise exception 'standalone with project accepted';exception when check_violation then null;end;
 begin insert into public.intel_profiles(owner_id,kind,name,created_by,updated_by)values('10000000-0000-4000-8000-000000000001','INVESTIGATION','Bad','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');raise exception 'investigation without project accepted';exception when check_violation then null;end;
 begin perform public.create_investigation_intel_profile('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','Cross','', '', 'MEDIUM',90,null,1);raise exception 'cross-owner project accepted';exception when no_data_found then null;end;
 standalone:=public.create_standalone_intel_profile('10000000-0000-4000-8000-000000000001','Standalone','', '', 'MEDIUM',90,null,1);
 if not exists(select 1 from public.intel_profile_audit_events where profile_id=standalone and action='PROFILE_CREATED')then raise exception 'standalone audit missing';end if;
 begin perform public.refresh_investigation_intel_profile('10000000-0000-4000-8000-000000000001',standalone,'20000000-0000-4000-8000-000000000001');raise exception 'standalone refresh accepted';exception when no_data_found then null;end;
 item:=public.add_explicit_intel_profile_item('10000000-0000-4000-8000-000000000001',standalone,'KEYWORD','edge devices',null,null);
 begin perform public.add_explicit_intel_profile_item('10000000-0000-4000-8000-000000000001',standalone,'COUNTRY','Germany',null,null);raise exception 'active location without role accepted';exception when invalid_parameter_value then null;end;
 begin perform public.add_explicit_intel_profile_item('10000000-0000-4000-8000-000000000001',standalone,'INDICATOR','not an indicator',null,'DOMAIN');raise exception 'invalid indicator accepted';exception when invalid_parameter_value then null;end;
 perform public.add_explicit_intel_profile_item('10000000-0000-4000-8000-000000000001',standalone,'INDICATOR','2001:db8::1',null,'IP');
 perform public.add_explicit_intel_profile_item('10000000-0000-4000-8000-000000000001',standalone,'INDICATOR','198.51.100.0/24',null,'CIDR');
 perform public.add_explicit_intel_profile_item('10000000-0000-4000-8000-000000000001',standalone,'INDICATOR','EXAMPLE.COM',null,'DOMAIN');
 perform public.add_explicit_intel_profile_item('10000000-0000-4000-8000-000000000001',standalone,'INDICATOR','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',null,'HASH');
 perform public.add_explicit_intel_profile_item('10000000-0000-4000-8000-000000000001',standalone,'INDICATOR','https://example.com/CasePath?A=B',null,'URL');
 perform public.add_explicit_intel_profile_item('10000000-0000-4000-8000-000000000001',standalone,'INDICATOR','https://example.com/casepath?A=B',null,'URL');
 begin perform public.add_explicit_intel_profile_item('10000000-0000-4000-8000-000000000001',standalone,'INDICATOR','https://user:pass@example.com/x',null,'URL');raise exception 'credential url accepted';exception when invalid_parameter_value then null;end;
 if not exists(select 1 from public.intel_profile_items where profile_id=standalone and normalized_value='example.com' and indicator_type='DOMAIN') then raise exception 'domain normalization failed';end if;
 if not exists(select 1 from public.intel_profile_items where profile_id=standalone and normalized_value='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' and indicator_type='HASH') then raise exception 'hash normalization failed';end if;
 if not exists(select 1 from public.intel_profile_items where profile_id=standalone and normalized_value='https://example.com/CasePath?A=B') then raise exception 'URL path case not preserved';end if;
 if (select count(*) from public.intel_profile_items where profile_id=standalone and normalized_value in('https://example.com/CasePath?A=B','https://example.com/casepath?A=B'))<>2 then raise exception 'case-sensitive URLs collided';end if;
 begin perform public.transition_intel_profile_item('10000000-0000-4000-8000-000000000001',standalone,item,'ACTIVE');raise exception 'invalid active->active accepted';exception when invalid_parameter_value then null;end;
 perform public.transition_intel_profile_item('10000000-0000-4000-8000-000000000001',standalone,item,'REMOVED');
 perform public.transition_intel_profile_item('10000000-0000-4000-8000-000000000001',standalone,item,'ACTIVE');
 if not exists(select 1 from public.intel_profile_items where id=item and state='ACTIVE' and removed_at is null and accepted_by='10000000-0000-4000-8000-000000000001')then raise exception 'reactivation did not clear removed_at/set accepted_by';end if;
 inv:=public.create_investigation_intel_profile('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Investigation profile','', '', 'HIGH',90,null,1);inv_id:=(inv->>'profile_id')::uuid;
 if(select count(*) from public.intel_profile_items where profile_id=inv_id and origin='DERIVED' and state='ACTIVE')<>8 then raise exception 'deterministic seed count failed';end if;if not exists(select 1 from public.intel_profile_items where profile_id=inv_id and source_entity_id='30000000-0000-4000-8000-000000000007' and indicator_type='URL' and normalized_value='https://example.com/CasePath?a=UP') then raise exception 'seed did not preserve indicator type/url case';end if;
 begin perform public.create_investigation_intel_profile('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Duplicate','', '', 'LOW',90,null,1);raise exception 'duplicate investigation profile accepted';exception when unique_violation then null;end;
 select id into excluded from public.intel_profile_items where profile_id=inv_id and kind='THREAT_ACTOR';perform public.transition_intel_profile_item('10000000-0000-4000-8000-000000000001',inv_id,excluded,'EXCLUDED');
 select id into removed from public.intel_profile_items where profile_id=inv_id and kind='CVE';perform public.transition_intel_profile_item('10000000-0000-4000-8000-000000000001',inv_id,removed,'REMOVED');
 counts:=public.refresh_investigation_intel_profile('10000000-0000-4000-8000-000000000001',inv_id,'20000000-0000-4000-8000-000000000001');
 if (counts->>'preserved_exclusions')::int<>1 or (counts->>'preserved_removals')::int<>1 or exists(select 1 from public.intel_profile_items where profile_id=inv_id and profile_local_key in(select profile_local_key from public.intel_profile_items where id in(excluded,removed)) and state='ACTIVE') then raise exception 'refresh recreated excluded/removed active items';end if;
 begin perform public.refresh_investigation_intel_profile('10000000-0000-4000-8000-000000000001',inv_id,'20000000-0000-4000-8000-000000000003');raise exception 'cross-project refresh accepted';exception when no_data_found then null;end;
 -- Owner scoped reads.
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);set local role authenticated;if not exists(select 1 from public.intel_profiles where id=inv_id)then raise exception 'owner select denied';end if;reset role;
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);set local role authenticated;if exists(select 1 from public.intel_profiles where id=inv_id)or exists(select 1 from public.intel_profile_audit_events where profile_id=inv_id)then raise exception 'cross-owner read leaked';end if;reset role;
 -- Archive/restore and FK delete behavior.
 perform public.set_intel_profile_status('10000000-0000-4000-8000-000000000001',inv_id,'ARCHIVED',false);
 begin perform public.set_intel_profile_status('10000000-0000-4000-8000-000000000001',inv_id,'ACTIVE',false);raise exception 'archived direct active accepted';exception when invalid_parameter_value then null;end;
 begin perform public.update_intel_profile_definition('10000000-0000-4000-8000-000000000001',inv_id,'Nope','', '', 'MEDIUM',90,null,1);raise exception 'archived update accepted';exception when invalid_parameter_value then null;end;
 begin perform public.add_explicit_intel_profile_item('10000000-0000-4000-8000-000000000001',inv_id,'KEYWORD','nope',null,null);raise exception 'archived add item accepted';exception when no_data_found then null;end;
 begin perform public.transition_intel_profile_item('10000000-0000-4000-8000-000000000001',inv_id,removed,'ACTIVE');raise exception 'archived item transition accepted';exception when invalid_parameter_value then null;end;
 begin perform public.refresh_investigation_intel_profile('10000000-0000-4000-8000-000000000001',inv_id,'20000000-0000-4000-8000-000000000001');raise exception 'archived refresh accepted';exception when no_data_found then null;end;
 perform public.set_intel_profile_status('10000000-0000-4000-8000-000000000001',inv_id,'PAUSED',true);if not exists(select 1 from public.intel_profiles where id=inv_id and status='PAUSED' and archived_at is null)then raise exception 'restore did not return paused';end if;
 begin perform public.set_intel_profile_status('10000000-0000-4000-8000-000000000001',inv_id,'PAUSED',true);raise exception 'restore non archived accepted';exception when invalid_parameter_value then null;end;
 begin perform public.set_intel_profile_status('10000000-0000-4000-8000-000000000001',inv_id,'PAUSED',false);raise exception 'repeated pause accepted';exception when invalid_parameter_value then null;end;
 perform public.set_intel_profile_status('10000000-0000-4000-8000-000000000001',inv_id,'ACTIVE',false);
 begin perform public.set_intel_profile_status('10000000-0000-4000-8000-000000000001',inv_id,'ACTIVE',false);raise exception 'repeated resume accepted';exception when invalid_parameter_value then null;end;
 perform public.set_intel_profile_status('10000000-0000-4000-8000-000000000001',inv_id,'PAUSED',false);
 if (select count(*) from public.intel_profile_audit_events where profile_id=inv_id and action in('PROFILE_ARCHIVED','PROFILE_RESTORED','PROFILE_RESUMED','PROFILE_PAUSED'))<>4 then raise exception 'invalid transitions created audit events or valid actions missing';end if;
 delete from public.intel_profile_items where id=excluded;if exists(select 1 from public.intel_profile_audit_events where item_id=excluded)then raise exception 'audit item FK did not set item_id null only';end if;
 delete from public.projects where id='20000000-0000-4000-8000-000000000001';if exists(select 1 from public.intel_profiles where id=inv_id)then raise exception 'project delete did not cascade profile';end if;
 -- Atomic audit rollback: audit trigger failure must roll back profile update.
 standalone:=public.create_standalone_intel_profile('10000000-0000-4000-8000-000000000001','Atomic','', '', 'MEDIUM',90,null,1);create function public.phase2_3a_audit_fail()returns trigger language plpgsql as $f$begin raise exception 'AUDIT_FAIL';end$f$;create trigger phase2_3a_audit_fail before insert on public.intel_profile_audit_events for each row execute function public.phase2_3a_audit_fail();
 begin perform public.update_intel_profile_definition('10000000-0000-4000-8000-000000000001',standalone,'Changed','', '', 'MEDIUM',90,null,1);raise exception 'audit failure mutation succeeded';exception when others then if sqlerrm='audit failure mutation succeeded'then raise;end if;end;if exists(select 1 from public.intel_profiles where id=standalone and name='Changed')then raise exception 'profile update was not rolled back after audit failure';end if;drop trigger phase2_3a_audit_fail on public.intel_profile_audit_events;drop function public.phase2_3a_audit_fail();
end$$;
SQL
if git -C "$ROOT" diff --name-only -- supabase/migrations | grep -Ev '202608050031_phase2_3a_techint_profiles.sql$' | grep -q .; then
  echo 'Unexpected changes to immutable migrations 001-030' >&2
  exit 1
fi
printf 'PostgreSQL %s; migrations 001-031; TechINT trusted RPC, RLS/ACL, constraints, refresh preservation, audit atomicity, and FK behavior passed.\n' "$("${PSQL[@]}" -Atqc 'show server_version' -d "$DB")"
