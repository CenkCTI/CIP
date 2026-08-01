#!/usr/bin/env bash
set -euo pipefail
command -v psql >/dev/null||{ echo 'PostgreSQL 16+ psql is required';exit 2;}; major=$(psql --version|sed -E 's/.* ([0-9]+).*/\1/');((major>=16))||exit 2
DB="citem_phase2_2c_$$";tmp=$(mktemp);trap 'rm -f "$tmp";dropdb --if-exists "$DB" >/dev/null 2>&1||true' EXIT;createdb "$DB"
psql -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
do $$begin create role authenticated;exception when duplicate_object then null;end$$;do $$begin create role service_role;exception when duplicate_object then null;end$$;do $$begin create role anon;exception when duplicate_object then null;end$$;create schema extensions;create extension pgcrypto with schema extensions;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt()returns jsonb language sql stable as $$select '{}'::jsonb$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);create function storage.foldername(name text)returns text[] language sql immutable as $$select string_to_array(name,'/')$$;create function storage.filename(name text)returns text language sql immutable as $$select(string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)]$$;
SQL
find supabase/migrations -maxdepth 1 -name '*.sql'|sort|while read -r m;do printf "\\i '%s/%s'\n" "$PWD" "$m";done >"$tmp";psql -v ON_ERROR_STOP=1 -d "$DB" -f "$tmp" >/dev/null
psql -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
insert into auth.users(id)values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into projects(id,owner_id,name,research_type)values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','OTX Investigation','CTI');
do $$declare c uuid:='30000000-0000-4000-8000-000000000001';other uuid:='30000000-0000-4000-8000-000000000002';r record;candidate uuid;dismissed uuid;payload jsonb;before_cursor text;lookback integer;begin
 -- Exact provider constraint, configure and rotate.
 c:=configure_otx_connection('10000000-0000-4000-8000-000000000001',c,'Y2lwaGVyMQ==','MTIzNDU2Nzg5MDEy','MTIzNDU2Nzg5MDEyMzQ1Ng==',1::smallint,30);
 perform configure_otx_connection('10000000-0000-4000-8000-000000000001',c,'Y2lwaGVyMg==','MTIzNDU2Nzg5MDEy','MTIzNDU2Nzg5MDEyMzQ1Ng==',1::smallint,90);
 if(select ciphertext_b64 from ioc_provider_credentials where provider_connection_id=c)<>'Y2lwaGVyMg=='or(select rotated_at is null from ioc_provider_credentials where provider_connection_id=c)then raise exception 'rotation failed';end if;
 foreach lookback in array array[30,90,180,365]loop perform update_otx_settings('10000000-0000-4000-8000-000000000001',c,lookback);if(select bootstrap_lookback_days from otx_connection_settings where provider_connection_id=c)<>lookback then raise exception 'lookback failed';end if;end loop;
 begin perform update_otx_settings('10000000-0000-4000-8000-000000000001',c,31);raise exception 'invalid lookback accepted';exception when others then if sqlerrm='invalid lookback accepted'then raise;end if;end;
 if(select scheduler_enabled or next_scheduled_sync_at is not null from ioc_provider_connections where id=c)then raise exception 'OTX scheduling enabled';end if;
 begin perform update_otx_settings('10000000-0000-4000-8000-000000000002',c,30);raise exception 'cross-owner mutation accepted';exception when others then if sqlerrm='cross-owner mutation accepted'then raise;end if;end;
 insert into ioc_provider_connections(id,owner_id,provider_key,display_name,created_by)values(other,'10000000-0000-4000-8000-000000000002','OTHER_PROVIDER','Other','10000000-0000-4000-8000-000000000002');
 begin perform configure_otx_connection('10000000-0000-4000-8000-000000000001',other,'Y2lwaGVy','MTIzNDU2Nzg5MDEy','MTIzNDU2Nzg5MDEyMzQ1Ng==',1::smallint,30);raise exception 'ID collision accepted';exception when others then if sqlerrm='ID collision accepted'then raise;end if;end;
 begin insert into ioc_provider_credentials(owner_id,provider_connection_id,provider_key,ciphertext_b64,iv_b64,auth_tag_b64)values('10000000-0000-4000-8000-000000000002',other,'OTHER_PROVIDER','Y2lwaGVy','MTIzNDU2Nzg5MDEy','MTIzNDU2Nzg5MDEyMzQ1Ng==');raise exception 'arbitrary provider accepted';exception when check_violation then null;end;
 -- Exact lease completion, canonical deduplication, two-Pulse provenance, skip and cursor accounting.
 select * into r from claim_ioc_connection('10000000-0000-4000-8000-000000000001',c,'MANUAL');
 payload:=jsonb_build_array(
 jsonb_build_object('provider_item_id','pulse-a:indicator','candidate_type','DOMAIN','normalized_value','example.com','original_value','example.com','source_fingerprint',repeat('a',64),'tags',jsonb_build_array('ALIENVAULT_OTX'),'metadata',jsonb_build_object('otx_pulse',jsonb_build_object('id','0123456789abcdef01234567'))),
 jsonb_build_object('provider_item_id','pulse-b:indicator','candidate_type','DOMAIN','normalized_value','example.com','original_value','example.com','source_fingerprint',repeat('b',64),'tags',jsonb_build_array('ALIENVAULT_OTX'),'metadata',jsonb_build_object('otx_pulse',jsonb_build_object('id','1123456789abcdef01234567'))),
 jsonb_build_object('provider_item_id','dismiss','candidate_type','DOMAIN','normalized_value','sub.example.com','original_value','sub.example.com','source_fingerprint',repeat('c',64),'tags','[]'::jsonb,'metadata','{}'::jsonb),jsonb_build_object('provider_skip_reason','UNSUPPORTED_IOC_TYPE'));
 begin perform complete_ioc_ingestion(r.owner_id,r.connection_id,r.run_id,gen_random_uuid(),'SUCCEEDED',r.cursor_version,'cursor-one',payload);raise exception 'wrong lease accepted';exception when others then if sqlerrm='wrong lease accepted'then raise;end if;end;
 if exists(select 1 from ioc_provider_cursors where provider_connection_id=c)then raise exception 'failed completion advanced cursor';end if;
 perform complete_ioc_ingestion(r.owner_id,r.connection_id,r.run_id,r.lease_token,'SUCCEEDED',r.cursor_version,'cursor-one',payload);
 select id into candidate from ioc_candidates where owner_id=r.owner_id and normalized_value='example.com';select id into dismissed from ioc_candidates where owner_id=r.owner_id and normalized_value='sub.example.com';
 if(select count(*)from ioc_candidates where owner_id=r.owner_id and normalized_value='example.com')<>1 or(select count(*)from ioc_candidate_sources where candidate_id=candidate)<>2 or(select count(distinct source_fingerprint)from ioc_candidate_sources where candidate_id=candidate)<>2 then raise exception 'two-Pulse provenance failed';end if;
 if(select skipped_count from ioc_ingestion_runs where id=r.run_id)<>1 or(select cursor_value from ioc_provider_cursors where provider_connection_id=c)<>'cursor-one'then raise exception 'skip/cursor accounting failed';end if;
 perform set_config('request.jwt.claim.sub',r.owner_id::text,true);perform triage_ioc_candidate(candidate,'REVIEW');perform triage_ioc_candidate(dismissed,'DISMISS');
 select * into r from claim_ioc_connection(r.owner_id,c,'MANUAL');before_cursor:=(select cursor_value from ioc_provider_cursors where provider_connection_id=c);
 begin perform complete_ioc_ingestion(r.owner_id,r.connection_id,r.run_id,gen_random_uuid(),'SUCCEEDED',r.cursor_version,'cursor-bad','[]');raise exception 'stale completion accepted';exception when others then if sqlerrm='stale completion accepted'then raise;end if;end;
 if(select cursor_value from ioc_provider_cursors where provider_connection_id=c)is distinct from before_cursor then raise exception 'cursor changed after failure';end if;
 payload:=jsonb_build_array(jsonb_build_object('provider_item_id','pulse-a:indicator','candidate_type','DOMAIN','normalized_value','example.com','original_value','example.com','source_fingerprint',repeat('a',64),'tags',jsonb_build_array('ALIENVAULT_OTX'),'metadata',jsonb_build_object('otx_pulse',jsonb_build_object('id','0123456789abcdef01234567','modified','2026-08-01T11:00:00Z'))),jsonb_build_object('provider_item_id','dismiss','candidate_type','DOMAIN','normalized_value','sub.example.com','original_value','sub.example.com','source_fingerprint',repeat('c',64),'tags','[]'::jsonb,'metadata','{}'::jsonb));
 perform complete_ioc_ingestion(r.owner_id,r.connection_id,r.run_id,r.lease_token,'SUCCEEDED',r.cursor_version,'cursor-two',payload);
 if(select status from ioc_candidates where id=candidate)<>'REVIEWED'or(select status from ioc_candidates where id=dismissed)<>'DISMISSED'then raise exception 'triage overwritten';end if;
 if(select cursor_value from ioc_provider_cursors where provider_connection_id=c)<>'cursor-two'then raise exception 'cursor did not advance';end if;
 perform accept_ioc_candidate(candidate,'20000000-0000-4000-8000-000000000001','analyst accepted',null);perform accept_ioc_candidate(candidate,'20000000-0000-4000-8000-000000000001','repeat',null);
 if(select count(*)from ioc_candidate_acceptances where candidate_id=candidate)<>1 then raise exception 'acceptance not idempotent';end if;
 perform disconnect_otx_credential(r.owner_id,c);
 if exists(select 1 from ioc_provider_credentials where provider_connection_id=c)or not exists(select 1 from ioc_candidates where id=candidate)or(select count(*)from ioc_candidate_sources where candidate_id=candidate)<>2 or not exists(select 1 from ioc_ingestion_runs where provider_connection_id=c)or not exists(select 1 from ioc_provider_cursors where provider_connection_id=c)or not exists(select 1 from ioc_candidate_acceptances where candidate_id=candidate)then raise exception 'disconnect removed history';end if;
 begin perform claim_ioc_connection(r.owner_id,c,'MANUAL');raise exception 'disconnected sync accepted';exception when others then if sqlerrm='disconnected sync accepted'then raise;end if;end;
