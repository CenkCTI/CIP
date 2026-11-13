-- PostgreSQL 16/17 disposable acceptance only. NEVER use on live Supabase.
create role authenticated nologin;
create role anon nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
create table public.projects(id uuid primary key, owner_id uuid not null references auth.users(id));
create function public.project_is_owned(p_id uuid) returns boolean language sql stable as $$
  select exists(select 1 from public.projects p where p.id=p_id and p.owner_id=auth.uid());
$$;
create table public.sources(id uuid primary key,project_id uuid not null references public.projects(id) on delete cascade,
  title text not null, updated_at timestamptz not null default now(), archived_at timestamptz);
create table public.source_claims(id uuid primary key,project_id uuid not null references public.projects(id) on delete cascade,
  claim_summary text not null, updated_at timestamptz not null default now());
create table public.source_annotations(id uuid primary key,project_id uuid not null references public.projects(id) on delete cascade,
  source_id uuid not null, updated_at timestamptz not null default now());
create table public.source_claim_assertions(id uuid primary key,project_id uuid not null references public.projects(id) on delete cascade,
  source_claim_id uuid not null, source_annotation_id uuid not null, stance text not null,
  updated_at timestamptz not null default now());
grant usage on schema public,auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
grant execute on function public.project_is_owned(uuid) to authenticated;
grant select on public.projects,public.sources,public.source_claims,
  public.source_annotations,public.source_claim_assertions to authenticated;
alter table public.projects enable row level security;
create policy own_projects on public.projects for select to authenticated using (owner_id=auth.uid());
alter table public.sources enable row level security;
alter table public.source_claims enable row level security;
alter table public.source_annotations enable row level security;
alter table public.source_claim_assertions enable row level security;
create policy own_sources on public.sources for select to authenticated using(public.project_is_owned(project_id));
create policy own_claims on public.source_claims for select to authenticated using(public.project_is_owned(project_id));
create policy own_annotations on public.source_annotations for select to authenticated using(public.project_is_owned(project_id));
create policy own_assertions on public.source_claim_assertions for select to authenticated using(public.project_is_owned(project_id));

insert into auth.users(id) values('fe8428a0-62c8-4c9d-8bd3-959d4f600001'),('fe8428a0-62c8-4c9d-8bd3-959d4f600002');
insert into public.projects(id,owner_id) values
 ('a41922bb-387d-459d-bdeb-f7c440000001','fe8428a0-62c8-4c9d-8bd3-959d4f600001'),
 ('a41922bb-387d-459d-bdeb-f7c440000002','fe8428a0-62c8-4c9d-8bd3-959d4f600002');
insert into public.sources(id,project_id,title) values
 ('b41922bb-387d-459d-bdeb-f7c440000001','a41922bb-387d-459d-bdeb-f7c440000001','Original technical observation'),
 ('b41922bb-387d-459d-bdeb-f7c440000002','a41922bb-387d-459d-bdeb-f7c440000002','Foreign private report');
insert into public.source_claims(id,project_id,claim_summary) values
 ('c41922bb-387d-459d-bdeb-f7c440000001','a41922bb-387d-459d-bdeb-f7c440000001','The original research reports shared routing patterns.'),
 ('c41922bb-387d-459d-bdeb-f7c440000002','a41922bb-387d-459d-bdeb-f7c440000002','Foreign research claim');
insert into public.source_annotations(id,project_id,source_id) values
 ('d41922bb-387d-459d-bdeb-f7c440000001','a41922bb-387d-459d-bdeb-f7c440000001','b41922bb-387d-459d-bdeb-f7c440000001'),
 ('d41922bb-387d-459d-bdeb-f7c440000002','a41922bb-387d-459d-bdeb-f7c440000002','b41922bb-387d-459d-bdeb-f7c440000002');
