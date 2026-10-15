-- CITEM Stage 3 — Evidence / Source Claim
-- Captures source-reported propositions that do not naturally belong to a
-- specialized CTI object. A Source Claim is not a truth judgement and does not
-- become "evidence for a hypothesis" until a later analytical stage assigns
-- that role.

do $$ begin
  create type public.source_claim_kind as enum (
    'GENERAL',
    'BEHAVIOR',
    'TARGETING',
    'CAPABILITY',
    'RELATIONSHIP',
    'INTENT_OBJECTIVE',
    'IMPACT',
    'TECHNICAL_CONTEXT'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.source_claim_stance as enum (
    'ASSERTS',
    'DENIES',
    'QUALIFIES',
    'UNCLEAR'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.source_claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  claim_summary text not null
    check(char_length(trim(claim_summary)) between 1 and 10000),
  claim_kind public.source_claim_kind not null default 'GENERAL',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,id)
);

drop trigger if exists source_claims_set_updated_at on public.source_claims;
create trigger source_claims_set_updated_at
  before update on public.source_claims
  for each row execute function public.set_updated_at();

create index if not exists source_claims_project_kind_idx
  on public.source_claims(project_id,claim_kind,updated_at desc,id);

create table if not exists public.source_claim_assertions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_claim_id uuid not null,
  source_annotation_id uuid not null,
  stance public.source_claim_stance not null default 'ASSERTS',
  source_qualifier text
    check(source_qualifier is null or char_length(trim(source_qualifier)) between 1 and 1000),
  mapping_origin public.source_annotation_mapping_origin not null default 'ANALYST_MAPPED',
  assertion_action public.source_annotation_output_action not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key(project_id,source_claim_id)
    references public.source_claims(project_id,id) on delete cascade,
  foreign key(project_id,source_annotation_id)
    references public.source_annotations(project_id,id) on delete restrict,

  unique(project_id,id),
  constraint source_claim_assertions_annotation_claim_uq
    unique(project_id,source_annotation_id,source_claim_id)
);

drop trigger if exists source_claim_assertions_set_updated_at
  on public.source_claim_assertions;
create trigger source_claim_assertions_set_updated_at
  before update on public.source_claim_assertions
  for each row execute function public.set_updated_at();

create index if not exists source_claim_assertions_annotation_idx
  on public.source_claim_assertions(project_id,source_annotation_id,created_at,id);
create index if not exists source_claim_assertions_claim_stance_idx
  on public.source_claim_assertions(project_id,source_claim_id,stance,created_at,id);

alter table public.source_claims enable row level security;
alter table public.source_claim_assertions enable row level security;

grant select,update,delete on public.source_claims to authenticated;
grant select on public.source_claim_assertions to authenticated;

drop policy if exists source_claims_select_owned on public.source_claims;
create policy source_claims_select_owned
  on public.source_claims for select to authenticated
  using(public.project_is_owned(project_id));

drop policy if exists source_claims_update_owned on public.source_claims;
create policy source_claims_update_owned
  on public.source_claims for update to authenticated
  using(public.project_is_owned(project_id))
  with check(public.project_is_owned(project_id));

drop policy if exists source_claims_delete_owned on public.source_claims;
create policy source_claims_delete_owned
  on public.source_claims for delete to authenticated
  using(public.project_is_owned(project_id));

drop policy if exists source_claim_assertions_select_owned
  on public.source_claim_assertions;
create policy source_claim_assertions_select_owned
  on public.source_claim_assertions for select to authenticated
  using(public.project_is_owned(project_id));

