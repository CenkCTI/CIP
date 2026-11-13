-- Disposable PostgreSQL 16/17 acceptance; NEVER run against live Supabase.
create role authenticated nologin;
create role anon nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
create table public.projects(id uuid primary key,owner_id uuid not null references auth.users(id));
create function public.project_is_owned(p_id uuid) returns boolean language sql stable as $$
  select exists(select 1 from public.projects p where p.id=p_id and p.owner_id=auth.uid());
$$;
create type public.source_claim_stance as enum ('ASSERTS','DENIES','QUALIFIES','UNCLEAR');
create table public.sources(
  id uuid primary key,project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,updated_at timestamptz not null default now(),archived_at timestamptz
);
create table public.source_claims(
  id uuid primary key,project_id uuid not null references public.projects(id) on delete cascade,
  claim_summary text not null,updated_at timestamptz not null default now(),
  unique(project_id,id)
);
create table public.source_annotations(
  id uuid primary key,project_id uuid not null references public.projects(id) on delete cascade,
  source_id uuid not null references public.sources(id),selected_text text,
  comment text,updated_at timestamptz not null default now(),unique(project_id,id)
);
create table public.source_claim_assertions(
  id uuid primary key,project_id uuid not null references public.projects(id) on delete cascade,
  source_claim_id uuid not null,source_annotation_id uuid not null,
  stance public.source_claim_stance not null default 'ASSERTS',
  source_qualifier text,updated_at timestamptz not null default now(),
  foreign key(project_id,source_claim_id) references public.source_claims(project_id,id) on delete cascade,
  foreign key(project_id,source_annotation_id) references public.source_annotations(project_id,id),
  unique(project_id,id)
);
grant usage on schema public,auth to authenticated,anon;
grant execute on function auth.uid() to authenticated;
grant execute on function public.project_is_owned(uuid) to authenticated;
grant select on public.projects,public.sources,public.source_claims,
  public.source_annotations,public.source_claim_assertions to authenticated;
alter table public.sources enable row level security;
alter table public.source_claims enable row level security;
alter table public.source_annotations enable row level security;
alter table public.source_claim_assertions enable row level security;
create policy own_sources on public.sources for select to authenticated using(public.project_is_owned(project_id));
create policy own_claims on public.source_claims for select to authenticated using(public.project_is_owned(project_id));
create policy own_annotations on public.source_annotations for select to authenticated using(public.project_is_owned(project_id));
create policy own_assertions on public.source_claim_assertions for select to authenticated using(public.project_is_owned(project_id));

insert into auth.users(id) values
 ('58a138e3-6ff0-4e85-b00e-51b9474c0001'),
 ('58a138e3-6ff0-4e85-b00e-51b9474c0002');
insert into public.projects(id,owner_id) values
 ('9c972aae-0a28-4fc7-8769-b617bedb0001','58a138e3-6ff0-4e85-b00e-51b9474c0001'),
 ('9c972aae-0a28-4fc7-8769-b617bedb0002','58a138e3-6ff0-4e85-b00e-51b9474c0002');
insert into public.sources(id,project_id,title) values
 ('7b5d557f-6f09-4ac2-b7e7-08abbd0b0001','9c972aae-0a28-4fc7-8769-b617bedb0001','Original technical source'),
 ('7b5d557f-6f09-4ac2-b7e7-08abbd0b0002','9c972aae-0a28-4fc7-8769-b617bedb0001','Independent reporter'),
 ('7b5d557f-6f09-4ac2-b7e7-08abbd0b0003','9c972aae-0a28-4fc7-8769-b617bedb0002','Foreign source');
insert into public.source_claims(id,project_id,claim_summary) values
 ('bb5d557f-6f09-4ac2-b7e7-08abbd0b0001','9c972aae-0a28-4fc7-8769-b617bedb0001','A campaign used a particular infrastructure pattern.'),
 ('bb5d557f-6f09-4ac2-b7e7-08abbd0b0002','9c972aae-0a28-4fc7-8769-b617bedb0002','Foreign claim');