insert into public.source_claim_assertions(id,project_id,source_claim_id,source_annotation_id,stance) values
 ('e41922bb-387d-459d-bdeb-f7c440000001','a41922bb-387d-459d-bdeb-f7c440000001',
  'c41922bb-387d-459d-bdeb-f7c440000001','d41922bb-387d-459d-bdeb-f7c440000001','ASSERTS'),
 ('e41922bb-387d-459d-bdeb-f7c440000002','a41922bb-387d-459d-bdeb-f7c440000002',
  'c41922bb-387d-459d-bdeb-f7c440000002','d41922bb-387d-459d-bdeb-f7c440000002','DENIES');

\i supabase/migrations/202611130084_stage4_2a_hypothesis_workbench.sql

-- Confirm grants; anonymous cannot read or execute either writer.
do $$ begin
 assert not has_table_privilege('anon','public.analytic_hypotheses','SELECT'),'anon hypothesis read';
 assert not has_table_privilege('authenticated','public.analytic_hypotheses','INSERT'),'direct insert privilege';
 assert not has_table_privilege('authenticated','public.analytic_hypothesis_evidence_reviews','UPDATE'),'direct update privilege';
 assert not has_function_privilege('anon','public.save_analytic_hypothesis_v1(uuid,uuid,text,text,text,text,text,uuid,uuid)','EXECUTE'),'anon RPC';
 assert has_function_privilege('authenticated','public.save_analytic_hypothesis_evidence_v1(uuid,uuid,uuid,text,text,uuid,jsonb,uuid)','EXECUTE'),'auth RPC';
 assert (select relrowsecurity from pg_class where oid='public.analytic_hypothesis_evidence_reviews'::regclass),'RLS disabled';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','fe8428a0-62c8-4c9d-8bd3-959d4f600001',false);
do $$
declare
 p uuid := 'a41922bb-387d-459d-bdeb-f7c440000001';
 a uuid := 'e41922bb-387d-459d-bdeb-f7c440000001';
 h uuid; v uuid; v2 uuid; replayed_flag boolean;
 r uuid; r2 uuid;
 ctx jsonb;
