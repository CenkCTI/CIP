#!/usr/bin/env bash
set -euo pipefail

command -v psql >/dev/null || { echo 'PostgreSQL 16+ psql is required'; exit 2; }
command -v createdb >/dev/null || { echo 'PostgreSQL createdb/dropdb are required'; exit 2; }
major=$(psql --version | sed -E 's/.* ([0-9]+).*/\1/')
(( major >= 16 )) || { echo 'PostgreSQL 16+ is required'; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="citem_phase2_3f_a_$$"
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
  owner_a uuid := '10000000-0000-4000-8000-000000000001';
  owner_b uuid := '10000000-0000-4000-8000-000000000002';
  configured jsonb;
  rotated jsonb;
  raw_token text;
  new_token text;
  tick jsonb;
  immediate_tick jsonb;
  claim jsonb;
  agent_id uuid;
begin
  configured := public.configure_technical_collector(owner_a,true,60,false,'Desktop collector');
  raw_token := configured->>'token';
  agent_id := (configured->>'agent_id')::uuid;

  if raw_token is null or raw_token !~ '^[a-f0-9]{64}$' then raise exception 'collector token not generated'; end if;
  if (select token_hash from public.technical_collector_agents where owner_id=owner_a) = raw_token then raise exception 'collector token stored in plaintext'; end if;
  if (select enabled from public.technical_collector_agents where owner_id=owner_a) is not true then raise exception 'collector not enabled'; end if;

  perform public.enable_technical_source(owner_a,'CISA_KEV','{}'::jsonb,60);
  perform public.enable_technical_source(owner_b,'CISA_KEV','{}'::jsonb,60);

  tick := public.begin_technical_collector_tick(raw_token);
  if coalesce((tick->>'due')::boolean,false) is not true then raise exception 'first collector tick should be due'; end if;
  if (tick->>'owner_id')::uuid <> owner_a then raise exception 'collector token resolved wrong owner'; end if;
  if (select last_heartbeat_at from public.technical_collector_agents where id=agent_id) is null then raise exception 'heartbeat not recorded'; end if;

  select value into claim
  from public.claim_due_technical_collections_for_owner(owner_a,1) as value;
  if claim is null then raise exception 'owner-scoped due claim missing'; end if;
  if (claim->>'owner_id')::uuid <> owner_a then raise exception 'owner-scoped claim leaked another owner'; end if;

  perform public.finish_technical_collector_tick(agent_id,1,1,0,null);
  if (select last_tick_status from public.technical_collector_agents where id=agent_id) <> 'SUCCEEDED' then raise exception 'collector completion not recorded'; end if;

  immediate_tick := public.begin_technical_collector_tick(raw_token);
  if coalesce((immediate_tick->>'due')::boolean,true) is not false then raise exception 'collector tick rate gate failed'; end if;
  if coalesce((immediate_tick->>'wait_seconds')::integer,0) <= 0 then raise exception 'collector wait not returned'; end if;

  rotated := public.configure_technical_collector(owner_a,true,60,true,'Desktop collector');
  new_token := rotated->>'token';
  if new_token is null or new_token = raw_token then raise exception 'collector rotation failed'; end if;

  begin
    perform public.begin_technical_collector_tick(raw_token);
    raise exception 'old collector token remained valid';
  exception when sqlstate '28000' then null;
  end;

  perform public.configure_technical_collector(owner_a,false,60,false,'Desktop collector');
  tick := public.begin_technical_collector_tick(new_token);
  if coalesce((tick->>'enabled')::boolean,true) is not false then raise exception 'paused collector still enabled'; end if;

  if exists(select 1 from public.technical_collection_runs where owner_id=owner_b and trigger='SCHEDULED') then
    raise exception 'owner B source was claimed by owner A collector';
  end if;
end$$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);

do $$begin
  if (select count(*) from public.technical_collector_agents) <> 1 then raise exception 'owner A cannot read own collector'; end if;
  begin
    perform token_hash from public.technical_collector_agents;
    raise exception 'authenticated token hash read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claim_due_technical_collections_for_owner('10000000-0000-4000-8000-000000000001',1);
    raise exception 'authenticated collector claim unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end$$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$begin
  if exists(select 1 from public.technical_collector_agents) then raise exception 'collector RLS leaked owner A'; end if;
end$$;
reset role;
SQL

echo "Phase 2.3F-A migration harness passed."