insert into public.source_annotations(id,project_id,source_id,selected_text) values
 ('cc5d557f-6f09-4ac2-b7e7-08abbd0b0001','9c972aae-0a28-4fc7-8769-b617bedb0001','7b5d557f-6f09-4ac2-b7e7-08abbd0b0001','Original reporting text'),
 ('cc5d557f-6f09-4ac2-b7e7-08abbd0b0002','9c972aae-0a28-4fc7-8769-b617bedb0001','7b5d557f-6f09-4ac2-b7e7-08abbd0b0002','Independent source text'),
 ('cc5d557f-6f09-4ac2-b7e7-08abbd0b0003','9c972aae-0a28-4fc7-8769-b617bedb0001','7b5d557f-6f09-4ac2-b7e7-08abbd0b0001','Same source text'),
 ('cc5d557f-6f09-4ac2-b7e7-08abbd0b0004','9c972aae-0a28-4fc7-8769-b617bedb0002','7b5d557f-6f09-4ac2-b7e7-08abbd0b0003','Foreign source text');
insert into public.source_claim_assertions(id,project_id,source_claim_id,source_annotation_id,stance) values
 ('dd5d557f-6f09-4ac2-b7e7-08abbd0b0001','9c972aae-0a28-4fc7-8769-b617bedb0001','bb5d557f-6f09-4ac2-b7e7-08abbd0b0001','cc5d557f-6f09-4ac2-b7e7-08abbd0b0001','ASSERTS'),
 ('dd5d557f-6f09-4ac2-b7e7-08abbd0b0002','9c972aae-0a28-4fc7-8769-b617bedb0001','bb5d557f-6f09-4ac2-b7e7-08abbd0b0001','cc5d557f-6f09-4ac2-b7e7-08abbd0b0002','ASSERTS'),
 ('dd5d557f-6f09-4ac2-b7e7-08abbd0b0003','9c972aae-0a28-4fc7-8769-b617bedb0001','bb5d557f-6f09-4ac2-b7e7-08abbd0b0001','cc5d557f-6f09-4ac2-b7e7-08abbd0b0003','ASSERTS'),
 ('dd5d557f-6f09-4ac2-b7e7-08abbd0b0004','9c972aae-0a28-4fc7-8769-b617bedb0002','bb5d557f-6f09-4ac2-b7e7-08abbd0b0002','cc5d557f-6f09-4ac2-b7e7-08abbd0b0004','ASSERTS');

\i supabase/migrations/202611130082_stage4_1b_assertion_credibility_reviews.sql
set role authenticated;
select set_config('request.jwt.claim.sub','58a138e3-6ff0-4e85-b00e-51b9474c0001',false);
do $$
declare
  p uuid := '9c972aae-0a28-4fc7-8769-b617bedb0001';
  a uuid := 'dd5d557f-6f09-4ac2-b7e7-08abbd0b0001';
  other uuid := 'dd5d557f-6f09-4ac2-b7e7-08abbd0b0002';
  same_source uuid := 'dd5d557f-6f09-4ac2-b7e7-08abbd0b0003';
  first_review uuid;
  second_review uuid;
  replayed_flag boolean;
  why text := 'The independently obtained observation confirms the described infrastructure pattern and was checked against primary telemetry.';
  independence text := 'Separate first-hand telemetry collection; neither author cited or copied the other report.';
