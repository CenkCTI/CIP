-- CANVAS-3 disposable PostgreSQL acceptance. Never point at a live Supabase database.
-- Inherit CANVAS-1 and CANVAS-2 fixtures, including a deleted canonical source.
\i scripts/test-canvas2-migration.sql
reset role;
\i supabase/migrations/202611050079_canvas_3_relationships_frames.sql

set role authenticated;
select set_config('request.jwt.claim.sub','58a138e3-6ff0-4e85-b00e-51b9474c0001',false);
do $$
declare
  board uuid := '81d631fb-851a-4811-b237-de954d2a0001';
  project uuid := '9c972aae-0a28-4fc7-8769-b617bedb0001';
  frame uuid := '09fd43b3-b3b1-47ad-86af-c65cd31b0009';
  note uuid := '09fd43b3-b3b1-47ad-86af-c65cd31b0007';
  entity uuid := '09fd43b3-b3b1-47ad-86af-c65cd31b0008';
  key uuid := 'ce1f11c5-ea5d-4d7a-97d4-91cc8c940009';
  items jsonb := '[
    {"id":"09fd43b3-b3b1-47ad-86af-c65cd31b0009","kind":"FRAME","content":"Hypothesis group","x":-24,"y":-76,"width":740,"height":410,"z_index":0},
    {"id":"09fd43b3-b3b1-47ad-86af-c65cd31b0007","kind":"NOTE","content":"Old CANVAS-1 note","x":36,"y":76,"width":300,"height":190,"z_index":1,"group_id":"09fd43b3-b3b1-47ad-86af-c65cd31b0009"},
    {"id":"09fd43b3-b3b1-47ad-86af-c65cd31b0008","kind":"ENTITY_REF","content":"","record_type":"SOURCE","record_id":"7b5d557f-6f09-4ac2-b7e7-08abbd0b0001","x":336,"y":76,"width":340,"height":220,"z_index":2,"group_id":"09fd43b3-b3b1-47ad-86af-c65cd31b0009"}
  ]';
  edges jsonb := '[
    {"id":"09fd43b3-b3b1-47ad-86af-c65cd31b0010","source_id":"09fd43b3-b3b1-47ad-86af-c65cd31b0007","target_id":"09fd43b3-b3b1-47ad-86af-c65cd31b0008","relation_type":"INVESTIGATE","rationale":"Analyst question only"}
  ]';
  revision bigint;
