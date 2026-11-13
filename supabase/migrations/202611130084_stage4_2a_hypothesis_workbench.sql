-- CITEM Stage 4.2 M2A: working hypotheses and analyst-assigned evidence roles.
-- Hypotheses are provisional; Source Claims remain descriptions of reporting, not truth.
-- No existing Source/Claim/Canvas data is updated by this migration.
create table public.analytic_hypotheses (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 unique(project_id,id)
);
create table public.analytic_hypothesis_versions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null,
 hypothesis_id uuid not null,
 revision integer not null check(revision>0),
 title text not null check(char_length(trim(title)) between 8 and 160),
 proposition text not null check(char_length(trim(proposition)) between 20 and 4000),
 disconfirmation_test text not null check(char_length(trim(disconfirmation_test)) between 20 and 2000),
 status text not null check(status in ('OPEN','TESTING','RETIRED')),
 rationale text not null check(char_length(trim(rationale)) between 10 and 3000),
 authored_by uuid not null references auth.users(id) on delete restrict,
 authored_at timestamptz not null default now(),
 supersedes_id uuid,
 request_id uuid not null,
 input_sha256 text not null check(input_sha256 ~ '^[0-9a-f]{64}$'),
 foreign key(project_id,hypothesis_id) references public.analytic_hypotheses(project_id,id) on delete cascade,
 unique(project_id,hypothesis_id,revision),
 unique(project_id,hypothesis_id,id),
 unique(project_id,request_id),
 constraint hypothesis_version_chain check((revision=1 and supersedes_id is null) or (revision>1 and supersedes_id is not null)),
 constraint hypothesis_version_parent foreign key(project_id,hypothesis_id,supersedes_id)
   references public.analytic_hypothesis_versions(project_id,hypothesis_id,id) on delete restrict
);
create index analytic_hypotheses_project_idx on public.analytic_hypotheses(project_id,created_at desc);
create index analytic_hypothesis_versions_current_idx on public.analytic_hypothesis_versions(project_id,hypothesis_id,revision desc);

-- Evidence roles always refer to an individual source position, never a free-text citation
-- or a claim-wide truth judgement. No FK to Stage 3: unlink must preserve audit history.
create table public.analytic_hypothesis_evidence_reviews (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null,
 hypothesis_id uuid not null,
 assertion_id uuid not null,
 revision integer not null check(revision>0),
 role text not null check(role in ('SUPPORTS','CONTRADICTS','CONTEXT','WITHDRAWN')),
 rationale text not null check(char_length(trim(rationale)) between 20 and 4000),
 reviewed_by uuid not null references auth.users(id) on delete restrict,
 reviewed_at timestamptz not null default now(),
 supersedes_id uuid,
 request_id uuid not null,
 input_sha256 text not null check(input_sha256 ~ '^[0-9a-f]{64}$'),
 source_id_snapshot uuid not null,
 claim_id_snapshot uuid not null,
 source_label_snapshot text not null,
 claim_summary_snapshot text not null,
 stance_snapshot text not null,
 assertion_updated_at timestamptz not null,
 claim_updated_at timestamptz not null,
 annotation_updated_at timestamptz not null,
 source_updated_at timestamptz not null,
 foreign key(project_id,hypothesis_id) references public.analytic_hypotheses(project_id,id) on delete cascade,
 unique(project_id,hypothesis_id,assertion_id,revision),
 unique(project_id,hypothesis_id,assertion_id,id),
 unique(project_id,request_id),
 constraint hypothesis_evidence_chain check((revision=1 and supersedes_id is null) or (revision>1 and supersedes_id is not null)),
 constraint hypothesis_evidence_parent foreign key(project_id,hypothesis_id,assertion_id,supersedes_id)
   references public.analytic_hypothesis_evidence_reviews(project_id,hypothesis_id,assertion_id,id) on delete restrict
);
create index analytic_hypothesis_evidence_latest_idx on public.analytic_hypothesis_evidence_reviews(project_id,hypothesis_id,assertion_id,revision desc);

