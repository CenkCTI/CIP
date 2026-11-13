-- Stage 4.1 M1C: analyst-reviewed reporting lineage (NOT Canvas edges).
-- Deliberately no FK to mutable/deletable Stage-3 assertions: retain audit
-- history when a Source Claim is unlinked. Privacy deletion cascades via project.
create table public.assertion_lineage_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  from_assertion_id uuid not null,
  to_assertion_id uuid not null,
  pair_low uuid generated always as (least(from_assertion_id,to_assertion_id)) stored,
  pair_high uuid generated always as (greatest(from_assertion_id,to_assertion_id)) stored,
  from_source_id uuid not null,
  to_source_id uuid not null,
  revision integer not null check (revision > 0),
  relation text not null check (relation in ('CITES','DERIVED_FROM','SHARES_PRIMARY_SOURCE','INDEPENDENT_OBSERVATION','UNCLEAR')),
  rationale text not null check (char_length(trim(rationale)) between 20 and 4000),
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  supersedes_id uuid,
  request_id uuid not null,
  input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  context_fingerprint text not null check (context_fingerprint ~ '^[0-9a-f]{64}$'),
  identity_snapshot jsonb not null check (jsonb_typeof(identity_snapshot)='object'),
  constraint assertion_lineage_distinct check (from_assertion_id<>to_assertion_id),
  constraint assertion_lineage_independent check (relation<>'INDEPENDENT_OBSERVATION' or
    (from_source_id<>to_source_id and char_length(trim(rationale))>=60)),
  constraint assertion_lineage_chain check ((revision=1 and supersedes_id is null) or
    (revision>1 and supersedes_id is not null)),
  unique (project_id,pair_low,pair_high,revision),
  unique (project_id,pair_low,pair_high,id),
  unique (project_id,request_id),
  constraint assertion_lineage_supersedes_fk foreign key(project_id,pair_low,pair_high,supersedes_id)
    references public.assertion_lineage_links(project_id,pair_low,pair_high,id) on delete restrict
);
create index assertion_lineage_from_idx on public.assertion_lineage_links(project_id,from_assertion_id,reviewed_at desc);
create index assertion_lineage_to_idx on public.assertion_lineage_links(project_id,to_assertion_id,reviewed_at desc);
create index assertion_lineage_pair_idx on public.assertion_lineage_links(project_id,pair_low,pair_high,revision desc);
alter table public.assertion_lineage_links enable row level security;
revoke all on table public.assertion_lineage_links from public,anon,authenticated;
grant select on public.assertion_lineage_links to authenticated;
create policy assertion_lineage_owned_read on public.assertion_lineage_links for select to authenticated
  using (public.project_is_owned(project_id));

create view public.assertion_lineage_current_v1 with (security_invoker=true) as
 select distinct on (project_id,pair_low,pair_high) *
 from public.assertion_lineage_links
 order by project_id,pair_low,pair_high,revision desc;
revoke all on public.assertion_lineage_current_v1 from public,anon,authenticated;
grant select on public.assertion_lineage_current_v1 to authenticated;

create function public.protect_assertion_lineage_history_v1() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' or exists(select 1 from public.projects p where p.id=old.project_id) then
    raise exception 'LINEAGE_HISTORY_IMMUTABLE' using errcode='23514';
  end if;
  return old;
end $$;
create trigger protect_assertion_lineage_history_v1
before update or delete on public.assertion_lineage_links
for each row execute function public.protect_assertion_lineage_history_v1();
revoke all on function public.protect_assertion_lineage_history_v1() from public,anon,authenticated;

