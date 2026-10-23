-- Phase B: 384-dimension multilingual-e5-small semantic candidates.
-- Provider must use verified model SHA/revision and explicit source consent.
-- No reindex of existing PDFs, no outbound model calls and no content deletion.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create table public.copilot_chunk_embeddings (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 index_id uuid not null,
 source_id uuid not null,
 asset_id uuid not null,
 chunk_id uuid not null references public.copilot_document_chunks(id) on delete cascade,
 extraction_run_id uuid not null,
 asset_sha256 text not null check(asset_sha256 ~ '^[a-f0-9]{64}$'),
 content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
 model_id text not null check(model_id='intfloat/multilingual-e5-small'),
 model_revision text not null check(model_revision ~ '^[a-f0-9]{40}$'),
 embedding extensions.vector(384) not null,
 source_embedding_approved boolean not null default false
   check(source_embedding_approved=true),
 created_at timestamptz not null default now(),
 unique(chunk_id,extraction_run_id,model_id,model_revision),
 foreign key(project_id,index_id,owner_id)
  references public.copilot_document_indexes(project_id,id,owner_id) on delete cascade,
 foreign key(project_id,extraction_run_id,owner_id)
  references public.copilot_document_extraction_runs(project_id,id,owner_id) on delete cascade,
 foreign key(project_id,source_id,asset_id)
  references public.source_assets(project_id,source_id,id) on delete cascade
);
create index copilot_embeddings_scoped
 on public.copilot_chunk_embeddings(project_id,owner_id,asset_id,extraction_run_id,model_revision);

alter table public.copilot_chunk_embeddings enable row level security;
revoke all on public.copilot_chunk_embeddings from public,anon,authenticated;
grant select on public.copilot_chunk_embeddings to authenticated;
grant select,insert,delete on public.copilot_chunk_embeddings to service_role;
create policy copilot_embeddings_owned_read on public.copilot_chunk_embeddings
 for select to authenticated
 using(owner_id=(select auth.uid()) and public.project_is_owned(project_id));

-- SECURITY INVOKER: post-filtered nearest neighbors are NOT sufficient.
-- Index, owner, original asset SHA, current version and extractor status
-- are all joined/filtered *before* ORDER BY / LIMIT.
create function public.copilot_search_semantic_chunks_v1(
 p_project_id uuid,
 p_model_revision text,
 p_query_embedding extensions.vector(384),
 p_limit integer default 30,
 p_source_id uuid default null,
 p_asset_id uuid default null
)
returns table(
 source_id uuid,asset_id uuid,page_number integer,chunk_number integer,
 content text,score real
)
language plpgsql security invoker set search_path=''
as $fn$
begin
 if (select auth.uid()) is null
  or not public.project_is_owned(p_project_id)
  or p_query_embedding is null
  or p_model_revision !~ '^[a-f0-9]{40}$'
  or p_limit not between 1 and 30
  or (p_asset_id is not null and p_source_id is null)
 then return; end if;
 return query
 select c.source_id,c.asset_id,c.page_number,c.chunk_number,c.content,
  (1 - (e.embedding OPERATOR(extensions.<=>) p_query_embedding))::real as score
 from public.copilot_chunk_embeddings e
 join public.copilot_document_chunks c on c.id=e.chunk_id
  and c.project_id=e.project_id and c.owner_id=e.owner_id
  and c.index_id=e.index_id and c.extraction_run_id=e.extraction_run_id
  and c.content_sha256=e.content_sha256 and c.source_id=e.source_id
  and c.asset_id=e.asset_id
 join public.copilot_document_indexes i on i.id=e.index_id
  and i.project_id=e.project_id and i.owner_id=e.owner_id
  and i.extraction_run_id=e.extraction_run_id
 join public.source_assets a on a.id=e.asset_id
  and a.project_id=e.project_id and a.source_id=e.source_id
 where e.project_id=p_project_id and e.owner_id=(select auth.uid())
  and e.model_id='intfloat/multilingual-e5-small'
  and e.model_revision=p_model_revision
  and e.source_embedding_approved=true
  and (p_source_id is null or e.source_id=p_source_id)
  and (p_asset_id is null or e.asset_id=p_asset_id)
  and i.status='READY' and i.quality_status='COMPLETE'
  and i.index_version='CITEM-PDF-INDEX-A1-20261023'
  and a.state='READY' and a.asset_role='ORIGINAL'
  and a.sha256=e.asset_sha256 and i.asset_sha256=a.sha256
 order by e.embedding OPERATOR(extensions.<=>) p_query_embedding,
   c.source_id,c.asset_id,c.page_number,c.chunk_number
 limit p_limit;
end $fn$;

revoke all on function public.copilot_search_semantic_chunks_v1(
 uuid,text,extensions.vector,integer,uuid,uuid) from public,anon;
grant execute on function public.copilot_search_semantic_chunks_v1(
 uuid,text,extensions.vector,integer,uuid,uuid) to authenticated;
