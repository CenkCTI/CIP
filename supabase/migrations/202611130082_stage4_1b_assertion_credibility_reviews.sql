-- CITEM Stage 4.1 M1B: evaluate information from ONE provenance-bearing
-- Source Claim Assertion (1..6); never turn a Claim into a truth judgment.
-- Requires Stage 3 source_claim_assertions and M1A; additive and independent
-- of Canvas-3/4/5. No FK to mutable/deletable Source Claim or Assertion:
-- unlinking the original must not silently erase analyst review history.

create table public.assertion_credibility_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_claim_assertion_id uuid not null,
  revision integer not null check (revision > 0),
  credibility smallint not null check (credibility between 1 and 6),
  rationale text not null check (char_length(trim(rationale)) between 10 and 4000),
  independence_status text not null check (
    independence_status in ('UNKNOWN','PRIMARY_OBSERVATION',
      'SECONDARY_REPORT','ANALYST_VERIFIED_INDEPENDENT')),
  independence_rationale text not null default ''
    check (char_length(independence_rationale) <= 2000),
  verification_assertion_id uuid,
  verification_source_id uuid,
  method_version text not null check (method_version = 'ADMIRALTY_INFORMATION_V1'),
  assessed_by uuid not null references auth.users(id) on delete restrict,
  assessed_at timestamptz not null default now(),
  supersedes_id uuid,
  request_id uuid not null,
  input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  assertion_updated_at timestamptz not null,
  claim_updated_at timestamptz not null,
  annotation_updated_at timestamptz not null,
  source_updated_at timestamptz not null,
  assertion_context_fingerprint text not null
    check (assertion_context_fingerprint ~ '^[0-9a-f]{64}$'),
  assertion_identity_snapshot jsonb not null
    check (jsonb_typeof(assertion_identity_snapshot) = 'object'),
  unique (project_id, source_claim_assertion_id, revision),
  unique (project_id, request_id),
  unique (project_id, source_claim_assertion_id, id),
  constraint assertion_credibility_reviews_supersedes_fk
    foreign key (project_id, source_claim_assertion_id, supersedes_id)
    references public.assertion_credibility_reviews(project_id, source_claim_assertion_id, id)
    on delete restrict,
  constraint assertion_credibility_reviews_chain_check
    check ((revision=1 and supersedes_id is null) or
           (revision>1 and supersedes_id is not null)),
  -- Level 1 is never a single-source, uncorroborated assertion.
  constraint assertion_credibility_reviews_level_one_check check (
    credibility <> 1 or
    (independence_status='ANALYST_VERIFIED_INDEPENDENT'
     and verification_assertion_id is not null
     and verification_source_id is not null
     and char_length(trim(rationale)) >= 60
     and char_length(trim(independence_rationale)) >= 40)
  ),
  constraint assertion_credibility_reviews_confirmation_check check (
    (independence_status='ANALYST_VERIFIED_INDEPENDENT'
      and verification_assertion_id is not null and verification_source_id is not null
      and char_length(trim(independence_rationale)) >= 40)
    or
    (independence_status<>'ANALYST_VERIFIED_INDEPENDENT'
      and verification_assertion_id is null and verification_source_id is null
      and independence_rationale='')
  )
);

create index assertion_credibility_reviews_history_idx
  on public.assertion_credibility_reviews(project_id,source_claim_assertion_id,revision desc);

alter table public.assertion_credibility_reviews enable row level security;
revoke all on table public.assertion_credibility_reviews from public,anon,authenticated;
grant select on table public.assertion_credibility_reviews to authenticated;
create policy assertion_credibility_reviews_select_owned
  on public.assertion_credibility_reviews for select to authenticated
  using (public.project_is_owned(project_id));

-- Avoid mutable/deletable historical judgments, including privileged direct
-- writes. Project deletion still performs its explicit privacy cascade.
create function public.protect_assertion_credibility_review_history()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='UPDATE' or exists (
    select 1 from public.projects p where p.id=old.project_id
  ) then
    raise exception 'REVIEW_HISTORY_IMMUTABLE' using errcode='23514';
  end if;
  return old;
end
$$;
create trigger protect_assertion_credibility_review_history
before update or delete on public.assertion_credibility_reviews
for each row execute function public.protect_assertion_credibility_review_history();
revoke all on function public.protect_assertion_credibility_review_history()
  from public,anon,authenticated;