alter table public.analytic_hypotheses enable row level security;
alter table public.analytic_hypothesis_versions enable row level security;
alter table public.analytic_hypothesis_evidence_reviews enable row level security;
revoke all on public.analytic_hypotheses,public.analytic_hypothesis_versions,
 public.analytic_hypothesis_evidence_reviews from public,anon,authenticated;
grant select on public.analytic_hypotheses,public.analytic_hypothesis_versions,
 public.analytic_hypothesis_evidence_reviews to authenticated;
create policy analytic_hypotheses_owned on public.analytic_hypotheses for select to authenticated
 using(public.project_is_owned(project_id));
create policy analytic_hypothesis_versions_owned on public.analytic_hypothesis_versions for select to authenticated
 using(public.project_is_owned(project_id));
create policy analytic_hypothesis_evidence_owned on public.analytic_hypothesis_evidence_reviews for select to authenticated
 using(public.project_is_owned(project_id));

create view public.analytic_hypothesis_current_v1 with (security_invoker=true) as
 select distinct on(project_id,hypothesis_id) * from public.analytic_hypothesis_versions
 order by project_id,hypothesis_id,revision desc;
create view public.analytic_hypothesis_evidence_current_v1 with (security_invoker=true) as
 select distinct on(project_id,hypothesis_id,assertion_id) *
 from public.analytic_hypothesis_evidence_reviews
 order by project_id,hypothesis_id,assertion_id,revision desc;
revoke all on public.analytic_hypothesis_current_v1,public.analytic_hypothesis_evidence_current_v1 from public,anon,authenticated;
grant select on public.analytic_hypothesis_current_v1,public.analytic_hypothesis_evidence_current_v1 to authenticated;

create function public.protect_analytic_hypothesis_history_v1() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' or exists(select 1 from public.projects p where p.id=old.project_id) then
  raise exception 'ANALYTIC_HISTORY_IMMUTABLE' using errcode='23514';
 end if;
 return old;
end $$;
create trigger analytic_hypotheses_protect before update or delete on public.analytic_hypotheses
 for each row execute function public.protect_analytic_hypothesis_history_v1();
create trigger analytic_hypothesis_versions_protect before update or delete on public.analytic_hypothesis_versions
 for each row execute function public.protect_analytic_hypothesis_history_v1();
create trigger analytic_hypothesis_evidence_protect before update or delete on public.analytic_hypothesis_evidence_reviews
 for each row execute function public.protect_analytic_hypothesis_history_v1();
revoke all on function public.protect_analytic_hypothesis_history_v1() from public,anon,authenticated;

-- Both create and revise use this one owner-checked, versioned and idempotent writer.
create function public.save_analytic_hypothesis_v1(
 p_project_id uuid,p_hypothesis_id uuid,p_title text,p_proposition text,
 p_disconfirmation_test text,p_status text,p_rationale text,
 p_expected_current_version_id uuid,p_request_id uuid
) returns table(hypothesis_id uuid,version_id uuid,replayed boolean)
language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid := auth.uid();
 v_title text := trim(coalesce(p_title,''));
 v_statement text := trim(coalesce(p_proposition,''));
 v_test text := trim(coalesce(p_disconfirmation_test,''));
 v_why text := trim(coalesce(p_rationale,''));
 v_current public.analytic_hypothesis_versions%rowtype;
 v_existing public.analytic_hypothesis_versions%rowtype;
 v_hypothesis uuid := coalesce(p_hypothesis_id,gen_random_uuid());
 v_version uuid := gen_random_uuid();
 v_sha text;