begin
 select hypothesis_id,version_id,replayed into h,v,replayed_flag from public.save_analytic_hypothesis_v1(
  p,null,'H1 shared infrastructure','Shared technical infrastructure may reflect one operational actor.',
  'Unrelated registrant and hosting telemetry would refute coordination.','OPEN',
  'Initial working alternative, without confirmed attribution.',null,
  'a71922bb-387d-459d-bdeb-f7c440000001');
 assert h is not null and v is not null and replayed_flag=false,'hypothesis created';
 assert (select revision from public.analytic_hypothesis_versions where id=v)=1,'revision one';
 select hypothesis_id,version_id,replayed into h,v,replayed_flag from public.save_analytic_hypothesis_v1(
  p,null,'H1 shared infrastructure','Shared technical infrastructure may reflect one operational actor.',
  'Unrelated registrant and hosting telemetry would refute coordination.','OPEN',
  'Initial working alternative, without confirmed attribution.',null,
  'a71922bb-387d-459d-bdeb-f7c440000001');
 assert replayed_flag=true and (select count(*) from public.analytic_hypotheses)=1,'retry must be idempotent';
 begin
   perform public.save_analytic_hypothesis_v1(p,h,'H1 shared infrastructure','Modified assertion without version lock.',
     'Another refuting source is still needed for this test.','TESTING',
     'Changed before expected revision is supplied.',null,
     'a71922bb-387d-459d-bdeb-f7c440000002');
   raise exception 'STALE_VERSION_ACCEPTED';
 exception when serialization_failure then null;end;
 select version_id into v2 from public.save_analytic_hypothesis_v1(p,h,
  'H1 shared infrastructure','Shared technical infrastructure may reflect one operational actor.',
  'Unrelated registrant and hosting telemetry would refute coordination.','TESTING',
  'Following up on registrant and routing evidence.',v,
  'a71922bb-387d-459d-bdeb-f7c440000003');
 assert (select revision from public.analytic_hypothesis_versions where id=v2)=2,'revision two';
 ctx:=jsonb_build_object(
  'assertionUpdatedAt',(select updated_at from public.source_claim_assertions where id=a),
  'claimUpdatedAt',(select updated_at from public.source_claims where id='c41922bb-387d-459d-bdeb-f7c440000001'),
  'annotationUpdatedAt',(select updated_at from public.source_annotations where id='d41922bb-387d-459d-bdeb-f7c440000001'),
  'sourceUpdatedAt',(select updated_at from public.sources where id='b41922bb-387d-459d-bdeb-f7c440000001'));
 select review_id into r from public.save_analytic_hypothesis_evidence_v1(p,h,a,
  'SUPPORTS','The observation is consistent with the hypothesis but does not prove actor attribution.',
  null,ctx,'a71922bb-387d-459d-bdeb-f7c440000004');
 assert (select role from public.analytic_hypothesis_evidence_reviews where id=r)='SUPPORTS','support saved';
 select review_id into r2 from public.save_analytic_hypothesis_evidence_v1(p,h,a,
  'CONTRADICTS','New telemetry indicates the infrastructure was run by unrelated tenants.',
  r,ctx,'a71922bb-387d-459d-bdeb-f7c440000005');
 assert (select revision from public.analytic_hypothesis_evidence_reviews where id=r2)=2,'evidence revision';
 assert (select role from public.analytic_hypothesis_evidence_reviews where id=r)='SUPPORTS','history not overwritten';
 assert (select role from public.analytic_hypothesis_evidence_current_v1 where assertion_id=a)='CONTRADICTS','latest role';
 begin
  perform public.save_analytic_hypothesis_evidence_v1(p,h,a,'CONTEXT',
   'Old evidence should not bypass the expected review check.',r,ctx,
   'a71922bb-387d-459d-bdeb-f7c440000006');
  raise exception 'STALE_EVIDENCE_ACCEPTED';
 exception when serialization_failure then null;end;
 begin
  perform public.save_analytic_hypothesis_evidence_v1(p,h,a,'CONTEXT',
   'Modified evidence provenance must be rejected.',r2,
   jsonb_set(ctx,'{claimUpdatedAt}','"2000-01-01T00:00:00+00:00"'::jsonb),
   'a71922bb-387d-459d-bdeb-f7c440000007');
  raise exception 'STALE_PROVENANCE_ACCEPTED';
 exception when serialization_failure then null;end;
 begin
  perform public.save_analytic_hypothesis_evidence_v1(p,h,'e41922bb-387d-459d-bdeb-f7c440000002',
   'SUPPORTS','A foreign source cannot be used in this project.',null,ctx,
   'a71922bb-387d-459d-bdeb-f7c440000008');
  raise exception 'CROSS_PROJECT_ALLOWED';
 exception when insufficient_privilege then null;end;
 begin
  update public.analytic_hypothesis_versions set status='RETIRED' where id=v;
  raise exception 'DIRECT_MUTATION_ALLOWED';
 exception when insufficient_privilege then null;end;
 begin
  delete from public.analytic_hypothesis_evidence_reviews where id=r;
  raise exception 'DIRECT_DELETE_ALLOWED';
 exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','fe8428a0-62c8-4c9d-8bd3-959d4f600002',false);
do $$ begin
 assert (select count(*) from public.analytic_hypotheses)=0,'foreign owner can read hypotheses';
 assert (select count(*) from public.analytic_hypothesis_evidence_reviews)=0,'foreign owner can read evidence';
end $$;
reset role;
delete from public.source_claim_assertions where id='e41922bb-387d-459d-bdeb-f7c440000001';
do $$ begin
 assert (select count(*) from public.analytic_hypothesis_evidence_reviews)=2,'unlink erased historical evidence';
end $$;
delete from public.projects where id='a41922bb-387d-459d-bdeb-f7c440000001';
do $$ begin
 assert (select count(*) from public.analytic_hypotheses)=0,'privacy deletion did not remove hypotheses';
 assert (select count(*) from public.analytic_hypothesis_versions)=0,'privacy deletion did not remove hypothesis history';
 assert (select count(*) from public.analytic_hypothesis_evidence_reviews)=0,'privacy deletion did not remove evidence history';
end $$;
select 'STAGE4_2A_POSTGRES_ACCEPTED' as result;
