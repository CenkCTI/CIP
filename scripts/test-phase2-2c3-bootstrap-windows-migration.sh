#!/usr/bin/env bash
set -euo pipefail
command -v psql >/dev/null||{ echo 'PostgreSQL 16+ psql is required';exit 2;};major=$(psql --version|sed -E 's/.* ([0-9]+).*/\1/');((major>=16))||exit 2
DB="citem_phase2_2c3_windows_$$";tmp=$(mktemp);trap 'rm -f "$tmp";dropdb --if-exists "$DB" >/dev/null 2>&1||true' EXIT;createdb "$DB"
psql -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
do $$begin create role authenticated;exception when duplicate_object then null;end$$;do $$begin create role service_role;exception when duplicate_object then null;end$$;do $$begin create role anon;exception when duplicate_object then null;end$$;create schema extensions;create extension pgcrypto with schema extensions;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt()returns jsonb language sql stable as $$select '{}'::jsonb$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);create function storage.foldername(name text)returns text[] language sql immutable as $$select string_to_array(name,'/')$$;create function storage.filename(name text)returns text language sql immutable as $$select(string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)]$$;
SQL
find supabase/migrations -maxdepth 1 -name '*.sql' ! -name '202608010030_*'|sort|while read -r m;do printf "\\i '%s/%s'\n" "$PWD" "$m";done >"$tmp";psql -v ON_ERROR_STOP=1 -d "$DB" -f "$tmp" >/dev/null
psql -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
insert into auth.users(id)select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,6)n;
do $$declare n integer;c uuid;begin foreach n in array array[30,90,180,365]loop c:=('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;perform configure_otx_connection(('10000000-0000-4000-8000-'||lpad(array_position(array[30,90,180,365],n)::text,12,'0'))::uuid,c,'Y2lwaGVy','MTIzNDU2Nzg5MDEy','MTIzNDU2Nzg5MDEyMzQ1Ng==',1::smallint,n);end loop;end$$;
SQL
psql -v ON_ERROR_STOP=1 -d "$DB" -f "$PWD/supabase/migrations/202608010030_phase2_2c3_otx_bootstrap_windows.sql" >/dev/null
psql -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
do $$declare owner uuid:='10000000-0000-4000-8000-000000000005';c uuid:='30000000-0000-4000-8000-000000000005';n integer;bad integer;begin
 if(select array_agg(bootstrap_lookback_days order by bootstrap_lookback_days)from otx_connection_settings)<>array[30,90,180,365]then raise exception 'existing settings changed';end if;
 foreach n in array array[1,3,7,14,30,90,180,365]loop perform configure_otx_connection(owner,c,'Y2lwaGVy','MTIzNDU2Nzg5MDEy','MTIzNDU2Nzg5MDEyMzQ1Ng==',1::smallint,n);if(select bootstrap_lookback_days from otx_connection_settings where owner_id=owner)<>n then raise exception 'allowed window rejected: %',n;end if;end loop;
 foreach bad in array array[0,2,15,366]loop begin perform update_otx_settings(owner,c,bad);raise exception 'unsupported window accepted: %',bad;exception when others then if sqlerrm like 'unsupported window accepted:%'then raise;end if;end;end loop;
 insert into ioc_provider_connections(id,owner_id,provider_key,display_name,created_by)values('30000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006','ALIENVAULT_OTX','Default test','10000000-0000-4000-8000-000000000006');insert into otx_connection_settings(owner_id,provider_connection_id)values('10000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000006');if(select bootstrap_lookback_days from otx_connection_settings where owner_id='10000000-0000-4000-8000-000000000006')<>7 then raise exception 'new default not 7';end if;
 if exists(select 1 from ioc_provider_connections where provider_key='ALIENVAULT_OTX'and(scheduler_enabled or next_scheduled_sync_at is not null))then raise exception 'OTX scheduling enabled';end if;
 if has_function_privilege('authenticated','public.configure_otx_connection(uuid,uuid,text,text,text,smallint,integer)','EXECUTE')or has_function_privilege('authenticated','public.update_otx_settings(uuid,uuid,integer)','EXECUTE')then raise exception 'authenticated trusted ACL';end if;
 begin perform update_otx_settings('10000000-0000-4000-8000-000000000006',c,7);raise exception 'cross owner accepted';exception when others then if sqlerrm='cross owner accepted'then raise;end if;end;
end$$;
set role authenticated;select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',false);do $$begin if exists(select 1 from otx_connection_settings where owner_id<>'10000000-0000-4000-8000-000000000006')then raise exception 'owner RLS leak';end if;end$$;reset role;
SQL
printf 'PostgreSQL %s; migrations 001-030; OTX bootstrap windows, 7-day default, preservation, scheduler lockout, ACL and owner isolation passed.\n' "$(psql -Atqc 'show server_version' -d "$DB")"
