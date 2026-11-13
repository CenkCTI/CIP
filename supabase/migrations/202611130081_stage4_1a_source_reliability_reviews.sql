-- CITEM Stage 4.1 M1A: source reliability assessment, separate from legacy
-- sources.reliability and from assertion credibility / analytic confidence.
-- Additive only; NEVER change previously deployed migrations or Canvas RPCs.
-- No FK to sources: a deleted Source must not cascade-delete historical reviews.

create table public.source_reliability_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_id uuid not null,
  revision integer not null check (revision > 0),
  rating text not null check (rating in ('A','B','C','D','E','F')),
  rationale text not null check (char_length(trim(rationale)) between 10 and 4000),
  method_version text not null check (method_version = 'ADMIRALTY_SOURCE_V1'),
  assessed_by uuid not null references auth.users(id) on delete restrict,
  assessed_at timestamptz not null default now(),
  supersedes_id uuid,
  request_id uuid not null,
  input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  source_updated_at timestamptz not null,
  source_context_fingerprint text not null
    check (source_context_fingerprint ~ '^[0-9a-f]{64}$'),
  source_identity_snapshot jsonb not null
    check (jsonb_typeof(source_identity_snapshot) = 'object'),
  unique (project_id, source_id, revision),
  unique (project_id, request_id),
  unique (project_id, source_id, id),
  constraint source_reliability_reviews_supersedes_fk
    foreign key (project_id, source_id, supersedes_id)
    references public.source_reliability_reviews(project_id, source_id, id)
    on delete restrict,
  constraint source_reliability_reviews_chain_check
    check ((revision = 1 and supersedes_id is null) or
           (revision > 1 and supersedes_id is not null))
);

create index source_reliability_reviews_history_idx
  on public.source_reliability_reviews(project_id, source_id, revision desc);

alter table public.source_reliability_reviews enable row level security;
revoke all on table public.source_reliability_reviews from public, anon, authenticated;
grant select on table public.source_reliability_reviews to authenticated;
create policy source_reliability_reviews_select_owned
  on public.source_reliability_reviews for select to authenticated
  using (public.project_is_owned(project_id));

-- Protect history even against accidental privileged UPDATE / DELETE. A project
-- owner may still delete the entire Investigation; its CASCADE removes reviews.
create function public.protect_source_reliability_review_history()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' or exists (
    select 1 from public.projects p where p.id = old.project_id
  ) then
    raise exception 'REVIEW_HISTORY_IMMUTABLE' using errcode = '23514';
  end if;
  return old;
end
$$;
create trigger protect_source_reliability_review_history
before update or delete on public.source_reliability_reviews
for each row execute function public.protect_source_reliability_review_history();

-- All authoritative fields and subject fingerprints are captured server-side.
-- The Source row lock serializes initial-review and concurrent-review writers;
-- it also serializes against Source UPDATE/DELETE while the receipt is created.
create function public.save_source_reliability_review_v1(
  p_project_id uuid,
  p_source_id uuid,
  p_rating text,
  p_rationale text,
  p_method_version text,
  p_expected_current_review_id uuid,
  p_request_id uuid
) returns table (review_id uuid, replayed boolean, reviewed_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_source public.sources%rowtype;
  v_existing public.source_reliability_reviews%rowtype;
  v_current public.source_reliability_reviews%rowtype;
  v_rationale text := trim(coalesce(p_rationale,''));
  v_input_sha text;
  v_context_sha text;
  v_snapshot jsonb;
  v_review_id uuid := gen_random_uuid();
  v_assessed_at timestamptz := clock_timestamp();
begin
  if v_uid is null or p_project_id is null or p_source_id is null or
     p_request_id is null or not exists (
       select 1 from public.projects p
       where p.id = p_project_id and p.owner_id = v_uid
     ) then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if p_rating is null or p_rating not in ('A','B','C','D','E','F') or
     p_method_version is distinct from 'ADMIRALTY_SOURCE_V1' or
     char_length(v_rationale) not between 10 and 4000 then
    raise exception 'INVALID_REVIEW' using errcode = '22023';
  end if;

  select * into v_source from public.sources s
  where s.project_id = p_project_id and s.id = p_source_id
  for update;
  if not found then
    raise exception 'SOURCE_NOT_FOUND' using errcode = '42501';
  end if;

  v_input_sha := encode(sha256(convert_to(jsonb_build_object(
    'sourceId',p_source_id,'rating',p_rating,'rationale',v_rationale,
    'methodVersion',p_method_version,'expectedCurrentReviewId',p_expected_current_review_id
  )::text, 'UTF8')), 'hex');

  -- Replay must win over the stale-revision check, even after other reviews.
  select * into v_existing from public.source_reliability_reviews r
  where r.project_id = p_project_id and r.request_id = p_request_id;
  if found then
    if v_existing.source_id = p_source_id and v_existing.input_sha256 = v_input_sha
       and v_existing.assessed_by = v_uid then
      return query select v_existing.id, true, v_existing.assessed_at;
      return;
    end if;
    raise exception 'REQUEST_ID_REUSED' using errcode = '23505';
  end if;

  if v_source.archived_at is not null then
    raise exception 'SOURCE_ARCHIVED' using errcode = '22023';
  end if;

  select * into v_current from public.source_reliability_reviews r
  where r.project_id = p_project_id and r.source_id = p_source_id
  order by r.revision desc limit 1;
  if v_current.id is distinct from p_expected_current_review_id then
    raise exception 'EDIT_CONFLICT' using errcode = '40001';
  end if;

  -- The minimal snapshot never captures source text, notes, PDFs, asset paths,
  -- signed URLs or arbitrary untrusted metadata.
  v_snapshot := jsonb_build_object(
    'title', v_source.title,
    'publisher', v_source.publisher,
    'sourceType', v_source.source_type::text
  );
  v_context_sha := encode(sha256(convert_to(jsonb_build_object(
    'sourceId',v_source.id,'updatedAt',v_source.updated_at,
    'archivedAt',v_source.archived_at,'identity',v_snapshot
  )::text,'UTF8')), 'hex');

  insert into public.source_reliability_reviews(
    id,project_id,source_id,revision,rating,rationale,method_version,
    assessed_by,assessed_at,supersedes_id,request_id,input_sha256,
    source_updated_at,source_context_fingerprint,source_identity_snapshot
  ) values (
    v_review_id,p_project_id,p_source_id,coalesce(v_current.revision,0)+1,
    p_rating,v_rationale,p_method_version,v_uid,v_assessed_at,
    v_current.id,p_request_id,v_input_sha,v_source.updated_at,
    v_context_sha,v_snapshot
  );
  return query select v_review_id, false, v_assessed_at;
end
$$;

revoke all on function public.save_source_reliability_review_v1(
  uuid,uuid,text,text,text,uuid,uuid
) from public, anon, authenticated;
grant execute on function public.save_source_reliability_review_v1(
  uuid,uuid,text,text,text,uuid,uuid
) to authenticated;

revoke all on function public.protect_source_reliability_review_history()
  from public, anon, authenticated;
comment on table public.source_reliability_reviews is
  'Append-only human source reliability A-F. F = cannot be judged; missing row = not evaluated. NOT source assertion credibility or analytic confidence.';