begin
  assert (select count(*) from public.assertion_credibility_reviews)=0,
    'No review must mean Not evaluated, not 6';
  begin
    perform public.save_assertion_credibility_review_v1(p,a,1,why,
      'UNKNOWN','',null,'ADMIRALTY_INFORMATION_V1',null,
      'ce1f11c5-ea5d-4d7a-97d4-91cc8c940101');
    raise exception 'UNVERIFIED_LEVEL_ONE_ACCEPTED';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.save_assertion_credibility_review_v1(p,a,1,why,
      'ANALYST_VERIFIED_INDEPENDENT',independence,same_source,
      'ADMIRALTY_INFORMATION_V1',null,'ce1f11c5-ea5d-4d7a-97d4-91cc8c940102');
    raise exception 'SAME_SOURCE_ALLOWED';
  exception when sqlstate '22023' then null;
  end;
  select review_id,replayed into first_review,replayed_flag
    from public.save_assertion_credibility_review_v1(p,a,6,
      'This report cannot yet be verified without independent original reporting.',
      'UNKNOWN','',null,'ADMIRALTY_INFORMATION_V1',null,
      'ce1f11c5-ea5d-4d7a-97d4-91cc8c940103');
  assert first_review is not null and replayed_flag=false,'First review persisted';
  assert (select revision from public.assertion_credibility_reviews where id=first_review)=1,
    'Revision 1';
  assert (select assertion_identity_snapshot ? 'selected_text'
    from public.assertion_credibility_reviews where id=first_review)=false,
    'No source quote copied into historical identity snapshot';
  select review_id,replayed into second_review,replayed_flag
    from public.save_assertion_credibility_review_v1(p,a,6,
      'This report cannot yet be verified without independent original reporting.',
      'UNKNOWN','',null,'ADMIRALTY_INFORMATION_V1',null,
      'ce1f11c5-ea5d-4d7a-97d4-91cc8c940103');
  assert second_review=first_review and replayed_flag,'Idempotent retry';
  begin
    perform public.save_assertion_credibility_review_v1(p,a,4,
      'Changed payload with reused idempotency key.','UNKNOWN','',null,
      'ADMIRALTY_INFORMATION_V1',null,'ce1f11c5-ea5d-4d7a-97d4-91cc8c940103');
    raise exception 'REQUEST_REUSE_ACCEPTED';
  exception when unique_violation then null;
  end;
  begin
    perform public.save_assertion_credibility_review_v1(p,a,3,
      'Stale expected review must not be accepted.','UNKNOWN','',null,
      'ADMIRALTY_INFORMATION_V1',null,'ce1f11c5-ea5d-4d7a-97d4-91cc8c940104');
    raise exception 'STALE_REVISION_ACCEPTED';
  exception when serialization_failure then null;
  end;
  select review_id into second_review from public.save_assertion_credibility_review_v1(
    p,a,1,why,'ANALYST_VERIFIED_INDEPENDENT',independence,other,
    'ADMIRALTY_INFORMATION_V1',first_review,'ce1f11c5-ea5d-4d7a-97d4-91cc8c940105');
  assert (select count(*) from public.assertion_credibility_reviews)=2,
    'Append-only history expected';
  assert (select revision from public.assertion_credibility_reviews where id=second_review)=2,
    'Revision 2';
  assert (select supersedes_id from public.assertion_credibility_reviews where id=second_review)=first_review,
    'History must supersede previous review';
  assert (select verification_source_id from public.assertion_credibility_reviews where id=second_review)
    = '7b5d557f-6f09-4ac2-b7e7-08abbd0b0002'::uuid,
    'Verification source ID is resolved server side';
  begin
    perform public.save_assertion_credibility_review_v1(
      p,'dd5d557f-6f09-4ac2-b7e7-08abbd0b0004',3,
      'Cannot assess a foreign assertion.','UNKNOWN','',null,
      'ADMIRALTY_INFORMATION_V1',null,'ce1f11c5-ea5d-4d7a-97d4-91cc8c940106');
    raise exception 'CROSS_PROJECT_ACCEPTED';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.assertion_credibility_reviews where id=first_review;
    raise exception 'DIRECT_DELETE_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.assertion_credibility_reviews set credibility=4 where id=first_review;
    raise exception 'DIRECT_UPDATE_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.assertion_credibility_reviews(id,project_id,source_claim_assertion_id,
       revision,credibility,rationale,independence_status,method_version,
       assessed_by,request_id,input_sha256,assertion_updated_at,claim_updated_at,
       annotation_updated_at,source_updated_at,assertion_context_fingerprint,
       assertion_identity_snapshot)
    values(gen_random_uuid(),p,a,3,1,why,'UNKNOWN','ADMIRALTY_INFORMATION_V1',
       auth.uid(),'ce1f11c5-ea5d-4d7a-97d4-91cc8c940107',repeat('a',64),
       now(),now(),now(),now(),repeat('a',64),'{}');
    raise exception 'DIRECT_INSERT_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub','58a138e3-6ff0-4e85-b00e-51b9474c0002',false);
do $$ begin
  assert (select count(*) from public.assertion_credibility_reviews where
    project_id='9c972aae-0a28-4fc7-8769-b617bedb0001')=0,
    'Cross-Investigation read must be blocked';
end $$;
reset role;
-- Old judgment remains even if Stage 3 unlinks the assertion or claim.
delete from public.source_claim_assertions where id='dd5d557f-6f09-4ac2-b7e7-08abbd0b0001';
delete from public.source_claims where id='bb5d557f-6f09-4ac2-b7e7-08abbd0b0001';
do $$ begin
  assert (select count(*) from public.assertion_credibility_reviews)=2,
    'Stage 3 unlink unexpectedly deleted assessment history';
end $$;
-- Only an explicit Investigation privacy deletion purges its review history.
delete from public.projects where id='9c972aae-0a28-4fc7-8769-b617bedb0001';
do $$ begin
  assert (select count(*) from public.assertion_credibility_reviews)=0,
    'Investigation deletion must purge private reviews';
end $$;
select 'STAGE4_1B_POSTGRES_ACCEPTED' as result;
