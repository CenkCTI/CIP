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

find "$ROOT/supabase/migrations" -maxdepth 1 -name '*.sql'   ! -name '202609110053_investigation_direction_stage1.sql'   ! -name '202609230054_investigation_collection_stage2.sql'   ! -name '202609290055_source_reader_pdf_v2.sql'   ! -name '202609290056_source_reader_pdf_v2_hardening.sql'   ! -name '202609300057_timeline_stage3_workflow_v2.sql'   ! -name '202609300058_stage3_processing_foundation.sql'   ! -name '202609300059_stage3_processing_provenance_hardening.sql' ! -name '202610150060_stage3_source_claims.sql' ! -name '202610150061_stage3_source_claim_types.sql' ! -name '202610220064_copilot_investigation_memory.sql' ! -name '202610220065_copilot_memory_acl_hardening.sql' ! -name '202610220066_copilot_unified_investigation_rag.sql'   | sort | while read -r migration; do printf "\\i '%s'\n" "$migration"; done > "$PRE_SQL"

"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$PRE_SQL" >/dev/null
for migration in   202609110053_investigation_direction_stage1.sql   202609230054_investigation_collection_stage2.sql   202609290055_source_reader_pdf_v2.sql   202609290056_source_reader_pdf_v2_hardening.sql   202609300057_timeline_stage3_workflow_v2.sql   202609300058_stage3_processing_foundation.sql   202609300059_stage3_processing_provenance_hardening.sql   202610150060_stage3_source_claims.sql   202610150061_stage3_source_claim_types.sql
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
) values
 (
 '50000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000001',
 '40000000-0000-4000-8000-000000000001',
 'HIGHLIGHT',1,'[]','APT28 used 192.0.2.10.',
 '10000000-0000-4000-8000-000000000001'
 ),
 (
 '50000000-0000-4000-8000-000000000002',
 '20000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000001',
 '40000000-0000-4000-8000-000000000001',
 'HIGHLIGHT',2,'[]','A separate source passage.',
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

  insert into public.source_annotation_outputs(
    project_id,source_annotation_id,output_type,output_action,mapping_origin,
    target_label,attribution_claim_id,created_by
  ) values (
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'ATTRIBUTION_CLAIM','CREATED','SOURCE_EXPLICIT',
    'Source attribution claim · APT28',
    '80000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001'
  );

  begin
    insert into public.source_annotation_outputs(
      project_id,source_annotation_id,output_type,output_action,mapping_origin,
      target_label,attribution_claim_id,created_by
    ) values (
      '20000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      'ATTRIBUTION_CLAIM','LINKED','SOURCE_EXPLICIT',
      'mismatched claim',
      '80000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    );
    raise exception 'cross-annotation attribution claim unexpectedly accepted';
  exception when foreign_key_violation then null;
  end;

  delete from public.source_attribution_claims
  where id='80000000-0000-4000-8000-000000000001';

  if exists (
    select 1 from public.source_annotation_outputs
    where attribution_claim_id='80000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'attribution claim ledger row did not cascade on explicit claim deletion';
  end if;

  begin
    delete from public.source_annotations
    where id='50000000-0000-4000-8000-000000000001';
    raise exception 'provenance-bearing annotation unexpectedly deleted';
  exception when foreign_key_violation then null;
  end;
end
$test$;

grant usage on schema public to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);

do $claim_test$
declare
  v_claim uuid;
  v_assertion_one uuid;
  v_assertion_two uuid;
  v_result record;
begin
  select source_claim_id,assertion_id
  into v_claim,v_assertion_one
  from public.create_source_claim_from_annotation(
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'APT28 uses compromised routers as operational infrastructure.',
    'INFRASTRUCTURE',
    'ASSERTS',
    'we assess',
    'ANALYST_MAPPED'
  );

  if not exists(
    select 1 from public.source_claims
    where id=v_claim
      and project_id='20000000-0000-4000-8000-000000000001'
      and claim_kind='INFRASTRUCTURE'
  ) then
    raise exception 'source claim was not created';
  end if;

  if not exists(
    select 1 from public.source_claim_assertions
    where id=v_assertion_one
      and source_claim_id=v_claim
      and stance='ASSERTS'
      and source_qualifier='we assess'
      and assertion_action='CREATED'
  ) then
    raise exception 'source claim assertion was not created';
  end if;

  v_assertion_two := public.link_source_claim_from_annotation(
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002',
    v_claim,
    'DENIES',
    'no evidence of',
    'ANALYST_MAPPED'
  );

  if (
    select count(*) from public.source_claim_assertions
    where project_id='20000000-0000-4000-8000-000000000001'
      and source_claim_id=v_claim
  ) <> 2 then
    raise exception 'multiple source positions were not preserved';
  end if;

  perform public.update_source_claim_assertion(
    '20000000-0000-4000-8000-000000000001',
    v_assertion_two,
    'QUALIFIES',
    'only in a subset of cases',
    'ANALYST_MAPPED'
  );

  if not exists(
    select 1 from public.source_claim_assertions
    where id=v_assertion_two
      and stance='QUALIFIES'
      and source_qualifier='only in a subset of cases'
  ) then
    raise exception 'source position update failed';
  end if;

  select * into v_result
  from public.unlink_source_claim_assertion(
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    v_assertion_one
  );
  if v_result.deleted_claim then
    raise exception 'claim deleted while another source position remained';
  end if;

  select * into v_result
  from public.unlink_source_claim_assertion(
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002',
    v_assertion_two
  );
  if not v_result.deleted_claim then
    raise exception 'unsupported claim was not removed after final unlink';
  end if;
  if exists(select 1 from public.source_claims where id=v_claim) then
    raise exception 'orphan source claim remained';
  end if;
end
$claim_test$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);

do $rls_test$
begin
  if exists(
    select 1 from public.source_claims
    where project_id='20000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'source claim RLS leak';
  end if;

  begin
    perform public.create_source_claim_from_annotation(
      '20000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      'Cross-owner claim.',
      'OTHER',
      'ASSERTS',
      null,
      'SOURCE_EXPLICIT'
    );
    raise exception 'cross-owner source claim unexpectedly created';
  exception when others then
    if sqlerrm='cross-owner source claim unexpectedly created' then
      raise;
    end if;
  end;
end
$rls_test$;

reset role;
SQL

# The Copilot memory migration depends on sources, source_assets and the
# Stage 3 source processing schema. Apply it ONLY AFTER those prerequisites.
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" \
  -f "$ROOT/supabase/migrations/202610220064_copilot_investigation_memory.sql" >/dev/null
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" \
  -f "$ROOT/supabase/migrations/202610220065_copilot_memory_acl_hardening.sql" >/dev/null
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" \
  -f "$ROOT/supabase/migrations/202610220066_copilot_unified_investigation_rag.sql" >/dev/null

"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
do $acl$
begin
  if has_table_privilege('anon','public.copilot_memory_profiles','SELECT')
    or has_table_privilege('anon','public.copilot_memory_profiles','INSERT')
    or has_table_privilege('anon','public.copilot_memory_turns','SELECT')
    or has_table_privilege('anon','public.copilot_memory_turns','INSERT')
  then raise exception 'Anonymous role inherited Copilot memory privileges'; end if;
  if not has_table_privilege('authenticated','public.copilot_memory_profiles','SELECT')
    or not has_table_privilege('authenticated','public.copilot_memory_turns','INSERT')
  then raise exception 'Authenticated memory privileges are unavailable'; end if;
end $acl$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);

insert into public.copilot_memory_profiles (
  id,project_id,source_id,asset_id,owner_id,notes
) values (
  '90000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Analyst notes must not leak to other users.'
);
insert into public.copilot_memory_turns (
  project_id,profile_id,owner_id,question,mode,context,result
) values (
  '20000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'What is the operational objective?',
  'analyst','{"kind":"page","page":1}'::jsonb,
  '{"summary":"Tentative assessment."}'::jsonb
);

do $memory$
begin
  if (select count(*) from public.copilot_memory_profiles) <> 1 then
    raise exception 'owner cannot read memory profile';
  end if;
  if (select count(*) from public.copilot_memory_turns) <> 1 then
    raise exception 'owner cannot read memory turn';
  end if;
end $memory$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $memory$
begin
  if exists(select 1 from public.copilot_memory_profiles) or
     exists(select 1 from public.copilot_memory_turns) then
    raise exception 'copilot memory visible across owners';
  end if;
  begin
    insert into public.copilot_memory_profiles(
      project_id,source_id,asset_id,owner_id
    ) values (
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002'
    );
    raise exception 'cross-owner copilot memory insertion allowed';
  exception when insufficient_privilege then null;
  end;
end $memory$;
reset role;
SQL

"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
do $acl$
begin
 if has_table_privilege('anon','public.copilot_document_chunks','SELECT')
  or has_table_privilege('anon','public.copilot_investigation_events','SELECT')
  or has_function_privilege('anon','public.copilot_search_document_chunks(uuid,text,integer)','EXECUTE')
 then raise exception 'Anonymous investigation memory access';end if;
end $acl$;
-- Test-only Supabase scaffold: authenticated can resolve auth.uid() (production
-- Supabase already grants schema USAGE; this fixture must model that contract).
grant usage on schema auth to authenticated;
grant select on table public.source_assets to authenticated;
-- Trusted server workflow writes original-derived material before user read checks.
insert into public.copilot_document_indexes(id,project_id,source_id,asset_id,owner_id,asset_sha256,status,chunk_count,page_count,indexed_at)
values('91000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
'30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
'10000000-0000-4000-8000-000000000001',repeat('a',64),'READY',1,1,now());
insert into public.copilot_document_chunks(project_id,owner_id,index_id,source_id,asset_id,page_number,chunk_number,content)
values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
'91000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
'40000000-0000-4000-8000-000000000001',3,1,'ANSSI reports APT28 intrusion and intelligence collection.');
insert into public.copilot_investigation_events(project_id,owner_id,source_id,asset_id,kind,summary)
values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
'30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
'ANALYSE','Provisional source-grounded APT28 assessment.');
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $owner$ begin
 if (select count(*) from public.copilot_search_document_chunks(
 '20000000-0000-4000-8000-000000000001','APT28 strategic objective',10))<>1
 then raise exception 'Owner RAG evidence retrieval failed';end if;
 if (select count(*) from public.copilot_investigation_events)<>1
 then raise exception 'Owner timeline retrieval failed';end if;
end $owner$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $foreign$ begin
 if exists(select 1 from public.copilot_document_indexes) or
  exists(select 1 from public.copilot_document_chunks) or
  exists(select 1 from public.copilot_investigation_events)
 then raise exception 'Cross-owner RAG data exposure';end if;
 if exists(select 1 from public.copilot_search_document_chunks(
 '20000000-0000-4000-8000-000000000001','APT28',10))
 then raise exception 'Cross-owner search leak';end if;
end $foreign$;
reset role;
SQL

echo "Stage 3 processing foundation, Source Claim and Copilot unified memory migration tests passed."
