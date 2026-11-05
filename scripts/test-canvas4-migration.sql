-- Disposable CANVAS-4 acceptance: run only against a throwaway PostgreSQL 16 service.
\i scripts/test-canvas3-migration.sql
reset role;

-- The Inventory fixture represents an ORIGINAL Source Asset in an owned Investigation.
insert into public.canvas_test_inventory(project_id,record_type,record_id) values
 ('9c972aae-0a28-4fc7-8769-b617bedb0001','SOURCE_ASSET','5404f0af-9628-49d1-9072-443b0fd4a201'),
 ('9c972aae-0a28-4fc7-8769-b617bedb0002','SOURCE_ASSET','5404f0af-9628-49d1-9072-443b0fd4a202');

\i supabase/migrations/202611050080_canvas_4_media_preview.sql

set role authenticated;
select set_config('request.jwt.claim.sub','58a138e3-6ff0-4e85-b00e-51b9474c0001',false);

do $$
declare
  project uuid := '9c972aae-0a28-4fc7-8769-b617bedb0001';
  board uuid := '81d631fb-851a-4811-b237-de954d2a0001';
  source_asset uuid := '5404f0af-9628-49d1-9072-443b0fd4a201';
  media_id uuid := '5404f0af-9628-49d1-9072-443b0fd4a203';
  key uuid := '5404f0af-9628-49d1-9072-443b0fd4a204';
  nodes jsonb;
  links jsonb;
  forbidden jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'kind',kind,'content',content,
    'x',x,'y',y,'width',width,'height',height,'z_index',z_index,
    'record_type',record_type,'record_id',record_id,
    'group_id',group_id,'preview_page',null
  )), '[]'::jsonb) into nodes
    from public.analysis_canvas_items where canvas_id=board;
  nodes := nodes || jsonb_build_array(jsonb_build_object(
    'id',media_id,'kind','ENTITY_REF','content','','record_type','SOURCE_ASSET',
    'record_id',source_asset,'preview_page',3,'x',430,'y',150,
    'width',480,'height',580,'z_index',4,'group_id',null
  ));
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'source_id',source_id,'target_id',target_id,
    'relation_type',relation_type,'rationale',rationale
  )),'[]'::jsonb) into links from public.analysis_canvas_edges where canvas_id=board;

  assert public.save_analysis_canvas_v3(project,board,6,key,nodes,links)=7,
    'CANVAS-4 scene with source PDF page must save atomically';
  assert (select count(*) from public.analysis_canvas_items where canvas_id=board)=3,
    'CANVAS-3 notes and refs preserved alongside media';
  assert (select preview_page from public.analysis_canvas_items where id=media_id)=3,
    'Selected page stored without file URLs or bytes';
  assert (select count(*) from public.analysis_canvas_edges where canvas_id=board)=1,
    'Existing analyst relationships unaffected';
  assert public.save_analysis_canvas_v3(project,board,6,key,nodes,links)=7,
    'CANVAS-4 idempotent retry';

  -- Simulate a different/foreign Project's SOURCE_ASSET reference.
  forbidden := replace(nodes::text,source_asset::text,
    '5404f0af-9628-49d1-9072-443b0fd4a202')::jsonb;
  begin
    perform public.save_analysis_canvas_v3(project,board,7,
      '5404f0af-9628-49d1-9072-443b0fd4a205',forbidden,links);
    raise exception 'CROSS_PROJECT_MEDIA_REFERENCE_ACCEPTED';
  exception when foreign_key_violation then null;
  end;

  -- Fake preview data on an ordinary NOTE must fail the DB check.
  select jsonb_agg(
    case when item->>'kind'='NOTE'
      then jsonb_set(item,'{preview_page}','3'::jsonb)
      else item end)
    into forbidden from jsonb_array_elements(nodes) item;
  begin
    perform public.save_analysis_canvas_v3(project,board,7,
      '5404f0af-9628-49d1-9072-443b0fd4a206',forbidden,links);
    raise exception 'NON_ASSET_MEDIA_PREVIEW_ACCEPTED';
  exception when check_violation then null;
  end;

  forbidden := replace(nodes::text,'"preview_page": 3','"preview_page": 10001')::jsonb;
  begin
    perform public.save_analysis_canvas_v3(project,board,7,
      '5404f0af-9628-49d1-9072-443b0fd4a207',forbidden,links);
    raise exception 'UNBOUNDED_PDF_PAGE_ACCEPTED';
  exception when check_violation then null;
  end;

  -- Owner-locked revision remains stable after all three rejected writes.
  assert (select b.revision from public.analysis_canvases b where b.id=board)=7,
    'Bad media writes must not mutate board revision';

  -- Keep a media card but remove all edges so the v1/v2 protection is isolated.
  assert public.save_analysis_canvas_v3(project,board,7,
    '5404f0af-9628-49d1-9072-443b0fd4a208',
    jsonb_build_array(nodes->(jsonb_array_length(nodes)-1)), '[]'::jsonb)=8,
    'Single media-only scene';
  assert (select count(*) from public.analysis_canvas_edges where canvas_id=board)=0,
    'CANVAS-3 edges removed using a v3 snapshot';

  begin
    perform public.save_analysis_canvas_v1(project,board,8,
      '5404f0af-9628-49d1-9072-443b0fd4a209','[]'::jsonb);
    raise exception 'OLD_CANVAS1_WIPED_PDF_CARD';
  exception when serialization_failure then null;
  end;
  begin
    perform public.save_analysis_canvas_v2(project,board,8,
      '5404f0af-9628-49d1-9072-443b0fd4a210','[]'::jsonb,'[]'::jsonb);
    raise exception 'OLD_CANVAS3_WIPED_PDF_PAGE';
  exception when serialization_failure then null;
  end;
  assert (select preview_page from public.analysis_canvas_items where id=media_id)=3,
    'Legacy writers must preserve media page state';
end $$;

-- A previously valid media reference can survive removal of the original asset.
reset role;
delete from public.canvas_test_inventory
 where record_type='SOURCE_ASSET'
   and record_id='5404f0af-9628-49d1-9072-443b0fd4a201';
set role authenticated;
select set_config('request.jwt.claim.sub','58a138e3-6ff0-4e85-b00e-51b9474c0001',false);

do $$
declare
  project uuid := '9c972aae-0a28-4fc7-8769-b617bedb0001';
  board uuid := '81d631fb-851a-4811-b237-de954d2a0001';
  nodes jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'kind',kind,'content',content,'x',x+10,'y',y,
    'width',width,'height',height,'z_index',z_index,
    'record_type',record_type,'record_id',record_id,
    'group_id',group_id,'preview_page',preview_page
  )),'[]'::jsonb) into nodes from public.analysis_canvas_items where canvas_id=board;
  assert public.save_analysis_canvas_v3(project,board,8,
    '5404f0af-9628-49d1-9072-443b0fd4a211',nodes,'[]'::jsonb)=9,
    'Orphaned file references can still move without a forged copied file';
  assert (select count(*) from public.analysis_canvas_items where canvas_id=board)=1,
    'Missing original does not delete the Canvas card';
end $$;
select 'CANVAS4_POSTGRES_ACCEPTED' as result;
