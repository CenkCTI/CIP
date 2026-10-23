-- Executed ONLY by scripts/test-stage3-processing-foundation-migration.sh
-- using its ephemeral PostgreSQL 16 database and fake users/sources.
do $phasea$
declare
 v_claim record;
 v_ready boolean;
 v_text text:='APT28 espionnage mars 2022 CVE-2023-23397';
 v_digest text;
 v_fingerprint text;
 v_pages jsonb;
 v_chunks jsonb;
begin
 v_digest:=encode(sha256(convert_to(v_text,'UTF8')),'hex');
 v_fingerprint:=encode(sha256(
   convert_to('1','UTF8')||'\x00'::bytea||
   convert_to(v_text,'UTF8')||'\x00'::bytea),'hex');
 v_pages:=jsonb_build_array(jsonb_build_object(
  'page_number',1,'original_text',v_text,'search_text',v_text,
  'original_text_sha256',v_digest,'extractor','pdfjs',
  'section_type','BODY','quality_flags','[]'::jsonb));
 v_chunks:=jsonb_build_array(jsonb_build_object(
  'page_number',1,'chunk_number',1,'content',v_text,
  'content_sha256',v_digest,'search_text',v_text,
  'section_type','BODY'));
 if has_function_privilege('anon',
  'public.copilot_publish_document_index_v3(uuid,uuid,uuid,uuid,uuid,uuid,text,integer,jsonb,jsonb,text,text,text,text,text,text,jsonb)','EXECUTE')
 or has_function_privilege('authenticated',
  'public.copilot_publish_document_index_v3(uuid,uuid,uuid,uuid,uuid,uuid,text,integer,jsonb,jsonb,text,text,text,text,text,text,jsonb)','EXECUTE')
 then raise exception 'Unsafe public v3 publication privilege';end if;
 select * into v_claim from public.copilot_claim_document_index_v2(
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',repeat('a',64));
 if v_claim.index_id is null or v_claim.claim_token is null then
  raise exception 'Cannot reindex previous v2 READY document';end if;
 select public.copilot_publish_document_index_v3(
  v_claim.index_id,v_claim.claim_token,
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',repeat('a',64),
  1,v_chunks,v_pages,repeat('b',64),
  'pdfjs-5.4.296-poppler-ocr-a1','page-char-1800-overlap-180-v1',
  'CITEM-PDF-INDEX-A1-20261023','fr','COMPLETE','[]'::jsonb)
 into v_ready;
 if v_ready then raise exception 'Invalid extraction fingerprint accepted'; end if;
 if exists(select 1 from public.copilot_document_extraction_runs) then
  raise exception 'Rejected extraction unexpectedly published';end if;
 select public.copilot_publish_document_index_v3(
  v_claim.index_id,v_claim.claim_token,
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',repeat('a',64),
  1,v_chunks,v_pages,v_fingerprint,
  'pdfjs-5.4.296-poppler-ocr-a1','page-char-1800-overlap-180-v1',
  'CITEM-PDF-INDEX-A1-20261023','fr','COMPLETE','[]'::jsonb)
 into v_ready;
 if not v_ready then raise exception 'Correct v3 atomic publication rejected';end if;
 if (select count(*) from public.copilot_document_extracted_pages)<>1
 or (select count(*) from public.copilot_document_chunks where extraction_run_id is not null)<>1
 or (select count(*) from public.copilot_document_indexes where
  status='READY' and quality_status='COMPLETE' and extraction_run_id is not null)<>1
 then raise exception 'Incomplete v3 index-page-chunk transaction';end if;
end $phasea$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $owner$begin
 if (select count(*) from public.copilot_document_extracted_pages)<>1
 or (select count(*) from public.copilot_search_document_chunks(
  '20000000-0000-4000-8000-000000000001','APT28',10))<>1 then
  raise exception 'Owner versioned PDF evidence inaccessible';end if;
end $owner$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $other$begin
 if exists(select 1 from public.copilot_document_extracted_pages)
 or exists(select 1 from public.copilot_search_document_chunks(
  '20000000-0000-4000-8000-000000000001','APT28',10)) then
  raise exception 'Cross-owner versioned PDF evidence leaked';end if;
end $other$;
reset role;
