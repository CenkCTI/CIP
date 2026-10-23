-- Disposable PG16+pgvector acceptance fixture; NEVER run against production.
create role authenticated;
create role anon;
create role service_role;
create schema auth;
create function auth.uid()returns uuid language sql stable as
  'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
create table auth.users(id uuid primary key);
create table public.projects(id uuid primary key,owner_id uuid not null references auth.users(id));
create function public.project_is_owned(p uuid)returns boolean language sql stable
as 'select exists(select 1 from public.projects where id=p and owner_id=auth.uid())';
create table public.source_assets(
 id uuid primary key,project_id uuid not null,source_id uuid not null,
 sha256 text not null,state text not null,asset_role text not null,
 unique(project_id,source_id,id));
create table public.copilot_document_indexes(
 id uuid primary key,project_id uuid not null,owner_id uuid not null,
 asset_sha256 text not null,status text not null,quality_status text,
 index_version text,extraction_run_id uuid,
 unique(project_id,id,owner_id));
create table public.copilot_document_extraction_runs(
 id uuid primary key,project_id uuid not null,owner_id uuid not null,
 unique(project_id,id,owner_id));
create table public.copilot_document_chunks(
 id uuid primary key,project_id uuid not null,owner_id uuid not null,
 index_id uuid not null,source_id uuid not null,asset_id uuid not null,
 extraction_run_id uuid not null,content_sha256 text,
 page_number integer not null,chunk_number integer not null,content text not null);
grant select on public.projects,public.source_assets,
 public.copilot_document_indexes,public.copilot_document_chunks to authenticated;
grant usage on schema auth to authenticated;
insert into auth.users(id) values
 ('10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002');
insert into public.projects values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
insert into public.source_assets values
 ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000001',repeat('a',64),'READY','ORIGINAL');
insert into public.copilot_document_extraction_runs values
 ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000001');
insert into public.copilot_document_indexes values
 ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000001',
 repeat('a',64),'READY','COMPLETE','CITEM-PDF-INDEX-A1-20261023',
 '60000000-0000-4000-8000-000000000001');
insert into public.copilot_document_chunks values
 ('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
 '60000000-0000-4000-8000-000000000001',repeat('c',64),
 3,1,'APT28 reportedly targeted organizations for espionage.');
