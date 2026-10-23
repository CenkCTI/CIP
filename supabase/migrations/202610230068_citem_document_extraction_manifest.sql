-- Phase A: trustworthy original-PDF derived page snapshots and forward-only
-- versioned index publication. Migration 066/067 and original Storage stay intact.
-- Apply before deploying the Phase A indexer; do NOT backfill or mark legacy
-- READY rows as trusted by default.
create table public.copilot_document_extraction_runs (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 index_id uuid not null,
 source_id uuid not null,
 asset_id uuid not null,
 asset_sha256 text not null check(asset_sha256 ~ '^[a-f0-9]{64}$'),
 original_filename text,
 original_mime_type text,
 original_size_bytes bigint check(original_size_bytes between 0 and 52428800),
 extractor_version text not null check(char_length(extractor_version) between 1 and 120),
 chunking_version text not null check(char_length(chunking_version) between 1 and 120),
 index_version text not null check(char_length(index_version) between 1 and 120),
 extraction_fingerprint text not null check(extraction_fingerprint ~ '^[a-f0-9]{64}$'),
 document_language text not null default 'unknown'
   check(document_language in ('fr','en','tr','mixed','unknown')),
 language_method text not null default 'heuristic_unverified'
   check(language_method in ('heuristic_unverified','analyst_approved')),
 document_title text,report_reference text,publication_date date,publisher text,
 tlp_marking text,
 metadata_candidates jsonb not null default '[]'::jsonb
   check(jsonb_typeof(metadata_candidates)='array' and octet_length(metadata_candidates::text)<=16000),
 quality_status text not null check(quality_status in ('COMPLETE','REVIEW_REQUIRED')),
 quality_flags jsonb not null default '[]'::jsonb
   check(jsonb_typeof(quality_flags)='array' and octet_length(quality_flags::text)<=4000),
 page_count integer not null check(page_count between 1 and 200),
 pages_with_text integer not null check(pages_with_text between 0 and 200),
 pages_without_text integer not null check(pages_without_text between 0 and 200),
 created_at timestamptz not null default now(),
 completed_at timestamptz not null default now(),
 unique(project_id,id,owner_id),
 foreign key(project_id,index_id,owner_id)
   references public.copilot_document_indexes(project_id,id,owner_id) on delete cascade,
 foreign key(project_id,source_id,asset_id)
   references public.source_assets(project_id,source_id,id) on delete cascade,
 check(pages_with_text+pages_without_text=page_count)
);
create index copilot_document_extraction_runs_asset
 on public.copilot_document_extraction_runs(project_id,owner_id,asset_id,created_at desc);

create table public.copilot_document_extracted_pages (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 extraction_run_id uuid not null,
 page_number integer not null check(page_number between 1 and 200),
 original_text text not null check(char_length(original_text) between 1 and 50000),
 search_text text not null check(char_length(search_text)<=50000),
 original_text_sha256 text not null check(original_text_sha256 ~ '^[a-f0-9]{64}$'),
 extractor text not null check(extractor in ('pdfjs','poppler','ocr')),
 section_type text not null check(section_type in ('COVER','TABLE_OF_CONTENTS','BIBLIOGRAPHY','BODY')),
 quality_flags jsonb not null default '[]'::jsonb
   check(jsonb_typeof(quality_flags)='array' and octet_length(quality_flags::text)<=3000),
 unique(extraction_run_id,page_number),
 foreign key(project_id,extraction_run_id,owner_id)
  references public.copilot_document_extraction_runs(project_id,id,owner_id) on delete cascade
);
create index copilot_document_extracted_pages_order
 on public.copilot_document_extracted_pages(project_id,owner_id,extraction_run_id,page_number);

alter table public.copilot_document_indexes
 add column extractor_version text,
 add column chunking_version text,
 add column index_version text,
 add column extraction_fingerprint text
  check(extraction_fingerprint is null or extraction_fingerprint ~ '^[a-f0-9]{64}$'),
 add column quality_status text
  check(quality_status is null or quality_status in ('COMPLETE','REVIEW_REQUIRED')),
 add column quality_flags jsonb not null default '[]'::jsonb
  check(jsonb_typeof(quality_flags)='array'),
 add column extraction_run_id uuid,
 add column completed_at timestamptz,
 add constraint copilot_document_indexes_extraction_run_fk
  foreign key(project_id,extraction_run_id,owner_id)
  references public.copilot_document_extraction_runs(project_id,id,owner_id);

