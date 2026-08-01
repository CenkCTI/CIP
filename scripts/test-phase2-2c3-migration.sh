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
do $$declare c uuid;begin
 c:=configure_otx_connection('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Y2lwaGVy','MTIzNDU2Nzg5MDEy','MTIzNDU2Nzg5MDEyMzQ1Ng==',1,30);
 if(select scheduler_enabled or next_scheduled_sync_at is not null from ioc_provider_connections where id=c)then raise exception 'OTX scheduling enabled';end if;
 if(select bootstrap_lookback_days from otx_connection_settings where provider_connection_id=c)<>30 then raise exception 'settings absent';end if;
 perform update_otx_settings('10000000-0000-4000-8000-000000000001',c,365);
 begin perform update_otx_settings('10000000-0000-4000-8000-000000000002',c,30);raise exception 'cross owner accepted';exception when others then if sqlerrm='cross owner accepted'then raise;end if;end;
 begin insert into ioc_provider_credentials(owner_id,provider_connection_id,provider_key,ciphertext_b64,iv_b64,auth_tag_b64)values('10000000-0000-4000-8000-000000000001',c,'OTHER','Y2lwaGVy','MTIzNDU2Nzg5MDEy','MTIzNDU2Nzg5MDEyMzQ1Ng==');raise exception 'provider accepted';exception when check_violation then null;end;
 perform disconnect_otx_credential('10000000-0000-4000-8000-000000000001',c);if exists(select 1 from ioc_provider_credentials where provider_connection_id=c)then raise exception 'credential survived';end if;
 if has_function_privilege('authenticated','public.configure_otx_connection(uuid,uuid,text,text,text,smallint,integer)','EXECUTE')then raise exception 'ACL';end if;
end$$;
SQL
printf 'PostgreSQL %s; migrations 001-029; OTX constraint, settings, ACL, isolation, connect/update/disconnect and scheduler-disabled checks passed.\n' "$(psql -Atqc 'show server_version' -d "$DB")"