begin
 if v_uid is null or p_project_id is null or p_request_id is null or not exists(
   select 1 from public.projects p where p.id=p_project_id and p.owner_id=v_uid
 ) then raise exception 'NOT_FOUND' using errcode='42501'; end if;
 if char_length(v_title) not between 8 and 160 or
    char_length(v_statement) not between 20 and 4000 or
    char_length(v_test) not between 20 and 2000 or
    char_length(v_why) not between 10 and 3000 or
    p_status is null or p_status not in ('OPEN','TESTING','RETIRED') then
    raise exception 'INVALID_HYPOTHESIS' using errcode='22023';
 end if;
 v_sha:=encode(sha256(convert_to(jsonb_build_object(
  'project',p_project_id,'hypothesis',p_hypothesis_id,'title',v_title,
  'proposition',v_statement,'test',v_test,'status',p_status,'rationale',v_why,
  'expected',p_expected_current_version_id)::text,'UTF8')),'hex');
 select * into v_existing from public.analytic_hypothesis_versions v
 where v.project_id=p_project_id and v.request_id=p_request_id;
 if found then
  if v_existing.input_sha256=v_sha and v_existing.authored_by=v_uid then
    return query select v_existing.hypothesis_id,v_existing.id,true;return;
  end if;
  raise exception 'REQUEST_ID_REUSED' using errcode='23505';
 end if;
 if p_hypothesis_id is null then
  if p_expected_current_version_id is not null then
   raise exception 'INVALID_INITIAL_REVISION' using errcode='22023';
  end if;
  insert into public.analytic_hypotheses(id,project_id,created_by)
  values(v_hypothesis,p_project_id,v_uid);
 else
  perform 1 from public.analytic_hypotheses h
   where h.project_id=p_project_id and h.id=p_hypothesis_id for update;
  if not found then raise exception 'HYPOTHESIS_NOT_FOUND' using errcode='42501'; end if;
  select * into v_current from public.analytic_hypothesis_versions v
   where v.project_id=p_project_id and v.hypothesis_id=v_hypothesis
   order by v.revision desc limit 1;
  if v_current.id is distinct from p_expected_current_version_id then
   raise exception 'EDIT_CONFLICT' using errcode='40001';
  end if;
 end if;
 insert into public.analytic_hypothesis_versions(
   id,project_id,hypothesis_id,revision,title,proposition,disconfirmation_test,
   status,rationale,authored_by,supersedes_id,request_id,input_sha256
 ) values(v_version,p_project_id,v_hypothesis,coalesce(v_current.revision,0)+1,
   v_title,v_statement,v_test,p_status,v_why,v_uid,v_current.id,p_request_id,v_sha);
 return query select v_hypothesis,v_version,false;