begin
  revision := public.save_analysis_canvas_v2(project,board,4,key,items,edges);
  assert revision=5,'Atomic scene revision';
  assert (select count(*) from public.analysis_canvas_items where canvas_id=board)=3,
    'Frame plus two existing cards';
  assert (select count(*) from public.analysis_canvas_items where canvas_id=board
    and group_id=frame)=2,'Frame memberships persisted';
  assert (select count(*) from public.analysis_canvas_edges where canvas_id=board)=1,
    'One analyst edge persisted';
  assert public.save_analysis_canvas_v2(project,board,4,key,items,edges)=5,
    'Whole-scene idempotent retry';
  assert (select count(*) from public.analysis_canvas_mutations where canvas_id=board)=5,
    'No duplicate receipt';

  begin
    perform public.save_analysis_canvas_v1(project,board,5,
      'ce1f11c5-ea5d-4d7a-97d4-91cc8c940010','[]'::jsonb);
    raise exception 'LEGACY_CLIENT_OVERWROTE_FRAME';
  exception when serialization_failure then null;
  end;

  begin
    perform public.save_analysis_canvas_v2(project,board,5,
      'ce1f11c5-ea5d-4d7a-97d4-91cc8c940011',items,
      replace(edges::text,'09fd43b3-b3b1-47ad-86af-c65cd31b0008',
        '09fd43b3-b3b1-47ad-86af-c65cd31b0022')::jsonb);
    raise exception 'DANGLING_EDGE_ACCEPTED';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.save_analysis_canvas_v2(project,board,5,
      'ce1f11c5-ea5d-4d7a-97d4-91cc8c940012',items,
      replace(edges::text,'09fd43b3-b3b1-47ad-86af-c65cd31b0007',
        '09fd43b3-b3b1-47ad-86af-c65cd31b0009')::jsonb);
    raise exception 'FRAME_ENDPOINT_ACCEPTED';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.save_analysis_canvas_v2(project,board,5,
      'ce1f11c5-ea5d-4d7a-97d4-91cc8c940013',
      replace(items::text,'09fd43b3-b3b1-47ad-86af-c65cd31b0009',
        '09fd43b3-b3b1-47ad-86af-c65cd31b0022')::jsonb,edges);
    raise exception 'MISSING_GROUP_ACCEPTED';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.save_analysis_canvas_v2(project,board,5,
      'ce1f11c5-ea5d-4d7a-97d4-91cc8c940014',
      items,replace(edges::text,'INVESTIGATE','CONFIRMED_FACT')::jsonb);
    raise exception 'INVALID_RELATION_TYPE_ACCEPTED';
  exception when check_violation then null;
  end;

  begin
    perform public.save_analysis_canvas_v2(project,board,5,
      key,items,'[]'::jsonb);
    raise exception 'REQUEST_ID_REUSED';
  exception when invalid_parameter_value then null;
  end;

  assert (select revision from public.analysis_canvases where id=board)=5,
    'Rejected mutations must not increase the revision';
  assert (select count(*) from public.analysis_canvas_edges where canvas_id=board)=1,
    'Rejected edits must not delete relationships';
end $$;

-- A second user may neither change another user's board nor see its edges.
select set_config('request.jwt.claim.sub','58a138e3-6ff0-4e85-b00e-51b9474c0002',false);
do $$
begin
  assert (select count(*) from public.analysis_canvas_edges)=0,
    'RLS must hide other users relationship metadata';
  begin
    perform public.save_analysis_canvas_v2(
      '9c972aae-0a28-4fc7-8769-b617bedb0001',
      '81d631fb-851a-4811-b237-de954d2a0001',5,
      'ce1f11c5-ea5d-4d7a-97d4-91cc8c940015','[]'::jsonb,'[]'::jsonb);
    raise exception 'CROSS_USER_SCENE_EDIT';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub','58a138e3-6ff0-4e85-b00e-51b9474c0001',false);
do $$
declare
  project uuid := '9c972aae-0a28-4fc7-8769-b617bedb0001';
  board uuid := '81d631fb-851a-4811-b237-de954d2a0001';
  items jsonb;
  edges jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'id',id,'kind',kind,'content',content,'x',
    case when kind='FRAME' then x else x-24 end,
    'y',case when kind='FRAME' then y else y-76 end,
    'width',width,'height',height,'z_index',z_index,
    'record_type',record_type,'record_id',record_id,'group_id',null
  )) into items from public.analysis_canvas_items where canvas_id=board and kind <> 'FRAME';
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'source_id',source_id,'target_id',target_id,
    'relation_type',relation_type,'rationale',rationale)),'[]'::jsonb)
    into edges from public.analysis_canvas_edges where canvas_id=board;
  -- Release both children from their frame without deleting the link.
  assert public.save_analysis_canvas_v2(project,board,5,
    'ce1f11c5-ea5d-4d7a-97d4-91cc8c940016',items,edges)=6,
    'Ungrouping persisted';
  assert (select count(*) from public.analysis_canvas_items where canvas_id=board)=2,
    'Ungroup keeps both original cards';
  assert (select count(*) from public.analysis_canvas_edges where canvas_id=board)=1,
    'Ungroup must preserve the analyst link';
  assert (select count(*) from public.analysis_canvas_items where group_id is not null)=0,
    'Ungroup clears frame membership';
end $$;

select 'CANVAS3_POSTGRES_ACCEPTED' as result;
