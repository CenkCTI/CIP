-- Isolated PostgreSQL acceptance for CANVAS-1, no production Supabase changes.
create role authenticated nologin;
create role anon nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create table public.projects(id uuid primary key, owner_id uuid not null references auth.users(id));
create function public.project_is_owned(p_project_id uuid) returns boolean language sql stable as $$
  select exists(select 1 from public.projects p where p.id = p_project_id and p.owner_id = auth.uid());
$$;
grant usage on schema public, auth to authenticated;
grant select on public.projects to authenticated;
grant execute on function auth.uid() to authenticated;
grant execute on function public.project_is_owned(uuid) to authenticated;

insert into auth.users(id) values
 ('58a138e3-6ff0-4e85-b00e-51b9474c0001'),
 ('58a138e3-6ff0-4e85-b00e-51b9474c0002');
insert into public.projects(id,owner_id) values
 ('9c972aae-0a28-4fc7-8769-b617bedb0001','58a138e3-6ff0-4e85-b00e-51b9474c0001'),
 ('9c972aae-0a28-4fc7-8769-b617bedb0002','58a138e3-6ff0-4e85-b00e-51b9474c0002');

\i supabase/migrations/202611050077_canvas_1_core_workspace.sql

set role authenticated;
select set_config('request.jwt.claim.sub','58a138e3-6ff0-4e85-b00e-51b9474c0001',false);
insert into public.analysis_canvases(id,project_id,created_by,name) values
 ('81d631fb-851a-4811-b237-de954d2a0001',
 '9c972aae-0a28-4fc7-8769-b617bedb0001',
 '58a138e3-6ff0-4e85-b00e-51b9474c0001','Blank board');

do $$
declare
  board uuid := '81d631fb-851a-4811-b237-de954d2a0001';
  project uuid := '9c972aae-0a28-4fc7-8769-b617bedb0001';
  request uuid := 'fed7a86f-0be7-4398-8324-2ea708fe0001';
  items jsonb := '[{"id":"09fd43b3-b3b1-47ad-86af-c65cd31b0001","kind":"NOTE","content":"analyst note","x":100,"y":120,"width":300,"height":190,"z_index":0}]';
  output_revision bigint;
begin
  assert (select count(*) from public.analysis_canvas_items where canvas_id = board) = 0, 'New boards must be empty';
  output_revision := public.save_analysis_canvas_v1(project,board,0,request,items);
  assert output_revision = 1, 'First save revision';
  assert (select count(*) from public.analysis_canvas_items where canvas_id=board) = 1, 'Saved note';
  output_revision := public.save_analysis_canvas_v1(project,board,0,request,items);
  assert output_revision = 1, 'Same request must be idempotent';
  assert (select count(*) from public.analysis_canvas_mutations where canvas_id=board) = 1, 'One receipt';
  begin
    perform public.save_analysis_canvas_v1(project,board,0,
      'fed7a86f-0be7-4398-8324-2ea708fe0002', '[]'::jsonb);
    raise exception 'EXPECTED_CONFLICT_NOT_RAISED';
  exception when serialization_failure then null;
  end;
  assert (select count(*) from public.analysis_canvas_items where canvas_id=board) = 1, 'Conflict must not mutate';
  output_revision := public.save_analysis_canvas_v1(project,board,1,
    'fed7a86f-0be7-4398-8324-2ea708fe0003','[]'::jsonb);
  assert output_revision = 2, 'Empty save revision';
  assert (select count(*) from public.analysis_canvas_items where canvas_id=board) = 0, 'Empty board preserved';
  begin
    insert into public.analysis_canvas_items (id,project_id,canvas_id,kind,content,x,y,width,height)
      values ('09fd43b3-b3b1-47ad-86af-c65cd31b0002',project,board,'NOTE','bypass',0,0,300,190);
    raise exception 'DIRECT_ITEM_WRITE_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.analysis_canvases(project_id,created_by,name) values
      ('9c972aae-0a28-4fc7-8769-b617bedb0002',
       '58a138e3-6ff0-4e85-b00e-51b9474c0001','Cross-project');
    raise exception 'CROSS_PROJECT_INSERT_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end $$;
select 'CANVAS1_POSTGRES_ACCEPTED' as result;
