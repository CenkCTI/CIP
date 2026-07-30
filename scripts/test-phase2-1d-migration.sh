#!/usr/bin/env bash
set -euo pipefail

# Runs every repository migration, including 020, inside one real PostgreSQL
# transaction. Supabase-provided auth/storage objects are minimally stubbed.
DB_NAME="citem_phase2_1d_${$}"
cleanup() { dropdb --if-exists "$DB_NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
createdb "$DB_NAME"
psql -v ON_ERROR_STOP=1 -d "$DB_NAME" <<'SQL'
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
create extension if not exists pgcrypto;
create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb not null default '{}'::jsonb);
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
do $$
declare
  u uuid := gen_random_uuid(); p uuid := gen_random_uuid(); p2 uuid := gen_random_uuid();
  campaign uuid; event uuid; indicator uuid; cluster uuid; membership uuid;
begin
  if not exists (select 1 from pg_type where typname='timeline_event_basis') then raise exception 'event basis enum missing'; end if;
  if (select count(*) from pg_class where relname in ('campaign_reconstructions','campaign_timeline_events','campaign_infrastructure_clusters','timeline_event_entities','timeline_event_support') and relrowsecurity) <> 5 then raise exception 'Phase 2.1D RLS missing'; end if;
  if (select count(*) from pg_policies where tablename in ('campaign_reconstructions','campaign_timeline_events','campaign_infrastructure_clusters','timeline_event_entities','timeline_event_support')) < 17 then raise exception 'Phase 2.1D policies missing'; end if;
  if (select count(*) from pg_trigger where tgname in ('campaign_reconstructions_set_updated_at','campaign_timeline_events_set_updated_at','campaign_infrastructure_clusters_set_updated_at')) <> 3 then raise exception 'updated_at triggers missing'; end if;
  insert into auth.users(id) values(u);
  insert into public.projects(id,owner_id,name,research_type) values(p,u,'Smoke one','CTI'),(p2,u,'Smoke two','CTI');
  -- Legacy Timeline insert remains valid and receives safe defaults.
  insert into public.timeline_events(project_id,event_name,event_date,description) values(p,'Legacy event',now(),'') returning id into event;
  if (select basis from public.timeline_events where id=event) <> 'OBSERVED' then raise exception 'legacy default missing'; end if;
  insert into public.campaigns(project_id,name) values(p,'Campaign') returning id into campaign;
  insert into public.indicators(project_id,value,type) values(p,'198.51.100.1','IP') returning id into indicator;
  insert into public.infrastructure_clusters(project_id,name,created_by) values(p,'Cluster',u) returning id into cluster;
  insert into public.campaign_timeline_events(project_id,campaign_id,timeline_event_id,rationale,created_by) values(p,campaign,event,'Supported',u) returning id into membership;
  begin delete from public.timeline_events where id=event; raise exception 'restricted event deletion unexpectedly succeeded'; exception when foreign_key_violation then null; end;
  begin delete from public.campaign_timeline_events where id=membership; raise exception 'active membership deletion unexpectedly succeeded'; exception when foreign_key_violation then null; end;
  update public.campaign_timeline_events set status='REMOVED' where id=membership;
  delete from public.campaign_timeline_events where id=membership;
  begin insert into public.timeline_event_entities(project_id,timeline_event_id,role,created_by) values(p,event,'SUBJECT',u); raise exception 'exact-one entity unexpectedly succeeded'; exception when check_violation then null; end;
  insert into public.timeline_event_entities(project_id,timeline_event_id,indicator_id,role,created_by) values(p,event,indicator,'SUBJECT',u);
  begin insert into public.timeline_event_support(project_id,timeline_event_id,analyst_note,created_by) values(p,event,'',u); raise exception 'exact-one support unexpectedly succeeded'; exception when check_violation then null; end;
  begin insert into public.campaign_timeline_events(project_id,campaign_id,timeline_event_id,rationale,created_by) values(p2,campaign,event,'Cross project',u); raise exception 'same-project FK unexpectedly succeeded'; exception when foreign_key_violation then null; end;
end $$;
ROLLBACK;
SQL
} > "$sql_file"
psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -f "$sql_file"
echo "Phase 2.1D migration transaction smoke test passed."
