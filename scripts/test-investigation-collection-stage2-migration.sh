#!/usr/bin/env bash
set -euo pipefail

command -v psql >/dev/null || { echo 'PostgreSQL 16+ psql is required'; exit 2; }
command -v createdb >/dev/null || { echo 'PostgreSQL createdb/dropdb are required'; exit 2; }
major=$(psql --version | sed -E 's/.* ([0-9]+).*/\1/')
(( major >= 16 )) || { echo 'PostgreSQL 16+ is required'; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="citem_collection_stage2_$$"
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
create function storage.foldername(name text)returns text[] language sql immutable as $$
  select case
    when array_length(string_to_array(name,'/'),1) <= 1 then '{}'::text[]
    else (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]
  end
$$;
create function storage.filename(name text)returns text language sql immutable as $$
  select(string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)]
$$;
SQL

find "$ROOT/supabase/migrations" -maxdepth 1 -name '*.sql'   ! -name '202609110053_investigation_direction_stage1.sql'   ! -name '202609230054_investigation_collection_stage2.sql'   | sort | while read -r migration; do
    printf "\\i '%s'\n" "$migration"
  done > "$PRE_SQL"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$PRE_SQL" >/dev/null
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB"   -f "$ROOT/supabase/migrations/202609110053_investigation_direction_stage1.sql" >/dev/null

"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
insert into auth.users(id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');

insert into public.projects(id,owner_id,name,research_type,priority)
values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Collection owner one','CTI','MEDIUM'),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Collection owner two','CTI','MEDIUM');

insert into public.investigation_information_gaps(id,project_id,description,created_by)
values
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Owner one attribution basis is unknown.','10000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Owner two gap is unknown.','10000000-0000-4000-8000-000000000002');

insert into public.sources(id,project_id,title,source_type,created_by)
values
  ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Owner one source','TECHNICAL_REPORT','10000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Owner two source','TECHNICAL_REPORT','10000000-0000-4000-8000-000000000002');
SQL

"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB"   -f "$ROOT/supabase/migrations/202609230054_investigation_collection_stage2.sql" >/dev/null

"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
do $$
declare
  req uuid := '50000000-0000-4000-8000-000000000001';
  asset uuid := '60000000-0000-4000-8000-000000000001';
  ann uuid := '70000000-0000-4000-8000-000000000001';
begin
  insert into public.collection_requirements(
    id,project_id,requirement,rationale,priority,status,created_by
  ) values (
    req,
    '20000000-0000-4000-8000-000000000001',
    'Collect primary attribution material.',
    'Close the attribution information gap.',
    'HIGH',
    'COLLECTING',
    '10000000-0000-4000-8000-000000000001'
  );

  insert into public.collection_requirement_gap_links(
    project_id,requirement_id,gap_id,created_by
  ) values (
    '20000000-0000-4000-8000-000000000001',
    req,
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001'
  );

  begin
    insert into public.collection_requirement_gap_links(
      project_id,requirement_id,gap_id,created_by
    ) values (
      '20000000-0000-4000-8000-000000000001',
      req,
      '30000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001'
    );
    raise exception 'cross-project requirement gap link accepted';
  exception when foreign_key_violation then null;
  end;

  update public.sources
  set collection_rationale='Collected for attribution gap.'
  where id='40000000-0000-4000-8000-000000000001';

  insert into public.source_gap_links(project_id,source_id,gap_id,created_by)
  values(
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001'
  );

  insert into public.source_requirement_links(project_id,source_id,requirement_id,created_by)
  values(
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    req,
    '10000000-0000-4000-8000-000000000001'
  );

  begin
    insert into public.source_gap_links(project_id,source_id,gap_id,created_by)
    values(
      '20000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001'
    );
    raise exception 'cross-project source gap link accepted';
  exception when foreign_key_violation then null;
  end;

  insert into public.source_assets(
    id,project_id,source_id,asset_role,state,original_filename,mime_type,size_bytes,
    sha256,storage_path,created_by,ready_at
  ) values (
    asset,
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'ORIGINAL','READY','apt28.pdf','application/pdf',1024,
    repeat('a',64),
    '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001.pdf',
    '10000000-0000-4000-8000-000000000001',
    now()
  );

  insert into public.source_annotations(
    id,project_id,source_id,asset_id,annotation_type,page_number,rects,comment,created_by
  ) values (
    ann,
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    asset,
    'UNDERLINE',4,
    '[{"x":0.1,"y":0.2,"width":0.4,"height":0.03}]'::jsonb,
    'Trace this attribution claim.',
    '10000000-0000-4000-8000-000000000001'
  );

  insert into public.source_annotation_gap_links(project_id,annotation_id,gap_id,created_by)
  values(
    '20000000-0000-4000-8000-000000000001',
    ann,
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001'
  );

  if (select public from storage.buckets where id='source-assets') is distinct from false then
    raise exception 'source-assets bucket must remain private';
  end if;
  if (select file_size_limit from storage.buckets where id='source-assets') <> 52428800 then
    raise exception 'source-assets bucket size limit is wrong';
  end if;
end $$;

grant usage on schema public to authenticated;
grant select,insert,update,delete on public.projects to authenticated;
grant select,insert,update,delete on public.collection_requirements to authenticated;
grant select,insert,update,delete on public.collection_requirement_gap_links to authenticated;
grant select,insert,update,delete on public.source_requirement_links to authenticated;
grant select,insert,update,delete on public.source_gap_links to authenticated;
grant select,insert,update,delete on public.source_notes to authenticated;
grant select,insert,update,delete on public.source_assets to authenticated;
grant select,insert,update,delete on public.source_annotations to authenticated;
grant select,insert,update,delete on public.source_annotation_gap_links to authenticated;
grant select,insert,update,delete on public.source_annotation_requirement_links to authenticated;
grant select,insert,update,delete on public.source_export_events to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);

do $$
begin
  if (select count(*) from public.collection_requirements) <> 1 then
    raise exception 'owner cannot read own collection requirement';
  end if;
  if not public.source_storage_project_is_owned('20000000-0000-4000-8000-000000000001') then
    raise exception 'source storage ownership helper rejected owner';
  end if;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);

do $$
begin
  if (select count(*) from public.collection_requirements where project_id='20000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'RLS exposed another owner collection requirements';
  end if;
  if (select count(*) from public.source_assets where project_id='20000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'RLS exposed another owner source assets';
  end if;
  if public.source_storage_project_is_owned('20000000-0000-4000-8000-000000000001') then
    raise exception 'source storage ownership helper accepted another owner';
  end if;
end $$;
reset role;
SQL

echo 'Investigation Collection Stage 2 migration acceptance passed.'
