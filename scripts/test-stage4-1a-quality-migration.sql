-- Disposable PG16/17 acceptance; NEVER run against live CITEM Supabase.
create role authenticated nologin;
create role anon nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create table public.projects(id uuid primary key,owner_id uuid not null references auth.users(id));
create function public.project_is_owned(p_id uuid) returns boolean language sql stable as $$
  select exists (select 1 from public.projects p where p.id=p_id and p.owner_id=auth.uid());
$$;
create table public.sources(
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  publisher text,
  source_type text not null,
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
grant usage on schema public,auth to authenticated;
grant select on public.projects,public.sources to authenticated;
grant execute on function auth.uid(),public.project_is_owned(uuid) to authenticated;
alter table public.sources enable row level security;
create policy sources_select_owner on public.sources for select to authenticated
  using (public.project_is_owned(project_id));
insert into auth.users(id) values
  ('58a138e3-6ff0-4e85-b00e-51b9474c0001'),
  ('58a138e3-6ff0-4e85-b00e-51b9474c0002');
insert into public.projects(id,owner_id) values
  ('9c972aae-0a28-4fc7-8769-b617bedb0001','58a138e3-6ff0-4e85-b00e-51b9474c0001'),
  ('9c972aae-0a28-4fc7-8769-b617bedb0002','58a138e3-6ff0-4e85-b00e-51b9474c0002');
insert into public.sources(id,project_id,title,publisher,source_type) values
  ('7b5d557f-6f09-4ac2-b7e7-08abbd0b0001','9c972aae-0a28-4fc7-8769-b617bedb0001','Source one','Test','TECHNICAL_REPORT'),
  ('7b5d557f-6f09-4ac2-b7e7-08abbd0b0002','9c972aae-0a28-4fc7-8769-b617bedb0002','Foreign source','Test','TECHNICAL_REPORT');

\i supabase/migrations/202611130081_stage4_1a_source_reliability_reviews.sql

set role authenticated;
select set_config('request.jwt.claim.sub','58a138e3-6ff0-4e85-b00e-51b9474c0001',false);
do $$
declare
  p uuid := '9c972aae-0a28-4fc7-8769-b617bedb0001';
  s uuid := '7b5d557f-6f09-4ac2-b7e7-08abbd0b0001';
  first_review uuid;
  next_review uuid;
  replayed_flag boolean;
begin
  assert (select count(*) from public.source_reliability_reviews)=0,
    'Missing review must not become F';
  select review_id,replayed into first_review,replayed_flag
  from public.save_source_reliability_review_v1(
    p,s,'B','Independent reporting history is generally credible.',
    'ADMIRALTY_SOURCE_V1',null,'ce1f11c5-ea5d-4d7a-97d4-91cc8c940011'
  );
  assert first_review is not null and replayed_flag=false,'First review inserted';
  assert (select revision from public.source_reliability_reviews r where r.id=first_review)=1,'Revision 1';
  assert (select source_identity_snapshot ? 'storage_path' from public.source_reliability_reviews r where r.id=first_review)=false,'No storage path in snapshot';
  select review_id,replayed into next_review,replayed_flag
  from public.save_source_reliability_review_v1(
    p,s,'B','Independent reporting history is generally credible.',
    'ADMIRALTY_SOURCE_V1',null,'ce1f11c5-ea5d-4d7a-97d4-91cc8c940011'
  );
  assert next_review=first_review and replayed_flag=true,'Idempotent replay';
  begin
    perform public.save_source_reliability_review_v1(
      p,s,'C','Different content with a reused idempotency key.',
      'ADMIRALTY_SOURCE_V1',null,'ce1f11c5-ea5d-4d7a-97d4-91cc8c940011');
    raise exception 'REUSED_REQUEST_WAS_ACCEPTED';
  exception when unique_violation then null;
  end;
  begin
    perform public.save_source_reliability_review_v1(
      p,s,'C','This expected revision is stale and must fail.',
      'ADMIRALTY_SOURCE_V1',null,'ce1f11c5-ea5d-4d7a-97d4-91cc8c940012');
    raise exception 'STALE_EXPECTED_REVISION_WAS_ACCEPTED';
  exception when serialization_failure then null;
  end;
  select review_id into next_review from public.save_source_reliability_review_v1(
    p,s,'C','New source context requires a narrower assessment.',
    'ADMIRALTY_SOURCE_V1',first_review,'ce1f11c5-ea5d-4d7a-97d4-91cc8c940013'
  );
  assert (select count(*) from public.source_reliability_reviews)=2,'Both revisions retained';
  assert (select revision from public.source_reliability_reviews r where r.id=next_review)=2,'Revision 2';
  assert (select supersedes_id from public.source_reliability_reviews r where r.id=next_review)=first_review,'History chain';
  begin
    perform public.save_source_reliability_review_v1(
      p,'7b5d557f-6f09-4ac2-b7e7-08abbd0b0002','A',
      'Foreign source must be rejected despite a known UUID.',
      'ADMIRALTY_SOURCE_V1',null,'ce1f11c5-ea5d-4d7a-97d4-91cc8c940014');
    raise exception 'CROSS_INVESTIGATION_WRITE_ACCEPTED';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.source_reliability_reviews(project_id,source_id,revision,rating,rationale,
      method_version,assessed_by,request_id,input_sha256,source_updated_at,
      source_context_fingerprint,source_identity_snapshot)
    values (p,s,3,'A','Direct write attempted illegally','ADMIRALTY_SOURCE_V1',auth.uid(),
      'ce1f11c5-ea5d-4d7a-97d4-91cc8c940015',repeat('a',64),now(),repeat('b',64),'{}');
    raise exception 'DIRECT_INSERT_ACCEPTED';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.source_reliability_reviews set rating='E' where id=first_review;
    raise exception 'DIRECT_UPDATE_ACCEPTED';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.source_reliability_reviews where id=first_review;
    raise exception 'DIRECT_DELETE_ACCEPTED';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Another user must not see owner1's history, even when they know project UUIDs.
select set_config('request.jwt.claim.sub','58a138e3-6ff0-4e85-b00e-51b9474c0002',false);
do $$ begin
  assert (select count(*) from public.source_reliability_reviews where
    project_id='9c972aae-0a28-4fc7-8769-b617bedb0001')=0,
    'RLS cross-project read leak';
end $$;
reset role;
-- A deleted Source does not destroy historical quality reviews.
delete from public.sources where id='7b5d557f-6f09-4ac2-b7e7-08abbd0b0001';
do $$ begin
  assert (select count(*) from public.source_reliability_reviews where
    source_id='7b5d557f-6f09-4ac2-b7e7-08abbd0b0001')=2,
    'Source deletion destroyed immutable reviews';
end $$;
-- Investigation deletion is allowed to purge private review records.
delete from public.projects where id='9c972aae-0a28-4fc7-8769-b617bedb0001';
do $$ begin
  assert (select count(*) from public.source_reliability_reviews)=0,
    'Project deletion should follow its privacy deletion lifecycle';
end $$;
select 'STAGE4_1A_POSTGRES_ACCEPTED' as result;
