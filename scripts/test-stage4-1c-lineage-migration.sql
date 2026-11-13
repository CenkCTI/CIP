-- Disposable PG16/17 only. Never run against production.
create role authenticated nologin;
create role anon nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
create table public.projects(id uuid primary key,owner_id uuid not null references auth.users(id));
create function public.project_is_owned(p_id uuid) returns boolean language sql stable as $$
 select exists(select 1 from public.projects p where p.id=p_id and p.owner_id=auth.uid()); $$;
create type public.source_claim_stance as enum ('ASSERTS','DENIES','QUALIFIES','UNCLEAR');
create table public.sources(id uuid primary key,project_id uuid not null references public.projects(id) on delete cascade,
 title text not null,updated_at timestamptz not null default now(),archived_at timestamptz);
create table public.source_claims(id uuid primary key,project_id uuid not null references public.projects(id) on delete cascade,
 claim_summary text not null,updated_at timestamptz not null default now(),unique(project_id,id));
create table public.source_annotations(id uuid primary key,project_id uuid not null references public.projects(id) on delete cascade,
 source_id uuid not null references public.sources(id),selected_text text,comment text,
 updated_at timestamptz not null default now(),unique(project_id,id));
create table public.source_claim_assertions(id uuid primary key,project_id uuid not null references public.projects(id) on delete cascade,
 source_claim_id uuid not null,source_annotation_id uuid not null,
 stance public.source_claim_stance not null default 'ASSERTS',
 updated_at timestamptz not null default now(),
 foreign key(project_id,source_claim_id) references public.source_claims(project_id,id) on delete cascade,
 foreign key(project_id,source_annotation_id) references public.source_annotations(project_id,id),unique(project_id,id));
-- Only columns referenced by the M1C safety trigger are necessary for this fixture.
create table public.assertion_credibility_reviews(id uuid primary key default gen_random_uuid(),
 project_id uuid not null,source_claim_assertion_id uuid not null,
 verification_assertion_id uuid, credibility integer not null);
grant usage on schema public,auth to authenticated,anon;
grant execute on function auth.uid() to authenticated;
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
 ('58a138e3-6ff0-4e85-b00e-51b9474c0001'),('58a138e3-6ff0-4e85-b00e-51b9474c0002');
insert into public.projects(id,owner_id) values
 ('9c972aae-0a28-4fc7-8769-b617bedb0001','58a138e3-6ff0-4e85-b00e-51b9474c0001'),
 ('9c972aae-0a28-4fc7-8769-b617bedb0002','58a138e3-6ff0-4e85-b00e-51b9474c0002');
insert into public.sources(id,project_id,title) values
 ('7b5d557f-6f09-4ac2-b7e7-08abbd0b0001','9c972aae-0a28-4fc7-8769-b617bedb0001','Original technical source'),
 ('7b5d557f-6f09-4ac2-b7e7-08abbd0b0002','9c972aae-0a28-4fc7-8769-b617bedb0001','Independent sensor collection'),
 ('7b5d557f-6f09-4ac2-b7e7-08abbd0b0003','9c972aae-0a28-4fc7-8769-b617bedb0002','Foreign source');
insert into public.source_claims(id,project_id,claim_summary) values
 ('bb5d557f-6f09-4ac2-b7e7-08abbd0b0001','9c972aae-0a28-4fc7-8769-b617bedb0001','Threat infrastructure observation'),
 ('bb5d557f-6f09-4ac2-b7e7-08abbd0b0002','9c972aae-0a28-4fc7-8769-b617bedb0002','Foreign claim');
insert into public.source_annotations(id,project_id,source_id,selected_text) values
 ('cc5d557f-6f09-4ac2-b7e7-08abbd0b0001','9c972aae-0a28-4fc7-8769-b617bedb0001','7b5d557f-6f09-4ac2-b7e7-08abbd0b0001','Original first-hand observation'),
 ('cc5d557f-6f09-4ac2-b7e7-08abbd0b0002','9c972aae-0a28-4fc7-8769-b617bedb0001','7b5d557f-6f09-4ac2-b7e7-08abbd0b0002','Separate sensor collection'),
 ('cc5d557f-6f09-4ac2-b7e7-08abbd0b0003','9c972aae-0a28-4fc7-8769-b617bedb0001','7b5d557f-6f09-4ac2-b7e7-08abbd0b0001','Same source retransmission'),
 ('cc5d557f-6f09-4ac2-b7e7-08abbd0b0004','9c972aae-0a28-4fc7-8769-b617bedb0002','7b5d557f-6f09-4ac2-b7e7-08abbd0b0003','Foreign observation');
