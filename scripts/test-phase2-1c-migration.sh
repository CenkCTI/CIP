#!/usr/bin/env bash
set -euo pipefail

# Runs every repository migration, including 019, inside one real PostgreSQL
# transaction. Supabase-provided auth/storage objects are minimally stubbed.
DB_NAME="citem_phase2_1c_${$}"
cleanup() { dropdb --if-exists "$DB_NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
createdb "$DB_NAME"
psql -v ON_ERROR_STOP=1 -d "$DB_NAME" <<'SQL'
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
create extension if not exists pgcrypto;
create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid());
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
create function storage.filename(name text) returns text language sql immutable as $$ select (string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)] $$;
SQL

sql_file="$(mktemp)"
trap 'rm -f "$sql_file"; cleanup' EXIT
{
  echo "BEGIN;"
  for migration in supabase/migrations/*.sql; do
    printf "\\i '%s/%s'\n" "$PWD" "$migration"
  done
  cat <<'SQL'
do $$ begin
  if not exists (select 1 from pg_type where typname='infrastructure_cluster_status') then raise exception 'cluster enum missing'; end if;
  if not exists (select 1 from pg_class where relname='infrastructure_cluster_support' and relrowsecurity) then raise exception 'support RLS missing'; end if;
  if not exists (select 1 from pg_trigger where tgname='infrastructure_clusters_set_updated_at') then raise exception 'updated_at trigger missing'; end if;
end $$;
ROLLBACK;
SQL
} > "$sql_file"
psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -f "$sql_file"
echo "Phase 2.1C migration transaction smoke test passed."
