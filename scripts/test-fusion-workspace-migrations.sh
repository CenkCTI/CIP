#!/usr/bin/env bash
set -euo pipefail
command -v psql >/dev/null || { echo 'PostgreSQL psql is required' >&2; exit 2; }
command -v createdb >/dev/null || { echo 'PostgreSQL createdb required' >&2; exit 2; }
major="$(psql --version | grep -oE '[0-9]+' | head -1)"
(( major >= 16 )) || { echo 'PostgreSQL 16+ required' >&2; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="citem_fusion_workspace_$$"
if [[ "$(id -un)" == "root" ]] && command -v runuser >/dev/null; then
  PSQL=(runuser -u postgres -- psql)
  CREATEDB=(runuser -u postgres -- createdb)
  DROPDB=(runuser -u postgres -- dropdb)
else
  PSQL=(psql)
  CREATEDB=(createdb)
  DROPDB=(dropdb)
fi
cleanup(){ "${DROPDB[@]}" --if-exists "$DB" >/dev/null 2>&1 || :; }
trap cleanup EXIT
"${CREATEDB[@]}" "$DB"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role service_role bypassrls; exception when duplicate_object then null; end $$;
create schema extensions;
create extension if not exists pgcrypto with schema extensions;
create schema auth;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text,name text,owner uuid);
create function storage.foldername(name text) returns text[] language sql immutable as $$
 select case when array_length(string_to_array(name,'/'),1)<=1 then '{}'::text[]
 else (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] end $$;
create function storage.filename(name text) returns text language sql immutable as $$
 select (string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)] $$;
SQL
# Each migration is applied once in its canonical dependency order, without feature-skipping
# or fabricated success. ON_ERROR_STOP aborts immediately if any DDL fails.
while IFS= read -r file; do
  echo "APPLY $(basename "$file")"
  "${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$file" >/dev/null
done < <(find "$ROOT/supabase/migrations" -maxdepth 1 -name '*.sql' | LC_ALL=C sort)
echo "PASS: Complete migration chain through Fusion 074"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/tests/fusion-postgres-acceptance.sql"
echo "PASS: Fusion owner isolation, RLS, links, audit and integrity"
