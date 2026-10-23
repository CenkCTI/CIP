-- Executed only after 069 by disposable PostgreSQL pgvector service.
insert into public.copilot_chunk_embeddings (
 project_id,owner_id,index_id,source_id,asset_id,chunk_id,extraction_run_id,
 asset_sha256,content_sha256,model_id,model_revision,embedding,source_embedding_approved)
select
 '20000000-0000-4000-8000-000000000001'::uuid,
 '10000000-0000-4000-8000-000000000001'::uuid,
 '50000000-0000-4000-8000-000000000001'::uuid,
 '30000000-0000-4000-8000-000000000001'::uuid,
 '40000000-0000-4000-8000-000000000001'::uuid,
 '70000000-0000-4000-8000-000000000001'::uuid,
 '60000000-0000-4000-8000-000000000001'::uuid,
 repeat('a',64),repeat('c',64),
 'intfloat/multilingual-e5-small',repeat('b',40),
 ('['||array_to_string(array_fill(0.01::float8,ARRAY[384]),',')||']')::extensions.vector(384),
 true;
do $audit$begin
 if has_table_privilege('anon','public.copilot_chunk_embeddings','SELECT')
 or has_table_privilege('authenticated','public.copilot_chunk_embeddings','INSERT')
 or has_function_privilege('anon',
 'public.copilot_search_semantic_chunks_v1(uuid,text,extensions.vector,integer,uuid,uuid)',
 'EXECUTE') then raise exception 'unsafe vector privileges'; end if;
end $audit$;
grant usage on schema extensions to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $owner$declare n integer;
begin
 select count(*) into n from public.copilot_search_semantic_chunks_v1(
 '20000000-0000-4000-8000-000000000001',repeat('b',40),
 ('['||array_to_string(array_fill(0.01::float8,ARRAY[384]),',')||']')::extensions.vector(384),
 5);
 if n<>1 then raise exception 'owner failed semantic index retrieval: %',n; end if;
 if (select count(*) from public.copilot_chunk_embeddings)<>1 then
 raise exception 'owner cannot see stored vectors';end if;
end $owner$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $foreign$begin
 if exists(select 1 from public.copilot_chunk_embeddings)
 or exists(select 1 from public.copilot_search_semantic_chunks_v1(
 '20000000-0000-4000-8000-000000000001',repeat('b',40),
 ('['||array_to_string(array_fill(0.01::float8,ARRAY[384]),',')||']')::extensions.vector(384),5))
 then raise exception 'cross-tenant vector leak'; end if;
end $foreign$;
reset role;
update public.source_assets set sha256=repeat('d',64);
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $stale$begin
 if exists(select 1 from public.copilot_search_semantic_chunks_v1(
 '20000000-0000-4000-8000-000000000001',repeat('b',40),
 ('['||array_to_string(array_fill(0.01::float8,ARRAY[384]),',')||']')::extensions.vector(384),5))
 then raise exception 'stale SHA returned as evidence'; end if;
end $stale$;
reset role;
