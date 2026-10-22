-- Unified Investigation Memory v1: original-PDF derived content and analyst-visible history.
-- The Source Collection and original Storage object remain authoritative.
create table public.copilot_document_indexes (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 source_id uuid not null,
 asset_id uuid not null,
 asset_sha256 text not null check (asset_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'PROCESSING' check (status in ('PROCESSING','READY','ERROR')),
 page_count integer not null default 0 check(page_count between 0 and 200),
 chunk_count integer not null default 0 check(chunk_count between 0 and 1500),
 created_at timestamptz not null default now(),
 indexed_at timestamptz,
 unique(project_id,asset_id,owner_id),
 unique(project_id,id,owner_id),
 foreign key(project_id,source_id,asset_id)
  references public.source_assets(project_id,source_id,id) on delete cascade
);
create index copilot_document_indexes_scope on public.copilot_document_indexes(project_id,owner_id,status);

create table public.copilot_document_chunks (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 index_id uuid not null,
 source_id uuid not null,
 asset_id uuid not null,
 page_number integer not null check (page_number between 1 and 200),
 chunk_number integer not null check (chunk_number between 1 and 500),
 content text not null check (char_length(content) between 1 and 2200),
 fts tsvector generated always as (to_tsvector('simple'::regconfig,content)) stored,
 unique(index_id,page_number,chunk_number),
 foreign key(project_id,index_id,owner_id)
  references public.copilot_document_indexes(project_id,id,owner_id) on delete cascade,
 foreign key(project_id,source_id,asset_id)
  references public.source_assets(project_id,source_id,id) on delete cascade
);
create index copilot_document_chunks_search on public.copilot_document_chunks using gin(fts);
create index copilot_document_chunks_scope on public.copilot_document_chunks(project_id,owner_id,asset_id,page_number);

create table public.copilot_investigation_events (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 source_id uuid,
 asset_id uuid,
 kind text not null check(kind in ('ANALYSE','EXTRACT','ASK','ASSESSMENT','WEB_RESEARCH')),
 question text not null default '' check(char_length(question)<=1500),
 summary text not null default '' check(char_length(summary)<=6000),
 source_evidence jsonb not null default '[]'::jsonb,
 hypothesis_notes jsonb not null default '[]'::jsonb,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 check((source_id is null and asset_id is null) or (source_id is not null and asset_id is not null)),
 check(jsonb_typeof(source_evidence)='array' and octet_length(source_evidence::text)<=12000),
 check(jsonb_typeof(hypothesis_notes)='array' and octet_length(hypothesis_notes::text)<=10000),
 check(jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=2500),
 foreign key(project_id,source_id,asset_id)
  references public.source_assets(project_id,source_id,id) on delete cascade
);
create index copilot_investigation_events_recent
 on public.copilot_investigation_events(project_id,owner_id,created_at desc);

-- All new tables remain visible only through ownership RLS.
alter table public.copilot_document_indexes enable row level security;
alter table public.copilot_document_chunks enable row level security;
alter table public.copilot_investigation_events enable row level security;
revoke all on public.copilot_document_indexes,public.copilot_document_chunks,
 public.copilot_investigation_events from public,anon,authenticated;
grant select,insert,update,delete on public.copilot_document_indexes to authenticated;
grant select,insert,delete on public.copilot_document_chunks to authenticated;
grant select,insert,delete on public.copilot_investigation_events to authenticated;

create policy copilot_document_indexes_select on public.copilot_document_indexes
 for select to authenticated using(owner_id=(select auth.uid()) and public.project_is_owned(project_id));
create policy copilot_document_indexes_insert on public.copilot_document_indexes
 for insert to authenticated with check(owner_id=(select auth.uid()) and public.project_is_owned(project_id));
create policy copilot_document_indexes_update on public.copilot_document_indexes
 for update to authenticated using(owner_id=(select auth.uid()) and public.project_is_owned(project_id))
 with check(owner_id=(select auth.uid()) and public.project_is_owned(project_id));
create policy copilot_document_indexes_delete on public.copilot_document_indexes
 for delete to authenticated using(owner_id=(select auth.uid()) and public.project_is_owned(project_id));
create policy copilot_document_chunks_select on public.copilot_document_chunks
 for select to authenticated using(owner_id=(select auth.uid()) and public.project_is_owned(project_id));
create policy copilot_document_chunks_insert on public.copilot_document_chunks
 for insert to authenticated with check(owner_id=(select auth.uid()) and public.project_is_owned(project_id));
create policy copilot_document_chunks_delete on public.copilot_document_chunks
 for delete to authenticated using(owner_id=(select auth.uid()) and public.project_is_owned(project_id));
create policy copilot_investigation_events_select on public.copilot_investigation_events
 for select to authenticated using(owner_id=(select auth.uid()) and public.project_is_owned(project_id));
create policy copilot_investigation_events_insert on public.copilot_investigation_events
 for insert to authenticated with check(owner_id=(select auth.uid()) and public.project_is_owned(project_id));
create policy copilot_investigation_events_delete on public.copilot_investigation_events
 for delete to authenticated using(owner_id=(select auth.uid()) and public.project_is_owned(project_id));

-- Keyword search uses OR between lexical terms, limiting across PDFs and
-- diversifying per asset. No SQL fragment from the model enters the query.
-- This is intentionally lexical RAG; vector embeddings are not fabricated.
create function public.copilot_search_document_chunks(
 p_project_id uuid,p_question text,p_limit integer default 10)
returns table(source_id uuid,asset_id uuid,page_number integer,chunk_number integer,content text,score real)
language plpgsql security invoker set search_path=''
as $$
declare
 q tsquery;
 w text;
 n integer:=0;
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
   ts_rank_cd(c.fts,q) as relevance,
   row_number() over(partition by c.asset_id
    order by ts_rank_cd(c.fts,q) desc,c.page_number,c.chunk_number) as by_asset
  from public.copilot_document_chunks c
  join public.copilot_document_indexes i on i.id=c.index_id
  join public.source_assets a on a.id=c.asset_id and a.project_id=c.project_id
  where c.project_id=p_project_id and c.owner_id=(select auth.uid())
   and i.owner_id=c.owner_id and i.status='READY'
   and i.asset_sha256=a.sha256 and a.state='READY' and a.asset_role='ORIGINAL'
   and c.fts @@ q
 )
 select s.source_id,s.asset_id,s.page_number,s.chunk_number,s.content,
  s.relevance::real as score from scored s where s.by_asset<=4
 order by s.relevance desc,s.page_number,s.chunk_number limit p_limit;
end $$;
revoke all on function public.copilot_search_document_chunks(uuid,text,integer) from public,anon;
grant execute on function public.copilot_search_document_chunks(uuid,text,integer) to authenticated;