end $$;
revoke all on function public.save_analytic_hypothesis_v1(
 uuid,uuid,text,text,text,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_analytic_hypothesis_v1(
 uuid,uuid,text,text,text,text,text,uuid,uuid) to authenticated;

-- Explicit role review for one *source-position assertion* on one hypothesis.
-- No numerical confidence and no automatic promotion of evidence to a fact.
create function public.save_analytic_hypothesis_evidence_v1(
 p_project_id uuid,p_hypothesis_id uuid,p_assertion_id uuid,
 p_role text,p_rationale text,p_expected_current_review_id uuid,
 p_expected_context jsonb,p_request_id uuid
) returns table(review_id uuid,replayed boolean)
language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid := auth.uid();
 v_hyp public.analytic_hypotheses%rowtype;
 v_version public.analytic_hypothesis_versions%rowtype;
 v_assertion public.source_claim_assertions%rowtype;
 v_claim public.source_claims%rowtype;
 v_annotation public.source_annotations%rowtype;
 v_source public.sources%rowtype;
 v_current public.analytic_hypothesis_evidence_reviews%rowtype;
 v_existing public.analytic_hypothesis_evidence_reviews%rowtype;
 v_why text:=trim(coalesce(p_rationale,''));
 v_sha text;
 v_id uuid:=gen_random_uuid();
begin
 if v_uid is null or p_project_id is null or p_hypothesis_id is null or
    p_assertion_id is null or p_request_id is null or not exists(
      select 1 from public.projects p where p.id=p_project_id and p.owner_id=v_uid
    ) then raise exception 'NOT_FOUND' using errcode='42501';end if;
 if p_role is null or p_role not in ('SUPPORTS','CONTRADICTS','CONTEXT','WITHDRAWN') or
    char_length(v_why) not between 20 and 4000 then
    raise exception 'INVALID_EVIDENCE_ROLE' using errcode='22023';end if;
 perform 1 from public.analytic_hypotheses h where h.id=p_hypothesis_id and h.project_id=p_project_id for update;
 if not found then raise exception 'HYPOTHESIS_NOT_FOUND' using errcode='42501';end if;
 select * into v_version from public.analytic_hypothesis_versions x
   where x.project_id=p_project_id and x.hypothesis_id=p_hypothesis_id
   order by x.revision desc limit 1;
 if v_version.status='RETIRED' then raise exception 'HYPOTHESIS_RETIRED' using errcode='22023';end if;
 select * into v_assertion from public.source_claim_assertions a
   where a.project_id=p_project_id and a.id=p_assertion_id for share;
 if not found then raise exception 'ASSERTION_UNAVAILABLE' using errcode='42501';end if;
 select * into v_claim from public.source_claims c
  where c.project_id=p_project_id and c.id=v_assertion.source_claim_id for share;
 select * into v_annotation from public.source_annotations a
  where a.project_id=p_project_id and a.id=v_assertion.source_annotation_id for share;
 if v_annotation.id is null or v_claim.id is null then
    raise exception 'PROVENANCE_MISSING' using errcode='42501';end if;
 select * into v_source from public.sources s
  where s.project_id=p_project_id and s.id=v_annotation.source_id for share;
 if v_source.id is null or v_source.archived_at is not null then
    raise exception 'SOURCE_UNAVAILABLE' using errcode='22023';end if;
 v_sha:=encode(sha256(convert_to(jsonb_build_object(
  'project',p_project_id,'hypothesis',p_hypothesis_id,'assertion',p_assertion_id,
  'role',p_role,'why',v_why,'expected',p_expected_current_review_id,
  'context',p_expected_context)::text,'UTF8')),'hex');
 select * into v_existing from public.analytic_hypothesis_evidence_reviews e
  where e.project_id=p_project_id and e.request_id=p_request_id;
 if found then
  if v_existing.input_sha256=v_sha and v_existing.reviewed_by=v_uid then
    return query select v_existing.id,true;return;
  end if;
  raise exception 'REQUEST_ID_REUSED' using errcode='23505';
 end if;
 if p_expected_context is null or
   v_assertion.updated_at is distinct from (p_expected_context->>'assertionUpdatedAt')::timestamptz or
   v_claim.updated_at is distinct from (p_expected_context->>'claimUpdatedAt')::timestamptz or
   v_annotation.updated_at is distinct from (p_expected_context->>'annotationUpdatedAt')::timestamptz or
   v_source.updated_at is distinct from (p_expected_context->>'sourceUpdatedAt')::timestamptz then
   raise exception 'EVIDENCE_CONTEXT_CONFLICT' using errcode='40001';
 end if;
 select * into v_current from public.analytic_hypothesis_evidence_reviews e
  where e.project_id=p_project_id and e.hypothesis_id=p_hypothesis_id and e.assertion_id=p_assertion_id
  order by e.revision desc limit 1;
 if v_current.id is distinct from p_expected_current_review_id then
    raise exception 'EDIT_CONFLICT' using errcode='40001';end if;
 if p_role='WITHDRAWN' and v_current.id is null then
    raise exception 'NOTHING_TO_WITHDRAW' using errcode='22023';end if;
 insert into public.analytic_hypothesis_evidence_reviews(
   id,project_id,hypothesis_id,assertion_id,revision,role,rationale,reviewed_by,
   supersedes_id,request_id,input_sha256,source_id_snapshot,claim_id_snapshot,
   source_label_snapshot,claim_summary_snapshot,stance_snapshot,
   assertion_updated_at,claim_updated_at,annotation_updated_at,source_updated_at
 ) values(v_id,p_project_id,p_hypothesis_id,p_assertion_id,coalesce(v_current.revision,0)+1,
   p_role,v_why,v_uid,v_current.id,p_request_id,v_sha,v_source.id,v_claim.id,
   left(v_source.title,160),left(v_claim.claim_summary,400),v_assertion.stance::text,
   v_assertion.updated_at,v_claim.updated_at,v_annotation.updated_at,v_source.updated_at);
 return query select v_id,false;
end $$;
revoke all on function public.save_analytic_hypothesis_evidence_v1(
 uuid,uuid,uuid,text,text,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_analytic_hypothesis_evidence_v1(
 uuid,uuid,uuid,text,text,uuid,jsonb,uuid) to authenticated;
comment on table public.analytic_hypothesis_evidence_reviews is
 'Analyst evidence role is an epistemic association, not verified truth, source reliability, or information credibility.';
