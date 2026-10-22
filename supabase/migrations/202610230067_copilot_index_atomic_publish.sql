-- Forward-only PR #83 repair: claim-token-fenced, transactional PDF index publication.
-- Migration 066 remains immutable because it has already been deployed.
alter table public.copilot_document_indexes
  add column if not exists claim_token uuid;

-- Validate the authoritative source SHA before claiming the index. All writes
-- remain service-role-only and respect the original Source Collection identity.
create function public.copilot_claim_document_index_v2(
 p_project_id uuid,p_owner_id uuid,p_source_id uuid,p_asset_id uuid,p_sha text)
returns table(index_id uuid,claim_token uuid)
language sql security invoker set search_path=''
as $fn$
 insert into public.copilot_document_indexes(
  project_id,owner_id,source_id,asset_id,asset_sha256,status,
  chunk_count,page_count,indexed_at,claim_token
 )
 select p_project_id,p_owner_id,p_source_id,p_asset_id,p_sha,
  'PROCESSING',0,0,now(),gen_random_uuid()
 from public.source_assets a
 where a.project_id=p_project_id and a.source_id=p_source_id
  and a.id=p_asset_id and a.sha256=p_sha
  and a.state='READY' and a.asset_role='ORIGINAL'
  and p_sha ~ '^[a-f0-9]{64}$'
 on conflict(project_id,asset_id,owner_id) do update set
  asset_sha256=excluded.asset_sha256,status='PROCESSING',
  chunk_count=0,page_count=0,indexed_at=excluded.indexed_at,
  claim_token=excluded.claim_token
 where public.copilot_document_indexes.status<>'PROCESSING'
    or public.copilot_document_indexes.indexed_at<now()-interval '4 minutes'
 returning id,public.copilot_document_indexes.claim_token;
$fn$;
revoke all on function public.copilot_claim_document_index_v2(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.copilot_claim_document_index_v2(uuid,uuid,uuid,uuid,text) to service_role;

-- A single RPC/transaction replaces all previous derived chunks, validates
-- full ordered page coverage and marks READY. Crashes or SQL exceptions roll back
-- the DELETE/INSERT/UPDATE together. Stale claim tokens cannot publish.
create function public.copilot_publish_document_index_v2(
 p_index_id uuid,p_claim_token uuid,p_project_id uuid,p_owner_id uuid,
 p_source_id uuid,p_asset_id uuid,p_sha text,p_page_count integer,p_chunks jsonb)
returns boolean language plpgsql security invoker set search_path=''
as $fn$
declare
 v_expected integer;
 v_inserted integer;
 v_distinct_pages integer;
 v_first integer;
 v_last integer;
begin
 if p_claim_token is null or p_page_count is null or p_page_count not between 1 and 200
  or p_chunks is null or jsonb_typeof(p_chunks)<>'array'
  or octet_length(p_chunks::text)>2400000 then return false; end if;
 v_expected:=jsonb_array_length(p_chunks);
 if v_expected<1 or v_expected>1500 then return false; end if;
 if exists(
  select 1 from jsonb_to_recordset(p_chunks)
   as x(page_number integer,chunk_number integer,content text)
  where x.page_number is null or x.page_number not between 1 and p_page_count
   or x.chunk_number is null or x.chunk_number not between 1 and 500
   or x.content is null or char_length(x.content) not between 1 and 2200
 ) then return false; end if;
 select count(distinct x.page_number),min(x.page_number),max(x.page_number)
 into v_distinct_pages,v_first,v_last
 from jsonb_to_recordset(p_chunks)
  as x(page_number integer,chunk_number integer,content text);
 if v_distinct_pages<>p_page_count or v_first<>1 or v_last<>p_page_count
 then return false; end if;
 perform 1 from public.copilot_document_indexes i
 join public.source_assets a on a.id=i.asset_id
  and a.project_id=i.project_id and a.source_id=i.source_id
 where i.id=p_index_id and i.project_id=p_project_id and i.owner_id=p_owner_id
  and i.source_id=p_source_id and i.asset_id=p_asset_id
  and i.claim_token=p_claim_token and i.asset_sha256=p_sha
  and i.status='PROCESSING' and a.sha256=p_sha
  and a.state='READY' and a.asset_role='ORIGINAL'
 for update of i;
 if not found then return false; end if;
 delete from public.copilot_document_chunks
 where index_id=p_index_id and project_id=p_project_id and owner_id=p_owner_id;
 insert into public.copilot_document_chunks(
  project_id,owner_id,index_id,source_id,asset_id,page_number,chunk_number,content)
 select p_project_id,p_owner_id,p_index_id,p_source_id,p_asset_id,
  x.page_number,x.chunk_number,x.content
 from jsonb_to_recordset(p_chunks)
  as x(page_number integer,chunk_number integer,content text);
 get diagnostics v_inserted=row_count;
 if v_inserted<>v_expected then
  raise exception 'Index chunk count mismatch' using errcode='check_violation';
 end if;
 update public.copilot_document_indexes
 set status='READY',page_count=p_page_count,chunk_count=v_inserted,
  indexed_at=now(),claim_token=null
 where id=p_index_id and claim_token=p_claim_token and status='PROCESSING';
 if not found then
  raise exception 'Index claim changed during publication' using errcode='check_violation';
 end if;
 return true;
end $fn$;
revoke all on function public.copilot_publish_document_index_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.copilot_publish_document_index_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,integer,jsonb) to service_role;

create function public.copilot_fail_document_index_v2(
 p_index_id uuid,p_claim_token uuid,p_project_id uuid,p_owner_id uuid)
returns boolean language plpgsql security invoker set search_path=''
as $fn$
begin
 update public.copilot_document_indexes
 set status='ERROR',claim_token=null
 where id=p_index_id and claim_token=p_claim_token
  and project_id=p_project_id and owner_id=p_owner_id and status='PROCESSING';
 return found;
end $fn$;
revoke all on function public.copilot_fail_document_index_v2(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.copilot_fail_document_index_v2(uuid,uuid,uuid,uuid) to service_role;