alter table public.copilot_document_chunks
 add column extraction_run_id uuid,
 add column content_sha256 text
  check(content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
 add column search_text text check(search_text is null or char_length(search_text)<=2200),
 add column search_fts tsvector generated always as
  (to_tsvector('simple'::regconfig,coalesce(search_text,''))) stored,
 add column extractor_version text,
 add column chunking_version text,
 add column section_type text
  check(section_type is null or section_type in
   ('COVER','TABLE_OF_CONTENTS','BIBLIOGRAPHY','BODY')),
 add column document_language text
  check(document_language is null or document_language in ('fr','en','tr','mixed','unknown')),
 add constraint copilot_document_chunks_run_fk
  foreign key(project_id,extraction_run_id,owner_id)
  references public.copilot_document_extraction_runs(project_id,id,owner_id);

create index copilot_document_chunks_search_alias
 on public.copilot_document_chunks using gin(search_fts);

alter table public.copilot_document_extraction_runs enable row level security;
alter table public.copilot_document_extracted_pages enable row level security;
revoke all on public.copilot_document_extraction_runs,
 public.copilot_document_extracted_pages from public,anon,authenticated;
grant select on public.copilot_document_extraction_runs,
 public.copilot_document_extracted_pages to authenticated;
-- Derived text can be published by trusted server RPC; no end-user writes.
grant select,insert on public.copilot_document_extraction_runs,
 public.copilot_document_extracted_pages to service_role;
create policy copilot_extraction_runs_owner_read on public.copilot_document_extraction_runs
 for select to authenticated
 using(owner_id=(select auth.uid()) and public.project_is_owned(project_id));
create policy copilot_extracted_pages_owner_read on public.copilot_document_extracted_pages
 for select to authenticated
 using(owner_id=(select auth.uid()) and public.project_is_owned(project_id));

-- PDF extracted-original pages are immutable snapshots (no UPDATE grants).
-- Deleting the owner/project/source still cascades derived data as expected.
-- All validation, snapshot insert, chunk metadata enrichment and READY flag
-- are one database transaction through this RPC. Failure rolls everything back.
create function public.copilot_publish_document_index_v3(
 p_index_id uuid,p_claim_token uuid,p_project_id uuid,p_owner_id uuid,
 p_source_id uuid,p_asset_id uuid,p_sha text,p_page_count integer,
 p_chunks jsonb,p_pages jsonb,p_fingerprint text,p_extractor_version text,
 p_chunking_version text,p_index_version text,p_language text,
 p_quality_status text,p_quality_flags jsonb)
returns boolean language plpgsql security invoker set search_path=''
as $fn$
declare
 v_run_id uuid;
 v_inserted integer;
 v_expected integer;
 v_chunks_updated integer;
 v_computed_fingerprint text;
begin
 if p_quality_status<>'COMPLETE' or p_quality_flags<>'[]'::jsonb
   or p_index_version<>'CITEM-PDF-INDEX-A1-20261023'
   or p_fingerprint !~ '^[a-f0-9]{64}$'
   or p_extractor_version is null or char_length(p_extractor_version)>120
   or p_chunking_version is null or char_length(p_chunking_version)>120
   or p_language not in ('fr','en','tr','mixed','unknown')
   or p_pages is null or jsonb_typeof(p_pages)<>'array'
   or octet_length(p_pages::text)>5500000
   or p_page_count not between 1 and 200
   or jsonb_array_length(p_pages)<>p_page_count
 then return false; end if;
 -- Strict page IDs, clean source text, exact full coverage. OCR-derived
 -- pages cannot silently become verified exact-quotation evidence.
 if exists(
   select 1 from jsonb_to_recordset(p_pages) as x(
     page_number integer,original_text text,search_text text,
     original_text_sha256 text,extractor text,section_type text,
     quality_flags jsonb)
   where x.page_number is null or x.page_number not between 1 and p_page_count
    or x.original_text is null or char_length(x.original_text) not between 1 and 50000
    or x.search_text is null or char_length(x.search_text)>50000
    or x.original_text_sha256 !~ '^[a-f0-9]{64} not in ('pdfjs','poppler')
    or x.section_type not in ('COVER','TABLE_OF_CONTENTS','BIBLIOGRAPHY','BODY')
    or x.quality_flags is null or x.quality_flags<>'[]'::jsonb
 ) then return false; end if;
 if (select count(distinct x.page_number) from
   jsonb_to_recordset(p_pages) as x(page_number integer))<>p_page_count
 then return false; end if;
 -- Recompute the page-order fingerprint from the exact extracted original
 -- bytes, including the page number and NUL separators used by Node.js.
 select encode(sha256(string_agg(
  convert_to(x.page_number::text,'UTF8') || '\x00'::bytea ||
  convert_to(x.original_text,'UTF8') || '\x00'::bytea,
  ''::bytea order by x.page_number)), 'hex')
 into v_computed_fingerprint
 from jsonb_to_recordset(p_pages) as x(page_number integer,original_text text);
 if v_computed_fingerprint is distinct from p_fingerprint then return false; end if;
 if p_chunks is null or jsonb_typeof(p_chunks)<>'array'
   or octet_length(p_chunks::text)>2400000 then return false; end if;
 v_expected:=jsonb_array_length(p_chunks);
 if v_expected<1 or v_expected>1500 then return false; end if;
 if exists(
  select 1 from jsonb_to_recordset(p_chunks) as x(
   page_number integer,chunk_number integer,content text,
   content_sha256 text,search_text text,section_type text)
  where x.content_sha256 !~ '^[a-f0-9]{64} is null or char_length(x.search_text)>2200
   or x.section_type not in ('COVER','TABLE_OF_CONTENTS','BIBLIOGRAPHY','BODY')
 ) then return false; end if;
 -- v2 validates claim token, live source SHA, chunk/page coverage and publishes
 -- atomically. A later SQL error in this v3 call rolls the v2 changes back too.
 if not public.copilot_publish_document_index_v2(
  p_index_id,p_claim_token,p_project_id,p_owner_id,
  p_source_id,p_asset_id,p_sha,p_page_count,p_chunks)
 then return false; end if;
 insert into public.copilot_document_extraction_runs(
  project_id,owner_id,index_id,source_id,asset_id,asset_sha256,
  original_filename,original_mime_type,original_size_bytes,
  extractor_version,chunking_version,index_version,extraction_fingerprint,
  document_language,language_method,metadata_candidates,quality_status,
  quality_flags,page_count,pages_with_text,pages_without_text)
 select p_project_id,p_owner_id,p_index_id,p_source_id,p_asset_id,p_sha,
  a.original_filename,a.mime_type,a.size_bytes,
  p_extractor_version,p_chunking_version,p_index_version,p_fingerprint,
  p_language,'heuristic_unverified','[]'::jsonb,'COMPLETE','[]'::jsonb,
  p_page_count,p_page_count,0
 from public.source_assets a
 where a.id=p_asset_id and a.source_id=p_source_id and a.project_id=p_project_id
  and a.sha256=p_sha and a.asset_role='ORIGINAL' and a.state='READY'
 returning id into v_run_id;
 if v_run_id is null then raise exception 'source changed during publish'; end if;
 insert into public.copilot_document_extracted_pages(
  project_id,owner_id,extraction_run_id,page_number,original_text,search_text,
  original_text_sha256,extractor,section_type,quality_flags)
 select p_project_id,p_owner_id,v_run_id,x.page_number,
  x.original_text,x.search_text,x.original_text_sha256,x.extractor,
  x.section_type,x.quality_flags
 from jsonb_to_recordset(p_pages) as x(
  page_number integer,original_text text,search_text text,
  original_text_sha256 text,extractor text,section_type text,quality_flags jsonb);
 get diagnostics v_inserted=row_count;
 if v_inserted<>p_page_count then raise exception 'page snapshot count mismatch'; end if;
 update public.copilot_document_chunks c set
  extraction_run_id=v_run_id,
  content_sha256=x.content_sha256,
  search_text=x.search_text,
  extractor_version=p_extractor_version,
  chunking_version=p_chunking_version,
  section_type=x.section_type,
  document_language=p_language
 from jsonb_to_recordset(p_chunks) as x(
  page_number integer,chunk_number integer,content text,
  content_sha256 text,search_text text,section_type text)
 where c.index_id=p_index_id and c.project_id=p_project_id and
  c.owner_id=p_owner_id and c.page_number=x.page_number and
  c.chunk_number=x.chunk_number and c.content=x.content;
 get diagnostics v_chunks_updated=row_count;
 if v_chunks_updated<>v_expected then
  raise exception 'chunk provenance mismatch';
 end if;
 update public.copilot_document_indexes set
  extractor_version=p_extractor_version,
  chunking_version=p_chunking_version,
  index_version=p_index_version,
  extraction_fingerprint=p_fingerprint,
  quality_status='COMPLETE',quality_flags='[]'::jsonb,
  extraction_run_id=v_run_id,completed_at=now()
 where id=p_index_id and project_id=p_project_id and
  owner_id=p_owner_id and status='READY' and
  asset_sha256=p_sha;
 if not found then raise exception 'index publication lost'; end if;
 return true;
end $fn$;
revoke all on function public.copilot_publish_document_index_v3(
 uuid,uuid,uuid,uuid,uuid,uuid,text,integer,jsonb,jsonb,text,text,text,text,text,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.copilot_publish_document_index_v3(
 uuid,uuid,uuid,uuid,uuid,uuid,text,integer,jsonb,jsonb,text,text,text,text,text,text,jsonb)
 to service_role;

-- Legacy 066/067 READY rows are not upgraded by assertion. They become
-- searchable only after exact original SHA has passed the v3 quality pipeline.
create or replace function public.copilot_search_document_chunks(
 p_project_id uuid,p_question text,p_limit integer default 10)
returns table(source_id uuid,asset_id uuid,page_number integer,chunk_number integer,content text,score real)
language plpgsql security invoker set search_path=''
as $fn$
declare q tsquery; w text; n integer:=0;
begin
 if (select auth.uid()) is null or not public.project_is_owned(p_project_id)
  or char_length(p_question)>1000 or p_limit<1 or p_limit>20 then return; end if;
 for w in
  select distinct word from regexp_split_to_table(lower(p_question),'[^[:alnum:]]+') word
   where length(word)>=3 order by word limit 16
 loop
  if n=0 then q:=plainto_tsquery('simple',w);
  else q:=q || plainto_tsquery('simple',w); end if;
  n:=n+1;
 end loop;
 if n=0 or q is null or numnode(q)=0 then return; end if;
 return query
 with scored as (
  select c.source_id,c.asset_id,c.page_number,c.chunk_number,c.content,
   greatest(ts_rank_cd(c.fts,q),ts_rank_cd(c.search_fts,q)) as relevance,
   row_number() over(partition by c.asset_id
    order by greatest(ts_rank_cd(c.fts,q),ts_rank_cd(c.search_fts,q)) desc,c.page_number,c.chunk_number) as by_asset
  from public.copilot_document_chunks c
  join public.copilot_document_indexes i on i.id=c.index_id
  join public.source_assets a on a.id=c.asset_id and a.project_id=c.project_id
  where c.project_id=p_project_id and c.owner_id=(select auth.uid())
   and i.owner_id=c.owner_id and i.status='READY'
   and i.quality_status='COMPLETE'
   and i.index_version='CITEM-PDF-INDEX-A1-20261023'
   and i.extraction_run_id=c.extraction_run_id
   and i.extraction_run_id is not null
   and i.asset_sha256=a.sha256 and a.state='READY' and a.asset_role='ORIGINAL'
   and (c.fts @@ q or c.search_fts @@ q)
 )
 select s.source_id,s.asset_id,s.page_number,s.chunk_number,s.content,
  s.relevance::real as score from scored s where s.by_asset<=4
 order by s.relevance desc,s.page_number,s.chunk_number limit p_limit;
end $fn$;
revoke all on function public.copilot_search_document_chunks(uuid,text,integer)
 from public,anon;
grant execute on function public.copilot_search_document_chunks(uuid,text,integer)
 to authenticated;

    or x.original_text_sha256<>encode(sha256(convert_to(x.original_text,'UTF8')),'hex')
    or x.extractor not in ('pdfjs','poppler')
    or x.section_type not in ('COVER','TABLE_OF_CONTENTS','BIBLIOGRAPHY','BODY')
    or x.quality_flags is null or x.quality_flags<>'[]'::jsonb
 ) then return false; end if;
 if (select count(distinct x.page_number) from
   jsonb_to_recordset(p_pages) as x(page_number integer))<>p_page_count
 then return false; end if;
 if p_chunks is null or jsonb_typeof(p_chunks)<>'array'
   or octet_length(p_chunks::text)>2400000 then return false; end if;
 v_expected:=jsonb_array_length(p_chunks);
 if v_expected<1 or v_expected>1500 then return false; end if;
 if exists(
  select 1 from jsonb_to_recordset(p_chunks) as x(
   page_number integer,chunk_number integer,content text,
   content_sha256 text,search_text text,section_type text)
  where x.content_sha256 !~ '^[a-f0-9]{64}$'
   or x.search_text is null or char_length(x.search_text)>2200
   or x.section_type not in ('COVER','TABLE_OF_CONTENTS','BIBLIOGRAPHY','BODY')
 ) then return false; end if;
 -- v2 validates claim token, live source SHA, chunk/page coverage and publishes
 -- atomically. A later SQL error in this v3 call rolls the v2 changes back too.
 if not public.copilot_publish_document_index_v2(
  p_index_id,p_claim_token,p_project_id,p_owner_id,
  p_source_id,p_asset_id,p_sha,p_page_count,p_chunks)
 then return false; end if;
 insert into public.copilot_document_extraction_runs(
  project_id,owner_id,index_id,source_id,asset_id,asset_sha256,
  original_filename,original_mime_type,original_size_bytes,
  extractor_version,chunking_version,index_version,extraction_fingerprint,
  document_language,language_method,metadata_candidates,quality_status,
  quality_flags,page_count,pages_with_text,pages_without_text)
 select p_project_id,p_owner_id,p_index_id,p_source_id,p_asset_id,p_sha,
  a.original_filename,a.mime_type,a.size_bytes,
  p_extractor_version,p_chunking_version,p_index_version,p_fingerprint,
  p_language,'heuristic_unverified','[]'::jsonb,'COMPLETE','[]'::jsonb,
  p_page_count,p_page_count,0
 from public.source_assets a
 where a.id=p_asset_id and a.source_id=p_source_id and a.project_id=p_project_id
  and a.sha256=p_sha and a.asset_role='ORIGINAL' and a.state='READY'
 returning id into v_run_id;
 if v_run_id is null then raise exception 'source changed during publish'; end if;
 insert into public.copilot_document_extracted_pages(
  project_id,owner_id,extraction_run_id,page_number,original_text,search_text,
  original_text_sha256,extractor,section_type,quality_flags)
 select p_project_id,p_owner_id,v_run_id,x.page_number,
  x.original_text,x.search_text,x.original_text_sha256,x.extractor,
  x.section_type,x.quality_flags
 from jsonb_to_recordset(p_pages) as x(
  page_number integer,original_text text,search_text text,
  original_text_sha256 text,extractor text,section_type text,quality_flags jsonb);
 get diagnostics v_inserted=row_count;
 if v_inserted<>p_page_count then raise exception 'page snapshot count mismatch'; end if;
 update public.copilot_document_chunks c set
  extraction_run_id=v_run_id,
  content_sha256=x.content_sha256,
  search_text=x.search_text,
  extractor_version=p_extractor_version,
  chunking_version=p_chunking_version,
  section_type=x.section_type,
  document_language=p_language
 from jsonb_to_recordset(p_chunks) as x(
  page_number integer,chunk_number integer,content text,
  content_sha256 text,search_text text,section_type text)
 where c.index_id=p_index_id and c.project_id=p_project_id and
  c.owner_id=p_owner_id and c.page_number=x.page_number and
  c.chunk_number=x.chunk_number and c.content=x.content;
 get diagnostics v_chunks_updated=row_count;
 if v_chunks_updated<>v_expected then
  raise exception 'chunk provenance mismatch';
 end if;
 update public.copilot_document_indexes set
  extractor_version=p_extractor_version,
  chunking_version=p_chunking_version,
  index_version=p_index_version,
  extraction_fingerprint=p_fingerprint,
  quality_status='COMPLETE',quality_flags='[]'::jsonb,
  extraction_run_id=v_run_id,completed_at=now()
 where id=p_index_id and project_id=p_project_id and
  owner_id=p_owner_id and status='READY' and
  asset_sha256=p_sha;
 if not found then raise exception 'index publication lost'; end if;
 return true;
end $fn$;
revoke all on function public.copilot_publish_document_index_v3(
 uuid,uuid,uuid,uuid,uuid,uuid,text,integer,jsonb,jsonb,text,text,text,text,text,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.copilot_publish_document_index_v3(
 uuid,uuid,uuid,uuid,uuid,uuid,text,integer,jsonb,jsonb,text,text,text,text,text,text,jsonb)
 to service_role;

-- Legacy 066/067 READY rows are not upgraded by assertion. They become
-- searchable only after exact original SHA has passed the v3 quality pipeline.
create or replace function public.copilot_search_document_chunks(
 p_project_id uuid,p_question text,p_limit integer default 10)
returns table(source_id uuid,asset_id uuid,page_number integer,chunk_number integer,content text,score real)
language plpgsql security invoker set search_path=''
as $fn$
declare q tsquery; w text; n integer:=0;
begin
 if (select auth.uid()) is null or not public.project_is_owned(p_project_id)
  or char_length(p_question)>1000 or p_limit<1 or p_limit>20 then return; end if;
 for w in
  select distinct word from regexp_split_to_table(lower(p_question),'[^[:alnum:]]+') word
   where length(word)>=3 order by word limit 16
 loop
  if n=0 then q:=plainto_tsquery('simple',w);
  else q:=q || plainto_tsquery('simple',w); end if;
  n:=n+1;
 end loop;
 if n=0 or q is null or numnode(q)=0 then return; end if;
 return query
 with scored as (
  select c.source_id,c.asset_id,c.page_number,c.chunk_number,c.content,
   greatest(ts_rank_cd(c.fts,q),ts_rank_cd(c.search_fts,q)) as relevance,
   row_number() over(partition by c.asset_id
    order by greatest(ts_rank_cd(c.fts,q),ts_rank_cd(c.search_fts,q)) desc,c.page_number,c.chunk_number) as by_asset
  from public.copilot_document_chunks c
  join public.copilot_document_indexes i on i.id=c.index_id
  join public.source_assets a on a.id=c.asset_id and a.project_id=c.project_id
  where c.project_id=p_project_id and c.owner_id=(select auth.uid())
   and i.owner_id=c.owner_id and i.status='READY'
   and i.quality_status='COMPLETE'
   and i.index_version='CITEM-PDF-INDEX-A1-20261023'
   and i.extraction_run_id=c.extraction_run_id
   and i.extraction_run_id is not null
   and i.asset_sha256=a.sha256 and a.state='READY' and a.asset_role='ORIGINAL'
   and c.fts @@ q
 )
 select s.source_id,s.asset_id,s.page_number,s.chunk_number,s.content,
  s.relevance::real as score from scored s where s.by_asset<=4
 order by s.relevance desc,s.page_number,s.chunk_number limit p_limit;
end $fn$;
revoke all on function public.copilot_search_document_chunks(uuid,text,integer)
 from public,anon;
grant execute on function public.copilot_search_document_chunks(uuid,text,integer)
 to authenticated;

   or x.content_sha256<>encode(sha256(convert_to(x.content,'UTF8')),'hex')
   or x.search_text is null or char_length(x.search_text)>2200
   or x.section_type not in ('COVER','TABLE_OF_CONTENTS','BIBLIOGRAPHY','BODY')
 ) then return false; end if;
 -- v2 validates claim token, live source SHA, chunk/page coverage and publishes
 -- atomically. A later SQL error in this v3 call rolls the v2 changes back too.
 if not public.copilot_publish_document_index_v2(
  p_index_id,p_claim_token,p_project_id,p_owner_id,
  p_source_id,p_asset_id,p_sha,p_page_count,p_chunks)
 then return false; end if;
 insert into public.copilot_document_extraction_runs(
  project_id,owner_id,index_id,source_id,asset_id,asset_sha256,
  original_filename,original_mime_type,original_size_bytes,
  extractor_version,chunking_version,index_version,extraction_fingerprint,
  document_language,language_method,metadata_candidates,quality_status,
  quality_flags,page_count,pages_with_text,pages_without_text)
 select p_project_id,p_owner_id,p_index_id,p_source_id,p_asset_id,p_sha,
  a.original_filename,a.mime_type,a.size_bytes,
  p_extractor_version,p_chunking_version,p_index_version,p_fingerprint,
  p_language,'heuristic_unverified','[]'::jsonb,'COMPLETE','[]'::jsonb,
  p_page_count,p_page_count,0
 from public.source_assets a
 where a.id=p_asset_id and a.source_id=p_source_id and a.project_id=p_project_id
  and a.sha256=p_sha and a.asset_role='ORIGINAL' and a.state='READY'
 returning id into v_run_id;
 if v_run_id is null then raise exception 'source changed during publish'; end if;
 insert into public.copilot_document_extracted_pages(
  project_id,owner_id,extraction_run_id,page_number,original_text,search_text,
  original_text_sha256,extractor,section_type,quality_flags)
 select p_project_id,p_owner_id,v_run_id,x.page_number,
  x.original_text,x.search_text,x.original_text_sha256,x.extractor,
  x.section_type,x.quality_flags
 from jsonb_to_recordset(p_pages) as x(
  page_number integer,original_text text,search_text text,
  original_text_sha256 text,extractor text,section_type text,quality_flags jsonb);
 get diagnostics v_inserted=row_count;
 if v_inserted<>p_page_count then raise exception 'page snapshot count mismatch'; end if;
 update public.copilot_document_chunks c set
  extraction_run_id=v_run_id,
  content_sha256=x.content_sha256,
  search_text=x.search_text,
  extractor_version=p_extractor_version,
  chunking_version=p_chunking_version,
  section_type=x.section_type,
  document_language=p_language
 from jsonb_to_recordset(p_chunks) as x(
  page_number integer,chunk_number integer,content text,
  content_sha256 text,search_text text,section_type text)
 where c.index_id=p_index_id and c.project_id=p_project_id and
  c.owner_id=p_owner_id and c.page_number=x.page_number and
  c.chunk_number=x.chunk_number and c.content=x.content;
 get diagnostics v_chunks_updated=row_count;
 if v_chunks_updated<>v_expected then
  raise exception 'chunk provenance mismatch';
 end if;
 update public.copilot_document_indexes set
  extractor_version=p_extractor_version,
  chunking_version=p_chunking_version,
  index_version=p_index_version,
  extraction_fingerprint=p_fingerprint,
  quality_status='COMPLETE',quality_flags='[]'::jsonb,
  extraction_run_id=v_run_id,completed_at=now()
 where id=p_index_id and project_id=p_project_id and
  owner_id=p_owner_id and status='READY' and
  asset_sha256=p_sha;
 if not found then raise exception 'index publication lost'; end if;
 return true;
end $fn$;
revoke all on function public.copilot_publish_document_index_v3(
 uuid,uuid,uuid,uuid,uuid,uuid,text,integer,jsonb,jsonb,text,text,text,text,text,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.copilot_publish_document_index_v3(
 uuid,uuid,uuid,uuid,uuid,uuid,text,integer,jsonb,jsonb,text,text,text,text,text,text,jsonb)
 to service_role;

-- Legacy 066/067 READY rows are not upgraded by assertion. They become
-- searchable only after exact original SHA has passed the v3 quality pipeline.
create or replace function public.copilot_search_document_chunks(
 p_project_id uuid,p_question text,p_limit integer default 10)
returns table(source_id uuid,asset_id uuid,page_number integer,chunk_number integer,content text,score real)
language plpgsql security invoker set search_path=''
as $fn$
declare q tsquery; w text; n integer:=0;
begin
 if (select auth.uid()) is null or not public.project_is_owned(p_project_id)
  or char_length(p_question)>1000 or p_limit<1 or p_limit>20 then return; end if;
 for w in
  select distinct word from regexp_split_to_table(lower(p_question),'[^[:alnum:]]+') word
   where length(word)>=3 order by word limit 16
 loop
  if n=0 then q:=plainto_tsquery('simple',w);
  else q:=q || plainto_tsquery('simple',w); end if;
  n:=n+1;
 end loop;
 if n=0 or q is null or numnode(q)=0 then return; end if;
 return query
 with scored as (
  select c.source_id,c.asset_id,c.page_number,c.chunk_number,c.content,
   greatest(ts_rank_cd(c.fts,q),ts_rank_cd(c.search_fts,q)) as relevance,
   row_number() over(partition by c.asset_id
    order by greatest(ts_rank_cd(c.fts,q),ts_rank_cd(c.search_fts,q)) desc,c.page_number,c.chunk_number) as by_asset
  from public.copilot_document_chunks c
  join public.copilot_document_indexes i on i.id=c.index_id
  join public.source_assets a on a.id=c.asset_id and a.project_id=c.project_id
  where c.project_id=p_project_id and c.owner_id=(select auth.uid())
   and i.owner_id=c.owner_id and i.status='READY'
   and i.quality_status='COMPLETE'
   and i.index_version='CITEM-PDF-INDEX-A1-20261023'
   and i.extraction_run_id=c.extraction_run_id
   and i.extraction_run_id is not null
   and i.asset_sha256=a.sha256 and a.state='READY' and a.asset_role='ORIGINAL'
   and c.fts @@ q
 )
 select s.source_id,s.asset_id,s.page_number,s.chunk_number,s.content,
  s.relevance::real as score from scored s where s.by_asset<=4
 order by s.relevance desc,s.page_number,s.chunk_number limit p_limit;
end $fn$;
revoke all on function public.copilot_search_document_chunks(uuid,text,integer)
 from public,anon;
grant execute on function public.copilot_search_document_chunks(uuid,text,integer)
 to authenticated;

    or x.original_text_sha256<>encode(sha256(convert_to(x.original_text,'UTF8')),'hex')
    or x.extractor not in ('pdfjs','poppler')
    or x.section_type not in ('COVER','TABLE_OF_CONTENTS','BIBLIOGRAPHY','BODY')
    or x.quality_flags is null or x.quality_flags<>'[]'::jsonb
 ) then return false; end if;
 if (select count(distinct x.page_number) from
   jsonb_to_recordset(p_pages) as x(page_number integer))<>p_page_count
 then return false; end if;
 if p_chunks is null or jsonb_typeof(p_chunks)<>'array'
   or octet_length(p_chunks::text)>2400000 then return false; end if;
 v_expected:=jsonb_array_length(p_chunks);
 if v_expected<1 or v_expected>1500 then return false; end if;
 if exists(
  select 1 from jsonb_to_recordset(p_chunks) as x(
   page_number integer,chunk_number integer,content text,
   content_sha256 text,search_text text,section_type text)
  where x.content_sha256 !~ '^[a-f0-9]{64}$'
   or x.search_text is null or char_length(x.search_text)>2200
   or x.section_type not in ('COVER','TABLE_OF_CONTENTS','BIBLIOGRAPHY','BODY')
 ) then return false; end if;
 -- v2 validates claim token, live source SHA, chunk/page coverage and publishes
 -- atomically. A later SQL error in this v3 call rolls the v2 changes back too.
 if not public.copilot_publish_document_index_v2(
  p_index_id,p_claim_token,p_project_id,p_owner_id,
  p_source_id,p_asset_id,p_sha,p_page_count,p_chunks)
 then return false; end if;
 insert into public.copilot_document_extraction_runs(
  project_id,owner_id,index_id,source_id,asset_id,asset_sha256,
  original_filename,original_mime_type,original_size_bytes,
  extractor_version,chunking_version,index_version,extraction_fingerprint,
  document_language,language_method,metadata_candidates,quality_status,
  quality_flags,page_count,pages_with_text,pages_without_text)
 select p_project_id,p_owner_id,p_index_id,p_source_id,p_asset_id,p_sha,
  a.original_filename,a.mime_type,a.size_bytes,
  p_extractor_version,p_chunking_version,p_index_version,p_fingerprint,
  p_language,'heuristic_unverified','[]'::jsonb,'COMPLETE','[]'::jsonb,
  p_page_count,p_page_count,0
 from public.source_assets a
 where a.id=p_asset_id and a.source_id=p_source_id and a.project_id=p_project_id
  and a.sha256=p_sha and a.asset_role='ORIGINAL' and a.state='READY'
 returning id into v_run_id;
 if v_run_id is null then raise exception 'source changed during publish'; end if;
 insert into public.copilot_document_extracted_pages(
  project_id,owner_id,extraction_run_id,page_number,original_text,search_text,
  original_text_sha256,extractor,section_type,quality_flags)
 select p_project_id,p_owner_id,v_run_id,x.page_number,
  x.original_text,x.search_text,x.original_text_sha256,x.extractor,
  x.section_type,x.quality_flags
 from jsonb_to_recordset(p_pages) as x(
  page_number integer,original_text text,search_text text,
  original_text_sha256 text,extractor text,section_type text,quality_flags jsonb);
 get diagnostics v_inserted=row_count;
 if v_inserted<>p_page_count then raise exception 'page snapshot count mismatch'; end if;
 update public.copilot_document_chunks c set
  extraction_run_id=v_run_id,
  content_sha256=x.content_sha256,
  search_text=x.search_text,
  extractor_version=p_extractor_version,
  chunking_version=p_chunking_version,
  section_type=x.section_type,
  document_language=p_language
 from jsonb_to_recordset(p_chunks) as x(
  page_number integer,chunk_number integer,content text,
  content_sha256 text,search_text text,section_type text)
 where c.index_id=p_index_id and c.project_id=p_project_id and
  c.owner_id=p_owner_id and c.page_number=x.page_number and
  c.chunk_number=x.chunk_number and c.content=x.content;
 get diagnostics v_chunks_updated=row_count;
 if v_chunks_updated<>v_expected then
  raise exception 'chunk provenance mismatch';
 end if;
 update public.copilot_document_indexes set
  extractor_version=p_extractor_version,
  chunking_version=p_chunking_version,
  index_version=p_index_version,
  extraction_fingerprint=p_fingerprint,
  quality_status='COMPLETE',quality_flags='[]'::jsonb,
  extraction_run_id=v_run_id,completed_at=now()
 where id=p_index_id and project_id=p_project_id and
  owner_id=p_owner_id and status='READY' and
  asset_sha256=p_sha;
 if not found then raise exception 'index publication lost'; end if;
 return true;
end $fn$;
revoke all on function public.copilot_publish_document_index_v3(
 uuid,uuid,uuid,uuid,uuid,uuid,text,integer,jsonb,jsonb,text,text,text,text,text,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.copilot_publish_document_index_v3(
 uuid,uuid,uuid,uuid,uuid,uuid,text,integer,jsonb,jsonb,text,text,text,text,text,text,jsonb)
 to service_role;

-- Legacy 066/067 READY rows are not upgraded by assertion. They become
-- searchable only after exact original SHA has passed the v3 quality pipeline.
create or replace function public.copilot_search_document_chunks(
 p_project_id uuid,p_question text,p_limit integer default 10)
returns table(source_id uuid,asset_id uuid,page_number integer,chunk_number integer,content text,score real)
language plpgsql security invoker set search_path=''
as $fn$
declare q tsquery; w text; n integer:=0;
begin
 if (select auth.uid()) is null or not public.project_is_owned(p_project_id)
  or char_length(p_question)>1000 or p_limit<1 or p_limit>20 then return; end if;
 for w in
  select distinct word from regexp_split_to_table(lower(p_question),'[^[:alnum:]]+') word
   where length(word)>=3 order by word limit 16
 loop
  if n=0 then q:=plainto_tsquery('simple',w);
  else q:=q || plainto_tsquery('simple',w); end if;
  n:=n+1;
 end loop;
 if n=0 or q is null or numnode(q)=0 then return; end if;
 return query
 with scored as (
  select c.source_id,c.asset_id,c.page_number,c.chunk_number,c.content,
   greatest(ts_rank_cd(c.fts,q),ts_rank_cd(c.search_fts,q)) as relevance,
   row_number() over(partition by c.asset_id
    order by greatest(ts_rank_cd(c.fts,q),ts_rank_cd(c.search_fts,q)) desc,c.page_number,c.chunk_number) as by_asset
  from public.copilot_document_chunks c
  join public.copilot_document_indexes i on i.id=c.index_id
  join public.source_assets a on a.id=c.asset_id and a.project_id=c.project_id
  where c.project_id=p_project_id and c.owner_id=(select auth.uid())
   and i.owner_id=c.owner_id and i.status='READY'
   and i.quality_status='COMPLETE'
   and i.index_version='CITEM-PDF-INDEX-A1-20261023'
   and i.extraction_run_id=c.extraction_run_id
   and i.extraction_run_id is not null
   and i.asset_sha256=a.sha256 and a.state='READY' and a.asset_role='ORIGINAL'
   and c.fts @@ q
 )
 select s.source_id,s.asset_id,s.page_number,s.chunk_number,s.content,
  s.relevance::real as score from scored s where s.by_asset<=4
 order by s.relevance desc,s.page_number,s.chunk_number limit p_limit;
end $fn$;
revoke all on function public.copilot_search_document_chunks(uuid,text,integer)
 from public,anon;
grant execute on function public.copilot_search_document_chunks(uuid,text,integer)
 to authenticated;
