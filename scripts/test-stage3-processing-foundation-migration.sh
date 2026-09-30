#!/usr/bin/env bash
set -euo pipefail

command -v psql >/dev/null || { echo 'PostgreSQL 16+ psql is required'; exit 2; }
command -v createdb >/dev/null || { echo 'PostgreSQL createdb/dropdb are required'; exit 2; }
major=$(psql --version | sed -E 's/.* ([0-9]+).*/\1/')
(( major >= 16 )) || { echo 'PostgreSQL 16+ is required'; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="citem_stage3_processing_$$"
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
  select case when array_length(string_to_array(name,'/'),1)<=1 then '{}'::text[]
    else(string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] end
$$;
create function storage.filename(name text)returns text language sql immutable as $$
  select(string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)]
$$;
SQL

find "$ROOT/supabase/migrations" -maxdepth 1 -name '*.sql'   ! -name '202609110053_investigation_direction_stage1.sql'   ! -name '202609230054_investigation_collection_stage2.sql'   ! -name '202609290055_source_reader_pdf_v2.sql'   ! -name '202609290056_source_reader_pdf_v2_hardening.sql'   ! -name '202609300057_timeline_stage3_workflow_v2.sql'   ! -name '202609300058_stage3_processing_foundation.sql'   | sort | while read -r migration; do printf "\\i '%s'\n" "$migration"; done > "$PRE_SQL"

"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$PRE_SQL" >/dev/null
for migration in   202609110053_investigation_direction_stage1.sql   202609230054_investigation_collection_stage2.sql   202609290055_source_reader_pdf_v2.sql   202609290056_source_reader_pdf_v2_hardening.sql   202609300057_timeline_stage3_workflow_v2.sql   202609300058_stage3_processing_foundation.sql
do
  "${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/$migration" >/dev/null
done

"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
insert into auth.users(id) values
 ('10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002');

insert into public.projects(id,owner_id,name,research_type,priority) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Stage3 one','CTI','MEDIUM'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Stage3 two','CTI','MEDIUM');

insert into public.sources(id,project_id,title,source_type,created_by) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Source one','TECHNICAL_REPORT','10000000-0000-4000-8000-000000000001');

insert into public.source_assets(
 id,project_id,source_id,asset_role,state,original_filename,mime_type,size_bytes,sha256,storage_path,created_by,ready_at
) values (
 '40000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000001',
 'ORIGINAL','READY','source.pdf','application/pdf',100,repeat('a',64),'u/p/s.pdf',
 '10000000-0000-4000-8000-000000000001',now()
);

insert into public.source_annotations(
 id,project_id,source_id,asset_id,annotation_type,page_number,rects,selected_text,created_by
) values (
 '50000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000001',
 '40000000-0000-4000-8000-000000000001',
 'HIGHLIGHT',1,'[]','APT28 used 192.0.2.10.',
 '10000000-0000-4000-8000-000000000001'
);

insert into public.indicators(id,project_id,value,type,confidence) values
 ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','192.0.2.10','IP','MEDIUM');

insert into public.threat_actors(id,project_id,name) values
 ('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','APT28');

do $test$
begin
  if (select processing_state::text from public.source_annotations
      where id='50000000-0000-4000-8000-000000000001') <> 'UNPROCESSED' then
    raise exception 'default processing state';
  end if;

  begin
    update public.source_annotations
    set processing_state='PROCESSED'
    where id='50000000-0000-4000-8000-000000000001';
    raise exception 'inconsistent processing state unexpectedly accepted';
  exception when check_violation then null;
  end;

  update public.source_annotations
  set processing_state='PROCESSED',processed_at=now(),
      processed_by='10000000-0000-4000-8000-000000000001'
  where id='50000000-0000-4000-8000-000000000001';

  insert into public.source_annotation_outputs(
    project_id,source_annotation_id,output_type,output_action,mapping_origin,target_label,
    raw_value,normalized_value,indicator_id,created_by
  ) values (
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'INDICATOR','LINKED','SOURCE_EXPLICIT','IP · 192.0.2.10',
    'APT28 used 192.0.2.10.','192.0.2.10',
    '60000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001'
  );

  begin
    insert into public.source_annotation_outputs(
      project_id,source_annotation_id,output_type,output_action,target_label,
      indicator_id,threat_actor_id,created_by
    ) values (
      '20000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      'INDICATOR','LINKED','bad',
      '60000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    );
    raise exception 'multi-target output unexpectedly accepted';
  exception when check_violation then null;
  end;

  insert into public.source_attribution_claims(
    id,project_id,source_annotation_id,claim_summary,claimed_actor_text,
    canonical_threat_actor_id,mapping_origin,created_by
  ) values (
    '80000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'The source attributes the activity to APT28.','APT28',
    '70000000-0000-4000-8000-000000000001',
    'SOURCE_EXPLICIT',
    '10000000-0000-4000-8000-000000000001'
  );
end
$test$;
SQL

echo "Stage 3 processing foundation migration tests passed."
