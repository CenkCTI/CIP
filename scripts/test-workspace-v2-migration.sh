#!/usr/bin/env bash
set -euo pipefail

command -v psql >/dev/null || { echo 'PostgreSQL 16+ psql is required'; exit 2; }
command -v createdb >/dev/null || { echo 'PostgreSQL createdb/dropdb are required'; exit 2; }
major=$(psql --version | sed -E 's/.* ([0-9]+).*/\1/')
(( major >= 16 )) || { echo 'PostgreSQL 16+ is required'; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="citem_workspace_v2_$$"
PRE_SQL=$(mktemp)
chmod 0644 "$PRE_SQL"

if [[ "$(id -un)" == "root" ]] && command -v runuser >/dev/null; then
  PSQL=(runuser -u postgres -- psql)
  CREATEDB=(runuser -u postgres -- createdb)
  DROPDB=(runuser -u postgres -- dropdb)
else
  PSQL=(psql)
  CREATEDB=(createdb)
  DROPDB=(dropdb)
fi
trap 'rm -f "$PRE_SQL"; "${DROPDB[@]}" --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

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

find "$ROOT/supabase/migrations" -maxdepth 1 -name '*.sql' ! -name '202608220052_notes_reports_workspace_v2.sql' | sort | while read -r migration; do
  printf "\\i '%s'\n" "$migration"
done > "$PRE_SQL"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$PRE_SQL" >/dev/null

"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001');
insert into public.projects(id,owner_id,name,research_type,priority)
values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Workspace test','CTI','MEDIUM');
insert into public.research_notes(id,project_id,author_id,title,content)
values ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Legacy note',E'first line\nsecond line');
SQL

"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/202608220052_notes_reports_workspace_v2.sql" >/dev/null

"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);

do $$
declare
  project_id constant uuid := '20000000-0000-4000-8000-000000000001';
  note_id constant uuid := '30000000-0000-4000-8000-000000000001';
  notes_root uuid;
  notes_child uuid;
  reports_root uuid;
  report_id uuid;
begin
  if not exists (
    select 1 from public.research_notes n
    where n.id=note_id
      and n.content=E'first line\nsecond line'
      and n.content_doc->>'type'='doc'
      and n.content_doc#>>'{attrs,version}'='1'
      and n.edit_revision=0
      and n.folder_id is null
  ) then
    raise exception 'legacy research note was not safely backfilled';
  end if;

  insert into public.workspace_folders(project_id,kind,name)
  values(project_id,'NOTES','Poland') returning id into notes_root;
  insert into public.workspace_folders(project_id,kind,parent_id,name)
  values(project_id,'NOTES',notes_root,'Energy') returning id into notes_child;
  insert into public.workspace_folders(project_id,kind,name)
  values(project_id,'REPORTS','Products') returning id into reports_root;

  update public.research_notes set folder_id=notes_child where id=note_id;
  if not exists(select 1 from public.research_notes where id=note_id and folder_id=notes_child) then
    raise exception 'note could not be placed in nested NOTES folder';
  end if;

  begin
    update public.research_notes set folder_id=reports_root where id=note_id;
    raise exception 'note accepted a REPORTS folder';
  exception when check_violation then
    null;
  end;

  begin
    update public.workspace_folders set parent_id=notes_child where id=notes_root;
    raise exception 'folder cycle was accepted';
  exception when check_violation then
    null;
  end;

  insert into public.reports(project_id,author_id,title,type,status,content,folder_id)
  values(
    project_id,
    '10000000-0000-4000-8000-000000000001',
    'Workspace report',
    'CTI',
    'DRAFT',
    '{"type":"doc","attrs":{"version":1},"content":[{"type":"paragraph"}]}'::jsonb,
    reports_root
  ) returning id into report_id;

  if not exists(select 1 from public.reports where id=report_id and draft_revision=0 and folder_id=reports_root) then
    raise exception 'report workspace defaults are invalid';
  end if;

  begin
    update public.reports set folder_id=notes_root where id=report_id;
    raise exception 'report accepted a NOTES folder';
  exception when check_violation then
    null;
  end;

  begin
    delete from public.workspace_folders where id=notes_root;
    raise exception 'non-empty folder was recursively deleted';
  exception when foreign_key_violation then
    null;
  end;
end $$;
SQL

echo 'Workspace V2 migration acceptance passed.'
