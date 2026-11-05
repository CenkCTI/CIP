-- Disposable PostgreSQL acceptance: CANVAS-1 plus CANVAS-2, never live.
\i scripts/test-canvas1-migration.sql
reset role;

-- Minimal existing Fusion view fixture, not a second production inventory.
create table public.canvas_test_inventory(
  project_id uuid not null,
  record_type text not null,
  record_id uuid not null,
  primary key(project_id,record_type,record_id)
);
create view public.fusion_inventory_base with (security_invoker=true) as
  select project_id,record_type,record_id from public.canvas_test_inventory;
grant select on public.canvas_test_inventory,public.fusion_inventory_base to authenticated;

insert into public.canvas_test_inventory(project_id,record_type,record_id) values
 ('9c972aae-0a28-4fc7-8769-b617bedb0001','SOURCE','7b5d557f-6f09-4ac2-b7e7-08abbd0b0001'),
 ('9c972aae-0a28-4fc7-8769-b617bedb0002','SOURCE','7b5d557f-6f09-4ac2-b7e7-08abbd0b0002');

\i supabase/migrations/202611050078_canvas_2_entity_refs.sql
set role authenticated;
select set_config('request.jwt.claim.sub','58a138e3-6ff0-4e85-b00e-51b9474c0001',false);

do $$
declare
  board uuid := '81d631fb-851a-4811-b237-de954d2a0001';
  project uuid := '9c972aae-0a28-4fc7-8769-b617bedb0001';
  ref_id uuid := '7b5d557f-6f09-4ac2-b7e7-08abbd0b0001';
  key uuid := 'ce1f11c5-ea5d-4d7a-97d4-91cc8c940001';
  payload jsonb := '[
    {"id":"09fd43b3-b3b1-47ad-86af-c65cd31b0007","kind":"NOTE","content":"Old CANVAS-1 note","x":0,"y":0,"width":300,"height":190,"z_index":0},
    {"id":"09fd43b3-b3b1-47ad-86af-c65cd31b0008","kind":"ENTITY_REF","content":"","record_type":"SOURCE","record_id":"7b5d557f-6f09-4ac2-b7e7-08abbd0b0001","x":300,"y":0,"width":340,"height":220,"z_index":1}
  ]';
  revision bigint;
begin
  -- CANVAS-1 fixture finished with revision 2 and no items.
  revision := public.save_analysis_canvas_v1(project,board,2,key,payload);
  assert revision=3, 'Mixed snapshot saved';
  assert (select count(*) from public.analysis_canvas_items where canvas_id=board)=2,
    'New references and existing notes coexist';
  assert (select count(*) from public.analysis_canvas_items where canvas_id=board and
    kind='ENTITY_REF' and record_type='SOURCE' and record_id=ref_id)=1, 'Reference stored';
  assert public.save_analysis_canvas_v1(project,board,2,key,payload)=3,
    'Same mutation replay is idempotent';
  assert (select count(*) from public.analysis_canvas_mutations where canvas_id=board)=4,
    'Only one new mutation receipt';
  begin
    perform public.save_analysis_canvas_v1(project,board,3,
      'ce1f11c5-ea5d-4d7a-97d4-91cc8c940002',
      replace(payload::text,
        '7b5d557f-6f09-4ac2-b7e7-08abbd0b0001',
        '7b5d557f-6f09-4ac2-b7e7-08abbd0b0002')::jsonb);
    raise exception 'CROSS_INVESTIGATION_RECORD_ACCEPTED';
  exception when foreign_key_violation then null;
  end;
  assert (select revision from public.analysis_canvases where id=board)=3,
    'Foreign reference cannot change the board revision';
  begin
    perform public.save_analysis_canvas_v1(project,board,3,
      'ce1f11c5-ea5d-4d7a-97d4-91cc8c940003',
      replace(payload::text,
        '7b5d557f-6f09-4ac2-b7e7-08abbd0b0001',
        '7b5d557f-6f09-4ac2-b7e7-08abbd0b0003')::jsonb);
    raise exception 'NONEXISTENT_RECORD_ACCEPTED';
  exception when foreign_key_violation then null;
  end;
  begin
    perform public.save_analysis_canvas_v1(project,board,3,
      'ce1f11c5-ea5d-4d7a-97d4-91cc8c940004',
      replace(payload::text,'"record_type": "SOURCE"','"record_type": "ADMIN"')::jsonb);
    raise exception 'UNSUPPORTED_TYPE_ACCEPTED';
  exception when foreign_key_violation then null;
  end;
  begin
    perform public.save_analysis_canvas_v1(project,board,3,
      'ce1f11c5-ea5d-4d7a-97d4-91cc8c940005',
      replace(payload::text,'"content": ""','"content": "fake intelligence"')::jsonb);
    raise exception 'ENTITY_COPY_ALLOWED';
  exception when check_violation then null;
  end;
  begin
    perform public.save_analysis_canvas_v1(project,board,2,
      'ce1f11c5-ea5d-4d7a-97d4-91cc8c940006',payload);
    raise exception 'STALE_REVISION_ACCEPTED';
  exception when serialization_failure then null;
  end;
  assert (select count(*) from public.analysis_canvas_items where canvas_id=board)=2,
    'Failed writes are atomic';
end $$;

-- A deleted source leaves an explicitly unresolved reference rather than
-- blocking subsequent layout saves or silently copying a stale source snapshot.
reset role;
delete from public.canvas_test_inventory where
  project_id='9c972aae-0a28-4fc7-8769-b617bedb0001';
set role authenticated;
select set_config('request.jwt.claim.sub','58a138e3-6ff0-4e85-b00e-51b9474c0001',false);
do $$
declare
  project uuid := '9c972aae-0a28-4fc7-8769-b617bedb0001';
  board uuid := '81d631fb-851a-4811-b237-de954d2a0001';
  payload jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'id',id,'kind',kind,'content',content,'x',x+12,'y',y,'width',width,
    'height',height,'z_index',z_index,'record_type',record_type,'record_id',record_id
  )) into payload from public.analysis_canvas_items where canvas_id=board;
  assert public.save_analysis_canvas_v1(project,board,3,
    'ce1f11c5-ea5d-4d7a-97d4-91cc8c940007',payload)=4,
    'An already-stored orphan can be moved';
  assert (select count(*) from public.analysis_canvas_items where canvas_id=board)=2,
    'Orphan card remains without copying source metadata';
end $$;
select 'CANVAS2_POSTGRES_ACCEPTED' as result;