insert into public.source_claim_assertions(id,project_id,source_claim_id,source_annotation_id,stance) values
 ('dd5d557f-6f09-4ac2-b7e7-08abbd0b0001','9c972aae-0a28-4fc7-8769-b617bedb0001','bb5d557f-6f09-4ac2-b7e7-08abbd0b0001','cc5d557f-6f09-4ac2-b7e7-08abbd0b0001','ASSERTS'),
 ('dd5d557f-6f09-4ac2-b7e7-08abbd0b0002','9c972aae-0a28-4fc7-8769-b617bedb0001','bb5d557f-6f09-4ac2-b7e7-08abbd0b0001','cc5d557f-6f09-4ac2-b7e7-08abbd0b0002','ASSERTS'),
 ('dd5d557f-6f09-4ac2-b7e7-08abbd0b0003','9c972aae-0a28-4fc7-8769-b617bedb0001','bb5d557f-6f09-4ac2-b7e7-08abbd0b0001','cc5d557f-6f09-4ac2-b7e7-08abbd0b0003','ASSERTS'),
 ('dd5d557f-6f09-4ac2-b7e7-08abbd0b0004','9c972aae-0a28-4fc7-8769-b617bedb0002','bb5d557f-6f09-4ac2-b7e7-08abbd0b0002','cc5d557f-6f09-4ac2-b7e7-08abbd0b0004','ASSERTS');

\i supabase/migrations/202611130083_stage4_1c_assertion_lineage.sql
-- Owner isolation and direct grants.
select has_function_privilege('anon',
 'public.save_assertion_lineage_review_v1(uuid,uuid,uuid,text,text,uuid,uuid,jsonb)','EXECUTE')=false as anon_denied;
select has_function_privilege('authenticated',
 'public.save_assertion_lineage_review_v1(uuid,uuid,uuid,text,text,uuid,uuid,jsonb)','EXECUTE') as owner_rpc_enabled;
-- Privileged fixture validates the grade-one trigger without an ownership grant.
do $$ begin
  begin
    insert into public.assertion_credibility_reviews(project_id,source_claim_assertion_id,
      verification_assertion_id,credibility)
    values('9c972aae-0a28-4fc7-8769-b617bedb0001',
      'dd5d557f-6f09-4ac2-b7e7-08abbd0b0001',
      'dd5d557f-6f09-4ac2-b7e7-08abbd0b0002',1);
    raise exception 'UNATTESTED_GRADE_ONE_ACCEPTED';
  exception when sqlstate '22023' then null; end;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','58a138e3-6ff0-4e85-b00e-51b9474c0001',false);
do $$
declare
 p uuid := '9c972aae-0a28-4fc7-8769-b617bedb0001';
 a uuid := 'dd5d557f-6f09-4ac2-b7e7-08abbd0b0001';
 b uuid := 'dd5d557f-6f09-4ac2-b7e7-08abbd0b0002';
 same_source uuid := 'dd5d557f-6f09-4ac2-b7e7-08abbd0b0003';
 foreign_assertion uuid := 'dd5d557f-6f09-4ac2-b7e7-08abbd0b0004';
 first_id uuid; second_id uuid; replay_id uuid; replayed_flag boolean;
 why text := 'The teams collected separate first-hand observations from different primary sensors without copying each other.';
 ctx jsonb;