create or replace function public.create_source_claim_from_annotation(
  p_project_id uuid,
  p_source_annotation_id uuid,
  p_claim_summary text,
  p_claim_kind public.source_claim_kind,
  p_stance public.source_claim_stance,
  p_source_qualifier text,
  p_mapping_origin public.source_annotation_mapping_origin
)
returns table(source_claim_id uuid, assertion_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_claim uuid;
  v_assertion uuid;
  v_qualifier text := nullif(trim(p_source_qualifier),'');
begin
  if v_user is null or not public.project_is_owned(p_project_id) then
    raise exception 'PROJECT_NOT_OWNED';
  end if;
  if char_length(trim(coalesce(p_claim_summary,''))) < 1
     or char_length(trim(p_claim_summary)) > 10000 then
    raise exception 'INVALID_SOURCE_CLAIM_SUMMARY';
  end if;
  if v_qualifier is not null and char_length(v_qualifier) > 1000 then
    raise exception 'INVALID_SOURCE_QUALIFIER';
  end if;
  if not exists(
    select 1
    from public.source_annotations a
    where a.project_id=p_project_id
      and a.id=p_source_annotation_id
  ) then
    raise exception 'SOURCE_ANNOTATION_NOT_FOUND';
  end if;

  insert into public.source_claims(
    project_id,claim_summary,claim_kind,created_by
  ) values (
    p_project_id,trim(p_claim_summary),p_claim_kind,v_user
  )
  returning id into v_claim;

  insert into public.source_claim_assertions(
    project_id,source_claim_id,source_annotation_id,stance,source_qualifier,
    mapping_origin,assertion_action,created_by
  ) values (
    p_project_id,v_claim,p_source_annotation_id,p_stance,v_qualifier,
    p_mapping_origin,'CREATED',v_user
  )
  returning id into v_assertion;

  return query select v_claim,v_assertion;
end
$$;

create or replace function public.link_source_claim_from_annotation(
  p_project_id uuid,
  p_source_annotation_id uuid,
  p_source_claim_id uuid,
  p_stance public.source_claim_stance,
  p_source_qualifier text,
  p_mapping_origin public.source_annotation_mapping_origin
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_assertion uuid;
  v_qualifier text := nullif(trim(p_source_qualifier),'');
begin
  if v_user is null or not public.project_is_owned(p_project_id) then
    raise exception 'PROJECT_NOT_OWNED';
  end if;
  if v_qualifier is not null and char_length(v_qualifier) > 1000 then
    raise exception 'INVALID_SOURCE_QUALIFIER';
  end if;
  if not exists(
    select 1 from public.source_annotations
    where project_id=p_project_id and id=p_source_annotation_id
  ) then
    raise exception 'SOURCE_ANNOTATION_NOT_FOUND';
  end if;
  if not exists(
    select 1 from public.source_claims
    where project_id=p_project_id and id=p_source_claim_id
  ) then
    raise exception 'SOURCE_CLAIM_NOT_FOUND';
  end if;

  insert into public.source_claim_assertions(
    project_id,source_claim_id,source_annotation_id,stance,source_qualifier,
    mapping_origin,assertion_action,created_by
  ) values (
    p_project_id,p_source_claim_id,p_source_annotation_id,p_stance,v_qualifier,
    p_mapping_origin,'LINKED',v_user
  )
  on conflict(project_id,source_annotation_id,source_claim_id)
  do update set
    stance=excluded.stance,
    source_qualifier=excluded.source_qualifier,
    mapping_origin=excluded.mapping_origin,
    updated_at=now()
  returning id into v_assertion;

  return v_assertion;
end
$$;

create or replace function public.update_source_claim_assertion(
  p_project_id uuid,
  p_assertion_id uuid,
  p_stance public.source_claim_stance,
  p_source_qualifier text,
  p_mapping_origin public.source_annotation_mapping_origin
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qualifier text := nullif(trim(p_source_qualifier),'');
begin
  if auth.uid() is null or not public.project_is_owned(p_project_id) then
    raise exception 'PROJECT_NOT_OWNED';
  end if;
  if v_qualifier is not null and char_length(v_qualifier) > 1000 then
    raise exception 'INVALID_SOURCE_QUALIFIER';
  end if;

  update public.source_claim_assertions
  set stance=p_stance,
      source_qualifier=v_qualifier,
      mapping_origin=p_mapping_origin,
      updated_at=now()
  where project_id=p_project_id and id=p_assertion_id;

  return found;
end
$$;

create or replace function public.unlink_source_claim_assertion(
  p_project_id uuid,
  p_source_annotation_id uuid,
  p_assertion_id uuid
)
returns table(source_claim_id uuid, deleted_claim boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claim uuid;
  v_remaining integer;
begin
  if auth.uid() is null or not public.project_is_owned(p_project_id) then
    raise exception 'PROJECT_NOT_OWNED';
  end if;

  delete from public.source_claim_assertions
  where project_id=p_project_id
    and source_annotation_id=p_source_annotation_id
    and id=p_assertion_id
  returning source_claim_assertions.source_claim_id into v_claim;

  if v_claim is null then
    raise exception 'SOURCE_CLAIM_ASSERTION_NOT_FOUND';
  end if;

  select count(*) into v_remaining
  from public.source_claim_assertions a
  where a.project_id=p_project_id and a.source_claim_id=v_claim;

  if v_remaining=0 then
    delete from public.source_claims
    where project_id=p_project_id and id=v_claim;
    return query select v_claim,true;
  else
    return query select v_claim,false;
  end if;
end
$$;

revoke all on function public.create_source_claim_from_annotation(
  uuid,uuid,text,public.source_claim_kind,public.source_claim_stance,text,
  public.source_annotation_mapping_origin
) from public;
revoke all on function public.link_source_claim_from_annotation(
  uuid,uuid,uuid,public.source_claim_stance,text,
  public.source_annotation_mapping_origin
) from public;
revoke all on function public.update_source_claim_assertion(
  uuid,uuid,public.source_claim_stance,text,
  public.source_annotation_mapping_origin
) from public;
revoke all on function public.unlink_source_claim_assertion(uuid,uuid,uuid)
  from public;

grant execute on function public.create_source_claim_from_annotation(
  uuid,uuid,text,public.source_claim_kind,public.source_claim_stance,text,
  public.source_annotation_mapping_origin
) to authenticated;
grant execute on function public.link_source_claim_from_annotation(
  uuid,uuid,uuid,public.source_claim_stance,text,
  public.source_annotation_mapping_origin
) to authenticated;
grant execute on function public.update_source_claim_assertion(
  uuid,uuid,public.source_claim_stance,text,
  public.source_annotation_mapping_origin
) to authenticated;
grant execute on function public.unlink_source_claim_assertion(uuid,uuid,uuid)
  to authenticated;

comment on table public.source_claims is
  'Canonical source-derived propositions. A Source Claim records what reporting says; it is not a CITEM truth judgement, hypothesis, confidence score, or assessment.';
comment on table public.source_claim_assertions is
  'Provenance-bearing relationship between one exact Source Annotation and a canonical Source Claim. stance describes the source position toward the proposition, not CITEM analytical agreement.';
comment on column public.source_claim_assertions.source_qualifier is
  'Optional epistemic wording preserved from the source, such as likely, possibly, we assess, or according to third-party reporting.';
comment on column public.source_claim_assertions.mapping_origin is
  'How source wording was mapped to the canonical proposition. AI_SUGGESTED always means analyst-accepted suggestion, never autonomous persistence.';