-- Single authoritative writer: locks BOTH assertions in a stable order, reads
-- current Stage-3 provenance under share locks and derives source IDs itself.
create function public.save_assertion_lineage_review_v1(
 p_project_id uuid,p_from_assertion_id uuid,p_to_assertion_id uuid,
 p_relation text,p_rationale text,p_expected_current_review_id uuid,
 p_request_id uuid,p_expected_context jsonb
) returns table(review_id uuid,replayed boolean,reviewed_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid := auth.uid();
 v_from public.source_claim_assertions%rowtype;
 v_to public.source_claim_assertions%rowtype;
 v_claim public.source_claims%rowtype;
 v_from_annotation public.source_annotations%rowtype;
 v_to_annotation public.source_annotations%rowtype;
 v_from_source public.sources%rowtype;
 v_to_source public.sources%rowtype;
 v_count integer;
 v_current public.assertion_lineage_links%rowtype;
 v_existing public.assertion_lineage_links%rowtype;
 v_why text := trim(coalesce(p_rationale,''));
 v_sha text;
 v_context_sha text;
 v_snapshot jsonb;
 v_low uuid;
 v_high uuid;
 v_id uuid := gen_random_uuid();
 v_time timestamptz := clock_timestamp();
begin
 if v_uid is null or p_project_id is null or p_from_assertion_id is null or
    p_to_assertion_id is null or p_from_assertion_id=p_to_assertion_id or
    p_request_id is null or not exists(select 1 from public.projects p
      where p.id=p_project_id and p.owner_id=v_uid) then
    raise exception 'NOT_FOUND' using errcode='42501';
 end if;
 if p_relation is null or p_relation not in ('CITES','DERIVED_FROM','SHARES_PRIMARY_SOURCE',
   'INDEPENDENT_OBSERVATION','UNCLEAR') or char_length(v_why) not between 20 and 4000 or
   (p_relation='INDEPENDENT_OBSERVATION' and char_length(v_why)<60) then
   raise exception 'INVALID_LINEAGE' using errcode='22023';
 end if;
 v_low := least(p_from_assertion_id,p_to_assertion_id);
 v_high := greatest(p_from_assertion_id,p_to_assertion_id);
 perform a.id from public.source_claim_assertions a
   where a.project_id=p_project_id and a.id in (p_from_assertion_id,p_to_assertion_id)
   order by a.id for update;
 get diagnostics v_count = row_count;
 if v_count<>2 then raise exception 'ASSERTION_NOT_FOUND' using errcode='42501'; end if;
 select * into strict v_from from public.source_claim_assertions a
   where a.id=p_from_assertion_id and a.project_id=p_project_id;
 select * into strict v_to from public.source_claim_assertions a
   where a.id=p_to_assertion_id and a.project_id=p_project_id;
 if v_from.source_claim_id<>v_to.source_claim_id then
   raise exception 'DIFFERENT_CANONICAL_CLAIM' using errcode='22023';
 end if;
 select * into strict v_claim from public.source_claims c
   where c.id=v_from.source_claim_id and c.project_id=p_project_id for share;
 select * into strict v_from_annotation from public.source_annotations a
   where a.id=v_from.source_annotation_id and a.project_id=p_project_id for share;
 select * into strict v_to_annotation from public.source_annotations a
   where a.id=v_to.source_annotation_id and a.project_id=p_project_id for share;
 -- Lock Sources in stable order; row lookup performed independently afterwards.
 perform s.id from public.sources s where s.project_id=p_project_id
    and s.id in (v_from_annotation.source_id,v_to_annotation.source_id)
    order by s.id for share;
 select * into strict v_from_source from public.sources s
   where s.id=v_from_annotation.source_id and s.project_id=p_project_id;
 select * into strict v_to_source from public.sources s
   where s.id=v_to_annotation.source_id and s.project_id=p_project_id;
 if v_from_source.archived_at is not null or v_to_source.archived_at is not null then
   raise exception 'SOURCE_ARCHIVED' using errcode='22023';
 end if;
 if p_relation='INDEPENDENT_OBSERVATION' and
   (v_from_source.id=v_to_source.id or
    v_from.stance is distinct from v_to.stance or
    v_from.stance::text not in ('ASSERTS','DENIES')) then
   raise exception 'INDEPENDENCE_NOT_SUPPORTED' using errcode='22023';
 end if;

 v_sha:=encode(sha256(convert_to(jsonb_build_object(
   'projectId',p_project_id,'fromAssertionId',p_from_assertion_id,
   'toAssertionId',p_to_assertion_id,'relation',p_relation,
   'rationale',v_why,'expectedCurrentReviewId',p_expected_current_review_id,
   'expectedContext',p_expected_context)::text,'UTF8')),'hex');
 select * into v_existing from public.assertion_lineage_links l
   where l.project_id=p_project_id and l.request_id=p_request_id;
 if found then
   if v_existing.input_sha256=v_sha and v_existing.reviewed_by=v_uid then
     return query select v_existing.id,true,v_existing.reviewed_at;return;
   end if;
   raise exception 'REQUEST_ID_REUSED' using errcode='23505';
 end if;

 if p_expected_context is null or
   v_from.updated_at is distinct from (p_expected_context->>'fromAssertionUpdatedAt')::timestamptz or
   v_to.updated_at is distinct from (p_expected_context->>'toAssertionUpdatedAt')::timestamptz or
   v_claim.updated_at is distinct from (p_expected_context->>'claimUpdatedAt')::timestamptz or
   v_from_annotation.updated_at is distinct from (p_expected_context->>'fromAnnotationUpdatedAt')::timestamptz or
   v_to_annotation.updated_at is distinct from (p_expected_context->>'toAnnotationUpdatedAt')::timestamptz or
   v_from_source.updated_at is distinct from (p_expected_context->>'fromSourceUpdatedAt')::timestamptz or
   v_to_source.updated_at is distinct from (p_expected_context->>'toSourceUpdatedAt')::timestamptz then
   raise exception 'LINEAGE_CONTEXT_CONFLICT' using errcode='40001';
 end if;
 select * into v_current from public.assertion_lineage_links l
    where l.project_id=p_project_id and l.pair_low=v_low and l.pair_high=v_high
    order by l.revision desc limit 1;
 if v_current.id is distinct from p_expected_current_review_id then
   raise exception 'EDIT_CONFLICT' using errcode='40001';
 end if;
 v_snapshot:=jsonb_build_object(
  'claimId',v_claim.id,'claimSummary',left(v_claim.claim_summary,240),
  'fromSourceTitle',left(v_from_source.title,160),
  'toSourceTitle',left(v_to_source.title,160),
  'fromStance',v_from.stance::text,'toStance',v_to.stance::text
 );
 v_context_sha:=encode(sha256(convert_to(jsonb_build_object(
   'expectedContext',p_expected_context,'identity',v_snapshot)::text,'UTF8')),'hex');
 insert into public.assertion_lineage_links(
   id,project_id,from_assertion_id,to_assertion_id,from_source_id,to_source_id,
   revision,relation,rationale,reviewed_by,reviewed_at,supersedes_id,request_id,
   input_sha256,context_fingerprint,identity_snapshot
 ) values(v_id,p_project_id,p_from_assertion_id,p_to_assertion_id,
   v_from_source.id,v_to_source.id,coalesce(v_current.revision,0)+1,
   p_relation,v_why,v_uid,v_time,v_current.id,p_request_id,
   v_sha,v_context_sha,v_snapshot);
 return query select v_id,false,v_time;
end $$;
revoke all on function public.save_assertion_lineage_review_v1(
 uuid,uuid,uuid,text,text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_assertion_lineage_review_v1(
 uuid,uuid,uuid,text,text,uuid,uuid,jsonb) to authenticated;

-- Ensure new grade-1 reviews have an explicit, currently independent lineage
-- assessment. This does not change historical M1B reviews (append-only).
create function public.require_independent_lineage_for_level_one_v1()
returns trigger language plpgsql set search_path='' as $$
declare v_relation text;
begin
 if new.credibility=1 then
   select l.relation into v_relation from public.assertion_lineage_links l
   where l.project_id=new.project_id
     and l.pair_low=least(new.source_claim_assertion_id,new.verification_assertion_id)
     and l.pair_high=greatest(new.source_claim_assertion_id,new.verification_assertion_id)
   order by l.revision desc limit 1;
   if v_relation is distinct from 'INDEPENDENT_OBSERVATION' then
     raise exception 'INDEPENDENT_LINEAGE_REVIEW_REQUIRED' using errcode='22023';
   end if;
 end if;
 return new;
end $$;
create trigger require_independent_lineage_for_level_one_v1
before insert on public.assertion_credibility_reviews
for each row execute function public.require_independent_lineage_for_level_one_v1();
revoke all on function public.require_independent_lineage_for_level_one_v1()
  from public,anon,authenticated;

comment on table public.assertion_lineage_links is
 'Append-only analyst review of directional assertion reporting lineage. A different URL is not independent observation. Canvas edges are not evidence.';