begin
 ctx:=jsonb_build_object(
  'fromAssertionUpdatedAt',(select updated_at from public.source_claim_assertions where id=a),
  'toAssertionUpdatedAt',(select updated_at from public.source_claim_assertions where id=b),
  'claimUpdatedAt',(select updated_at from public.source_claims where id='bb5d557f-6f09-4ac2-b7e7-08abbd0b0001'),
  'fromAnnotationUpdatedAt',(select updated_at from public.source_annotations where id='cc5d557f-6f09-4ac2-b7e7-08abbd0b0001'),
  'toAnnotationUpdatedAt',(select updated_at from public.source_annotations where id='cc5d557f-6f09-4ac2-b7e7-08abbd0b0002'),
  'fromSourceUpdatedAt',(select updated_at from public.sources where id='7b5d557f-6f09-4ac2-b7e7-08abbd0b0001'),
  'toSourceUpdatedAt',(select updated_at from public.sources where id='7b5d557f-6f09-4ac2-b7e7-08abbd0b0002')
 );
 begin
  perform public.save_assertion_lineage_review_v1(p,a,same_source,'INDEPENDENT_OBSERVATION',why,null,
    'ce1f11c5-ea5d-4d7a-97d4-91cc8c940201',ctx);
  raise exception 'SAME_SOURCE_INDEPENDENCE_ACCEPTED';
 exception when sqlstate '22023' then null; end;
 begin
  perform public.save_assertion_lineage_review_v1(p,a,foreign_assertion,'CITES',why,null,
    'ce1f11c5-ea5d-4d7a-97d4-91cc8c940202',ctx);
  raise exception 'CROSS_INVESTIGATION_ACCEPTED';
 exception when insufficient_privilege then null; end;
 select review_id,replayed into first_id,replayed_flag from public.save_assertion_lineage_review_v1(
  p,a,b,'DERIVED_FROM',why,null,'ce1f11c5-ea5d-4d7a-97d4-91cc8c940203',ctx);
 assert first_id is not null and not replayed_flag,'First lineage review';
 select review_id,replayed into replay_id,replayed_flag from public.save_assertion_lineage_review_v1(
  p,a,b,'DERIVED_FROM',why,null,'ce1f11c5-ea5d-4d7a-97d4-91cc8c940203',ctx);
 assert replay_id=first_id and replayed_flag,'Exact request replay';
 begin
  perform public.save_assertion_lineage_review_v1(
   p,a,b,'SHARES_PRIMARY_SOURCE',why,null,'ce1f11c5-ea5d-4d7a-97d4-91cc8c940203',ctx);
  raise exception 'REUSED_IDEMPOTENCY_KEY_ACCEPTED';
 exception when unique_violation then null; end;
 begin
  perform public.save_assertion_lineage_review_v1(
   p,a,b,'INDEPENDENT_OBSERVATION',why,null,'ce1f11c5-ea5d-4d7a-97d4-91cc8c940204',ctx);
  raise exception 'STALE_REVIEW_ACCEPTED';
 exception when serialization_failure then null; end;
 begin
  perform public.save_assertion_lineage_review_v1(
   p,a,b,'INDEPENDENT_OBSERVATION',why,first_id,'ce1f11c5-ea5d-4d7a-97d4-91cc8c940205',
   jsonb_set(ctx,'{claimUpdatedAt}','"2000-01-01T00:00:00+00:00"'::jsonb));
  raise exception 'STALE_CONTEXT_ACCEPTED';
 exception when serialization_failure then null; end;
 select review_id into second_id from public.save_assertion_lineage_review_v1(
  p,a,b,'INDEPENDENT_OBSERVATION',why,first_id,'ce1f11c5-ea5d-4d7a-97d4-91cc8c940206',ctx);
 assert (select revision from public.assertion_lineage_links where id=second_id)=2,'Immutable revision 2';
 assert (select supersedes_id from public.assertion_lineage_links where id=second_id)=first_id,'Supersedes link';
 assert (select relation from public.assertion_lineage_current_v1 where project_id=p)='INDEPENDENT_OBSERVATION',
  'Current relation from history';
 assert (select identity_snapshot ? 'selected_text' from public.assertion_lineage_links where id=second_id)=false,
  'No private source quotation copied';
 -- Note: admin inserts synthetic grade-one row to exercise the trigger; authenticated has no INSERT grant.
 begin
  delete from public.assertion_lineage_links where id=first_id;
  raise exception 'DIRECT_DELETE_ALLOWED';
 exception when insufficient_privilege then null; end;
 begin
  update public.assertion_lineage_links set relation='UNCLEAR' where id=first_id;
  raise exception 'DIRECT_UPDATE_ALLOWED';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.assertion_lineage_links(project_id,from_assertion_id,to_assertion_id,
   from_source_id,to_source_id,revision,relation,rationale,reviewed_by,request_id,input_sha256,
   context_fingerprint,identity_snapshot)
  values(p,a,b,'7b5d557f-6f09-4ac2-b7e7-08abbd0b0001','7b5d557f-6f09-4ac2-b7e7-08abbd0b0002',
    3,'UNCLEAR',why,auth.uid(),'ce1f11c5-ea5d-4d7a-97d4-91cc8c940208',repeat('a',64),repeat('a',64),'{}');
  raise exception 'DIRECT_INSERT_ALLOWED';
 exception when insufficient_privilege then null; end;
end $$;
-- Privileged fixture: currently independent lineage now permits a grade-one review.
reset role;
insert into public.assertion_credibility_reviews(project_id,source_claim_assertion_id,
 verification_assertion_id,credibility)
 values('9c972aae-0a28-4fc7-8769-b617bedb0001',
 'dd5d557f-6f09-4ac2-b7e7-08abbd0b0001',
 'dd5d557f-6f09-4ac2-b7e7-08abbd0b0002',1);
set role authenticated;
-- User 2 cannot read a private Investigation lineage.
select set_config('request.jwt.claim.sub','58a138e3-6ff0-4e85-b00e-51b9474c0002',false);
do $$ begin
 assert (select count(*) from public.assertion_lineage_current_v1)=0,'RLS leaks other project lineage';
end $$;
reset role;
-- Historical lineage survives Stage 3 unlink.
delete from public.source_claim_assertions where id='dd5d557f-6f09-4ac2-b7e7-08abbd0b0001';
do $$ begin
 assert (select count(*) from public.assertion_lineage_links)=2,'Unlink erased lineage audit';
end $$;
-- Only whole-Investigation deletion purges private history.
delete from public.projects where id='9c972aae-0a28-4fc7-8769-b617bedb0001';
do $$ begin
 assert (select count(*) from public.assertion_lineage_links)=0,'Project deletion must purge lineage audit';
end $$;
select 'STAGE4_1C_PG_ACCEPTED' as result;
