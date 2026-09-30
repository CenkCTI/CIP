#!/usr/bin/env bash
set -euo pipefail
command -v psql >/dev/null || { echo 'PostgreSQL 16+ psql is required'; exit 2; }
command -v createdb >/dev/null || { echo 'PostgreSQL createdb/dropdb are required'; exit 2; }
major=$(psql --version | sed -E 's/.* ([0-9]+).*/\1/'); (( major >= 16 )) || exit 2
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; DB="citem_source_reader_pdf_v2_$$"; PRE_SQL=$(mktemp); chmod 0644 "$PRE_SQL"
if [[ "$(id -un)" == "root" ]] && command -v runuser >/dev/null; then PSQL=(runuser -u postgres -- psql); CREATEDB=(runuser -u postgres -- createdb); DROPDB=(runuser -u postgres -- dropdb); else PSQL=(psql); CREATEDB=(createdb); DROPDB=(dropdb); fi
trap 'rm -f "$PRE_SQL"; "${DROPDB[@]}" --if-exists "$DB" >/dev/null 2>&1 || true' EXIT
"${CREATEDB[@]}" "$DB"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
do $$begin create role authenticated;exception when duplicate_object then null;end$$; do $$begin create role service_role bypassrls;exception when duplicate_object then null;end$$; do $$begin create role anon;exception when duplicate_object then null;end$$;
create schema extensions;create extension pgcrypto with schema extensions;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt()returns jsonb language sql stable as $$select '{}'::jsonb$$;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
create function storage.foldername(name text)returns text[] language sql immutable as $$select case when array_length(string_to_array(name,'/'),1)<=1 then '{}'::text[] else(string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]end$$;
create function storage.filename(name text)returns text language sql immutable as $$select(string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)]$$;
SQL
find "$ROOT/supabase/migrations" -maxdepth 1 -name '*.sql' ! -name '202609110053_investigation_direction_stage1.sql' ! -name '202609230054_investigation_collection_stage2.sql' ! -name '202609290055_source_reader_pdf_v2.sql' ! -name '202609290056_source_reader_pdf_v2_hardening.sql' ! -name '202609300057_timeline_stage3_workflow_v2.sql' ! -name '202609300058_stage3_processing_foundation.sql' | sort | while read -r f;do printf "\\i '%s'\n" "$f";done >"$PRE_SQL"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$PRE_SQL" >/dev/null
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/202609110053_investigation_direction_stage1.sql" >/dev/null
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
insert into auth.users(id)values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.projects(id,owner_id,name,research_type,priority)values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','One','CTI','MEDIUM'),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Two','CTI','MEDIUM');
insert into public.investigation_information_gaps(id,project_id,description,created_by)values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','One gap','10000000-0000-4000-8000-000000000001'),('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Two gap','10000000-0000-4000-8000-000000000002');
insert into public.sources(id,project_id,title,source_type,created_by)values('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','One PDF','TECHNICAL_REPORT','10000000-0000-4000-8000-000000000001'),('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Two PDF','TECHNICAL_REPORT','10000000-0000-4000-8000-000000000002'),('40000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','Other owned PDF','TECHNICAL_REPORT','10000000-0000-4000-8000-000000000001');
SQL
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/202609230054_investigation_collection_stage2.sql" >/dev/null
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
insert into public.source_assets(id,project_id,source_id,asset_role,state,original_filename,mime_type,size_bytes,sha256,storage_path,created_by,ready_at)values('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','ORIGINAL','READY','source.pdf','application/pdf',1024,repeat('a',64),'10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000001.pdf','10000000-0000-4000-8000-000000000001',now());
insert into public.source_assets(id,project_id,source_id,asset_role,state,original_filename,mime_type,size_bytes,sha256,storage_path,created_by,ready_at)values('50000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','ORIGINAL','READY','other.pdf','application/pdf',1024,repeat('d',64),'10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000003/50000000-0000-4000-8000-000000000003.pdf','10000000-0000-4000-8000-000000000001',now());
insert into public.source_annotations(id,project_id,source_id,asset_id,annotation_type,page_number,rects,comment,created_by)values('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','HIGHLIGHT',1,'[{"x":0.1,"y":0.1,"width":0.2,"height":0.03}]','Legacy','10000000-0000-4000-8000-000000000001');
SQL
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/202609290055_source_reader_pdf_v2.sql" >/dev/null
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/202609290056_source_reader_pdf_v2_hardening.sql" >/dev/null
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
do $test$
begin
  if (select geometry_version from public.source_annotations where id='60000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'legacy version';
  end if;
  if (select anchor_kind::text from public.source_annotations where id='60000000-0000-4000-8000-000000000001') <> 'LEGACY_SCREEN' then
    raise exception 'legacy remap';
  end if;
  if (select file_size_limit from storage.buckets where id='source-assets') <> 104857600 then
    raise exception 'bucket limit';
  end if;

  insert into public.source_assets(
    id,project_id,source_id,asset_role,state,original_filename,mime_type,size_bytes,
    sha256,storage_path,derived_from_asset_id,created_by,ready_at
  ) values (
    '70000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'ANNOTATED_EXPORT','READY','export.pdf','application/pdf',2048,repeat('b',64),
    '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/70000000-0000-4000-8000-000000000001.pdf',
    '50000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    now()
  );
end
$test$;

grant usage on schema public to authenticated;
grant select,insert,update,delete on public.projects,public.sources,public.source_assets,public.source_annotations,public.investigation_information_gaps,public.collection_requirements to authenticated;
grant select,insert,delete on public.source_annotation_fragments,public.source_annotation_gap_links,public.source_annotation_requirement_links to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);