end$$;
-- ACL and owner RLS checks.
do $$begin
 if has_table_privilege('authenticated','public.ioc_provider_credentials','SELECT')or has_table_privilege('authenticated','public.ioc_provider_credentials','INSERT')or has_table_privilege('authenticated','public.ioc_provider_credentials','UPDATE')or has_table_privilege('authenticated','public.ioc_provider_credentials','DELETE')then raise exception 'credential ACL';end if;
 if has_function_privilege('authenticated','public.configure_otx_connection(uuid,uuid,text,text,text,smallint,integer)','EXECUTE')or has_function_privilege('authenticated','public.disconnect_otx_credential(uuid,uuid)','EXECUTE')or has_function_privilege('authenticated','public.update_otx_settings(uuid,uuid,integer)','EXECUTE')then raise exception 'trusted function ACL';end if;
end$$;
set role authenticated;select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$begin if exists(select 1 from otx_connection_settings where owner_id='10000000-0000-4000-8000-000000000001')then raise exception 'second-user settings leak';end if;end$$;
reset role;
SQL
printf 'PostgreSQL %s; migrations 001-029; OTX credential constraint/ACL/RLS, connect/rotate/disconnect, settings, scheduler lockout, isolation, exact lease/cursor atomicity, canonical deduplication, two-Pulse provenance, triage and acceptance passed.\n' "$(psql -Atqc 'show server_version' -d "$DB")"