-- Serializes writers on the authoritative assertion row. Every connected
-- record and corroboration candidate is resolved and checked in THIS RPC,
-- not trusted from a browser. A verification reference alone never establishes
-- independence; a human must enter a detailed attestation.
create function public.save_assertion_credibility_review_v1(
  p_project_id uuid,
  p_assertion_id uuid,
  p_credibility integer,
  p_rationale text,
  p_independence_status text,
  p_independence_rationale text,
  p_verification_assertion_id uuid,
  p_method_version text,
  p_expected_current_review_id uuid,
  p_request_id uuid,
  p_expected_context jsonb
) returns table(review_id uuid,replayed boolean,reviewed_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_assertion public.source_claim_assertions%rowtype;
  v_claim public.source_claims%rowtype;
  v_annotation public.source_annotations%rowtype;
  v_source public.sources%rowtype;
  v_verifier public.source_claim_assertions%rowtype;
  v_verifier_annotation public.source_annotations%rowtype;
  v_verifier_source public.sources%rowtype;
  v_existing public.assertion_credibility_reviews%rowtype;
  v_current public.assertion_credibility_reviews%rowtype;
  v_rationale text := trim(coalesce(p_rationale,''));
  v_independence_rationale text := trim(coalesce(p_independence_rationale,''));
  v_input_sha text;
  v_context_sha text;
  v_snapshot jsonb;
  v_verified_source_id uuid;
  v_review_id uuid := gen_random_uuid();
  v_assessed_at timestamptz := clock_timestamp();
begin
  if v_uid is null or p_project_id is null or p_assertion_id is null or
     p_request_id is null or not exists (
       select 1 from public.projects p
       where p.id=p_project_id and p.owner_id=v_uid
     ) then
    raise exception 'NOT_FOUND' using errcode='42501';
  end if;
  if p_credibility is null or p_credibility not between 1 and 6 or
     char_length(v_rationale) not between 10 and 4000 or
     p_method_version is distinct from 'ADMIRALTY_INFORMATION_V1' or
     p_independence_status is null or p_independence_status not in (
       'UNKNOWN','PRIMARY_OBSERVATION','SECONDARY_REPORT',
       'ANALYST_VERIFIED_INDEPENDENT') or
     char_length(v_independence_rationale)>2000 then
    raise exception 'INVALID_REVIEW' using errcode='22023';
  end if;
  if (p_independence_status='ANALYST_VERIFIED_INDEPENDENT' and
      (p_verification_assertion_id is null or
       char_length(v_independence_rationale)<40)) or
     (p_independence_status<>'ANALYST_VERIFIED_INDEPENDENT' and
      (p_verification_assertion_id is not null or v_independence_rationale<>'')) or
     (p_credibility=1 and
      (p_independence_status<>'ANALYST_VERIFIED_INDEPENDENT' or
       char_length(v_rationale)<60)) then
    raise exception 'CORROBORATION_REQUIRED' using errcode='22023';
  end if;

  select * into v_assertion from public.source_claim_assertions a
  where a.project_id=p_project_id and a.id=p_assertion_id for update;
  if not found then
    raise exception 'ASSERTION_NOT_FOUND' using errcode='42501';
  end if;
  select * into v_claim from public.source_claims c
  where c.project_id=p_project_id and c.id=v_assertion.source_claim_id for share;
  if not found then
    raise exception 'CLAIM_NOT_FOUND' using errcode='42501';
  end if;
  select * into v_annotation from public.source_annotations a
  where a.project_id=p_project_id and a.id=v_assertion.source_annotation_id for share;
  if not found then
    raise exception 'ANNOTATION_NOT_FOUND' using errcode='42501';
  end if;
  select * into v_source from public.sources s
  where s.project_id=p_project_id and s.id=v_annotation.source_id for share;
  if not found then
    raise exception 'SOURCE_NOT_FOUND' using errcode='42501';
  end if;

  v_input_sha := encode(sha256(convert_to(jsonb_build_object(
    'assertionId',p_assertion_id,'credibility',p_credibility,
    'rationale',v_rationale,'independenceStatus',p_independence_status,
    'independenceRationale',v_independence_rationale,
    'verificationAssertionId',p_verification_assertion_id,
    'methodVersion',p_method_version,
    'expectedCurrentReviewId',p_expected_current_review_id,
    'expectedContext',p_expected_context
  )::text,'UTF8')),'hex');

  -- Replays are checked before staleness even after a newer review is saved.
  select * into v_existing from public.assertion_credibility_reviews r
  where r.project_id=p_project_id and r.request_id=p_request_id;
  if found then
    if v_existing.source_claim_assertion_id=p_assertion_id and
       v_existing.input_sha256=v_input_sha and v_existing.assessed_by=v_uid then
      return query select v_existing.id,true,v_existing.assessed_at;
      return;
    end if;
    raise exception 'REQUEST_ID_REUSED' using errcode='23505';
  end if;

  -- Reject a review if any authoritative subject changed after the inspector loaded.
  if p_expected_context is null or
     v_assertion.updated_at is distinct from (p_expected_context->>'assertionUpdatedAt')::timestamptz or
     v_claim.updated_at is distinct from (p_expected_context->>'claimUpdatedAt')::timestamptz or
     v_annotation.updated_at is distinct from (p_expected_context->>'annotationUpdatedAt')::timestamptz or
     v_source.updated_at is distinct from (p_expected_context->>'sourceUpdatedAt')::timestamptz then
    raise exception 'SOURCE_CONTEXT_CONFLICT' using errcode='40001';
  end if;

  if v_source.archived_at is not null then
    raise exception 'SOURCE_ARCHIVED' using errcode='22023';
  end if;

  -- A verification witness must be a DIFFERENT source asserting (or denying)
  -- the SAME canonical proposition with a matching, explicit stance.
  if p_verification_assertion_id is not null then
    if p_verification_assertion_id=p_assertion_id or
       v_assertion.stance::text not in ('ASSERTS','DENIES') then
      raise exception 'INVALID_VERIFICATION_WITNESS' using errcode='22023';
    end if;
    select * into v_verifier from public.source_claim_assertions a
    where a.project_id=p_project_id and a.id=p_verification_assertion_id
      and a.source_claim_id=v_assertion.source_claim_id
      and a.stance=v_assertion.stance for share;
    if not found then
      raise exception 'INVALID_VERIFICATION_WITNESS' using errcode='22023';
    end if;
    select * into v_verifier_annotation from public.source_annotations a
    where a.project_id=p_project_id and a.id=v_verifier.source_annotation_id for share;
    if not found then
      raise exception 'INVALID_VERIFICATION_WITNESS' using errcode='22023';
    end if;
    if v_verifier_annotation.source_id=v_annotation.source_id then
      raise exception 'SAME_SOURCE_NOT_INDEPENDENT' using errcode='22023';
    end if;
    select * into v_verifier_source from public.sources s
    where s.project_id=p_project_id and s.id=v_verifier_annotation.source_id
    for share;
    if not found or v_verifier_source.archived_at is not null then
      raise exception 'INVALID_VERIFICATION_WITNESS' using errcode='22023';
    end if;
    v_verified_source_id := v_verifier_source.id;
  end if;

  select * into v_current from public.assertion_credibility_reviews r
  where r.project_id=p_project_id and r.source_claim_assertion_id=p_assertion_id
  order by r.revision desc limit 1;
  if v_current.id is distinct from p_expected_current_review_id then
    raise exception 'EDIT_CONFLICT' using errcode='40001';
  end if;

  -- Bounded identity snapshot; no selected_text, PDF contents, storage paths,
  -- full source text, signed URLs, secrets or arbitrary metadata.
  v_snapshot := jsonb_build_object(
    'claimId',v_claim.id,'annotationId',v_annotation.id,
    'sourceId',v_source.id,'sourceTitle',left(v_source.title,200),
    'claimSummary',left(v_claim.claim_summary,240),
    'stance',v_assertion.stance::text,'verificationSourceId',v_verified_source_id
  );
  v_context_sha := encode(sha256(convert_to(jsonb_build_object(
    'assertionUpdatedAt',v_assertion.updated_at,
    'claimUpdatedAt',v_claim.updated_at,
    'annotationUpdatedAt',v_annotation.updated_at,
    'sourceUpdatedAt',v_source.updated_at,
    'claimContentSha',encode(sha256(convert_to(v_claim.claim_summary,'UTF8')),'hex'),
    'annotationTextSha',encode(sha256(convert_to(
      coalesce(v_annotation.selected_text,'') || coalesce(v_annotation.comment,''),
      'UTF8')),'hex'),'identity',v_snapshot
  )::text,'UTF8')),'hex');

  insert into public.assertion_credibility_reviews (
    id,project_id,source_claim_assertion_id,revision,credibility,rationale,
    independence_status,independence_rationale,verification_assertion_id,
    verification_source_id,method_version,assessed_by,assessed_at,
    supersedes_id,request_id,input_sha256,assertion_updated_at,
    claim_updated_at,annotation_updated_at,source_updated_at,
    assertion_context_fingerprint,assertion_identity_snapshot
  ) values (
    v_review_id,p_project_id,p_assertion_id,coalesce(v_current.revision,0)+1,
    p_credibility,v_rationale,p_independence_status,v_independence_rationale,
    p_verification_assertion_id,v_verified_source_id,p_method_version,v_uid,
    v_assessed_at,v_current.id,p_request_id,v_input_sha,v_assertion.updated_at,
    v_claim.updated_at,v_annotation.updated_at,v_source.updated_at,
    v_context_sha,v_snapshot
  );
  return query select v_review_id,false,v_assessed_at;
end
$$;

revoke all on function public.save_assertion_credibility_review_v1(
  uuid,uuid,integer,text,text,text,uuid,text,uuid,uuid,jsonb
) from public,anon,authenticated;
grant execute on function public.save_assertion_credibility_review_v1(
  uuid,uuid,integer,text,text,text,uuid,text,uuid,uuid,jsonb
) to authenticated;

comment on table public.assertion_credibility_reviews is
  'Append-only, provenance-bound 1..6 information credibility. 6 means cannot judge; absent row means not evaluated. Neither means Source Claim truth or analytic confidence.';