do $test$
declare
  a uuid;
begin
  a := public.record_source_annotation_v2(
    '40000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'UNDERLINE',
    'TEXT',
    'APT28 targeted a diplomatic entity.',
    'Relevant',
    '[{"page_number":2,"page_width":612,"page_height":792,"page_rotation":0,"selected_text":"APT28 targeted a diplomatic entity.","quads":[{"x1":72,"y1":700,"x2":280,"y2":700,"x3":280,"y3":684,"x4":72,"y4":684}]}]'::jsonb,
    array['30000000-0000-4000-8000-000000000001']::uuid[],
    '{}'::uuid[]
  );

  if not exists(
    select 1 from public.source_annotations
    where id=a and geometry_version=2 and anchor_kind='TEXT'
  ) then
    raise exception 'v2 annotation';
  end if;

  if not exists(
    select 1 from public.source_annotation_fragments
    where annotation_id=a and anchor_kind='TEXT'
  ) then
    raise exception 'v2 fragment';
  end if;

  perform public.update_source_annotation_context_v2(
    '40000000-0000-4000-8000-000000000001',
    a,
    'Updated analyst note',
    array['30000000-0000-4000-8000-000000000001']::uuid[],
    '{}'::uuid[]
  );

  if (select comment from public.source_annotations where id=a) <> 'Updated analyst note' then
    raise exception 'atomic annotation update';
  end if;

  if not exists(
    select 1 from public.source_annotation_gap_links
    where annotation_id=a and gap_id='30000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'atomic annotation gap link';
  end if;

  begin
    insert into public.source_annotation_fragments(
      project_id,source_id,asset_id,annotation_id,page_number,anchor_kind,quads,
      page_width,page_height,page_rotation,created_by
    ) values (
      '20000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      a,3,'TEXT',
      '[{"x1":1,"y1":2,"x2":3,"y2":2,"x3":3,"y3":1,"x4":1,"y4":1}]'::jsonb,
      612,792,45,
      '10000000-0000-4000-8000-000000000001'
    );
    raise exception 'non-quarter-turn rotation unexpectedly accepted';
  exception when check_violation then
    null;
  end;
end
$test$;

do $test$
begin
  begin
    insert into public.source_assets(
      id,project_id,source_id,asset_role,state,original_filename,mime_type,size_bytes,
      sha256,storage_path,created_by,ready_at
    ) values (
      '71000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'ANNOTATED_EXPORT','READY','orphan.pdf','application/pdf',10,repeat('c',64),
      '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000001.pdf',
      '10000000-0000-4000-8000-000000000001',
      now()
    );
    raise exception 'orphan export unexpectedly accepted';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.source_assets(
      id,project_id,source_id,asset_role,state,original_filename,mime_type,size_bytes,
      sha256,storage_path,derived_from_asset_id,created_by,ready_at
    ) values (
      '71000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'ANNOTATED_EXPORT','READY','wrong-parent.pdf','application/pdf',10,repeat('e',64),
      '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000002.pdf',
      '50000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000001',
      now()
    );
    raise exception 'cross-source derivation unexpectedly accepted';
  exception when foreign_key_violation then
    null;
  end;

  begin
    insert into public.source_assets(
      id,project_id,source_id,asset_role,state,original_filename,mime_type,size_bytes,
      sha256,storage_path,created_by,ready_at
    ) values (
      '71000000-0000-4000-8000-000000000003',
      '20000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'ORIGINAL','READY','too-large.pdf','application/pdf',62914560,repeat('f',64),
      '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000003.pdf',
      '10000000-0000-4000-8000-000000000001',
      now()
    );
    raise exception 'oversized original unexpectedly accepted';
  exception when check_violation then
    null;
  end;
end
$test$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);

do $test$
begin
  if exists(
    select 1 from public.source_annotation_fragments
    where project_id='20000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'RLS';
  end if;
end
$test$;

reset role;
SQL

echo 'Source Reader PDF v2 migration acceptance passed.'
