-- Run only in the disposable CİTEM database after fusion-postgres-acceptance.sql.
reset role;
insert into public.source_assets(id, project_id, source_id, state, original_filename, storage_path, created_by)
values
 ('a0000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','READY','fixture.pdf','fixture/a','10000000-0000-4000-8000-000000000001'),
 ('a0000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003','READY','other.pdf','fixture/b','10000000-0000-4000-8000-000000000001');

insert into public.source_annotations(id,project_id,source_id,asset_id,annotation_type,selected_text,created_by)
values
 ('b0000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','HIGHLIGHT','A fictional technical observation','10000000-0000-4000-8000-000000000001'),
 ('b0000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','UNDERLINE','Another observation','10000000-0000-4000-8000-000000000001'),
 ('b0000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000003','HIGHLIGHT','Other project','10000000-0000-4000-8000-000000000001'),
 ('b0000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','REGION',null,'10000000-0000-4000-8000-000000000001');

insert into public.source_annotation_fragments(project_id, source_id, asset_id, annotation_id, page_number, anchor_kind, quads, selected_text, page_width, page_height, created_by)
select project_id, source_id, asset_id, id, page, 'TEXT', '[[0,0,1,1]]'::jsonb, selected_text, 100, 100, created_by
from public.source_annotations cross join generate_series(1,2) page where id='b0000000-0000-4000-8000-000000000001';

insert into public.source_annotations(project_id,source_id,asset_id,annotation_type,selected_text,created_by)
select project_id,source_id,asset_id,'HIGHLIGHT','Synthetic unreviewed passage '||n,created_by
from public.source_annotations cross join generate_series(1,55) n where id='b0000000-0000-4000-8000-000000000001';

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $test$
declare
  p uuid := '20000000-0000-4000-8000-000000000001';
  a uuid := 'b0000000-0000-4000-8000-000000000001';
  b uuid := 'b0000000-0000-4000-8000-000000000002';
  foreign_a uuid := 'b0000000-0000-4000-8000-000000000003';
  region uuid := 'b0000000-0000-4000-8000-000000000004';
  req uuid := gen_random_uuid();
  first_id uuid;
  replay_id uuid;
  token text;
  saved_replay boolean;
  reason text := 'Analyst reviewed the original supporting material.';
  method text := 'ADMIRALTY_ANNOTATION_V1';
begin
  if (select count(*) from public.annotation_credibility_current_v1 where project_id=p and annotation_id=a and review_id is null)<>1 then
    raise exception 'multi-fragment annotation has duplicate subjects or a synthetic grade';
  end if;
  select provenance into strict token from public.annotation_credibility_current_v1 where annotation_id=a;
  select review_id into strict first_id from public.save_annotation_credibility_review_v1(p,a,2,reason,method,null,token,req);
  select review_id,replayed into strict replay_id,saved_replay from public.save_annotation_credibility_review_v1(p,a,2,reason,method,null,token,req);
  if replay_id<>first_id or not saved_replay then raise exception 'identical replay failed'; end if;

  begin
    perform public.save_annotation_credibility_review_v1(p,a,3,reason,method,null,token,req);
    raise exception 'reused request was accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.save_annotation_credibility_review_v1(p,a,3,reason,method,null,token,gen_random_uuid());
    raise exception 'stale revision was accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.save_annotation_credibility_review_v1(p,a,1,reason,method,first_id,token,gen_random_uuid());
    raise exception 'grade one was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_annotation_credibility_review_v1(p,foreign_a,3,reason,method,null,token,gen_random_uuid());
    raise exception 'cross-project subject was accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_annotation_credibility_review_v1(p,region,4,reason,method,null,
      (select provenance from public.annotation_credibility_current_v1 where annotation_id=region),gen_random_uuid());
    raise exception 'uninterpreted region was accepted';
  exception when serialization_failure then null; end;
  begin
    update public.annotation_credibility_reviews set rationale='Changed historical rationale' where id=first_id;
    raise exception 'authenticated direct write was accepted';
  exception when insufficient_privilege then null; end;

  if (select count(*) from public.fusion_inventory_annotation_quality_v1 where project_id=p
    and record_type='ANNOTATION' and annotation_credibility=2 and not annotation_credibility_stale)<>1 then
    raise exception 'Fusion grade filter must find one canonical annotation across all pages';
  end if;
  if (select count(*) from public.fusion_inventory_annotation_quality_v1 where project_id=p
    and record_type='ANNOTATION' and annotation_subject_status='ACTIVE' and annotation_review_id is null)<>56 then
    raise exception 'Fusion unevaluated population is wrong';
  end if;
  if exists(select 1 from public.fusion_inventory_annotation_quality_v1 where project_id=p and record_type<>'ANNOTATION'
      and annotation_credibility is not null) then raise exception 'derived record inherited assessment'; end if;

  perform public.save_annotation_credibility_review_v1(p,a,6,reason,method,first_id,token,gen_random_uuid());
  if (select count(*) from public.annotation_credibility_reviews where annotation_id=a)<>2 then raise exception 'history missing'; end if;
  if not exists(select 1 from public.annotation_credibility_current_v1 where annotation_id=a and credibility=6 and not stale) then
    raise exception 'grade six must be an evaluated assessment';
  end if;
  if (select selected_text from public.source_annotations where id=a)<>'A fictional technical observation' then
    raise exception 'review changed the original passage';
  end if;
  update public.sources set analyst_notes='Unrelated note' where id='40000000-0000-4000-8000-000000000001';
  if (select stale from public.annotation_credibility_current_v1 where annotation_id=a) then raise exception 'unrelated edit invalidated review'; end if;
  update public.sources set publisher='Corrected publisher' where id='40000000-0000-4000-8000-000000000001';
  if not (select stale from public.annotation_credibility_current_v1 where annotation_id=a) then
    raise exception 'source provenance change did not invalidate review';
  end if;
  begin
    perform public.save_annotation_credibility_review_v1(p,a,3,reason,method,
      (select review_id from public.annotation_credibility_current_v1 where annotation_id=a),token,gen_random_uuid());
    raise exception 'changed provenance was accepted';
  exception when serialization_failure then null; end;
  update public.sources set publisher=null where id='40000000-0000-4000-8000-000000000001';
  update public.source_annotations set comment='Changed the context of the passage' where id=a;
  if not exists(select 1 from public.fusion_inventory_annotation_quality_v1 where record_id=a
    and annotation_credibility=6 and annotation_credibility_stale) then raise exception 'stale historical grade not exposed'; end if;
  if exists(select 1 from public.annotation_credibility_current_v1 where annotation_id=b and review_id is not null) then
    raise exception 'another annotation inherited the review';
  end if;
end
$test$;
reset role;

-- Hold the first review open while a second editor submits the same revision.
create extension if not exists dblink;
create function public.test_annotation_review_race(p_request uuid) returns text
language plpgsql as $$
begin
  perform public.save_annotation_credibility_review_v1(
    '20000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002',
    3, 'Concurrent analyst review for the underline.', 'ADMIRALTY_ANNOTATION_V1', null,
    (select provenance from public.annotation_credibility_current_v1 where annotation_id='b0000000-0000-4000-8000-000000000002'),
    p_request);
  return '00000';
exception when serialization_failure then return sqlstate;
end
$$;
do $test$
declare
  first_state text;
  second_state text;
  waiting boolean := false;
begin
  perform dblink_connect('first_editor', 'dbname=' || current_database());
  perform dblink_connect('second_editor', 'dbname=' || current_database() || ' application_name=citem_second_editor');
  perform dblink_exec('first_editor', 'set role authenticated');
  perform dblink_exec('second_editor', 'set role authenticated');
  perform dblink_exec('first_editor', 'set request.jwt.claim.sub=''10000000-0000-4000-8000-000000000001''');
  perform dblink_exec('second_editor', 'set request.jwt.claim.sub=''10000000-0000-4000-8000-000000000001''');
  perform dblink_exec('first_editor', 'begin');
  select state into first_state from dblink('first_editor',
    'select public.test_annotation_review_race(''d0000000-0000-4000-8000-000000000001'')') as t(state text);
  perform dblink_send_query('second_editor',
    'select public.test_annotation_review_race(''d0000000-0000-4000-8000-000000000002'')');
  for attempt in 1..50 loop
    perform pg_stat_clear_snapshot();
    select exists(select 1 from pg_stat_activity where application_name='citem_second_editor'
      and wait_event_type='Lock') into waiting;
    exit when waiting;
    perform pg_sleep(0.02);
  end loop;
  perform dblink_exec('first_editor', 'commit');
  select state into second_state from dblink_get_result('second_editor') as t(state text);
  perform dblink_disconnect('first_editor');
  perform dblink_disconnect('second_editor');
  if not waiting or first_state is distinct from '00000' or second_state is distinct from '40001'
    then raise exception 'concurrent review conflict failed'; end if;
end
$test$;
drop function public.test_annotation_review_race(uuid);

do $test$
begin
  begin
    delete from public.annotation_credibility_reviews;
    raise exception 'privileged review history deletion was accepted';
  exception when check_violation then null; end;
  if has_function_privilege('anon','public.save_annotation_credibility_review_v1(uuid,uuid,integer,text,text,uuid,text,uuid)','execute')
    or has_table_privilege('anon','public.annotation_credibility_reviews','select') then
    raise exception 'anonymous access was granted';
  end if;
end
$test$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $test$
begin
  if exists(select 1 from public.annotation_credibility_reviews)
    or exists(select 1 from public.annotation_credibility_current_v1 where project_id='20000000-0000-4000-8000-000000000001') then
    raise exception 'other user can read reviews or subjects';
  end if;
  begin
    perform public.save_annotation_credibility_review_v1('20000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001',4,'Unauthorized review attempt','ADMIRALTY_ANNOTATION_V1',null,repeat('a',64),gen_random_uuid());
    raise exception 'other user can write reviews';
  exception when insufficient_privilege then null; end;
end
$test$;
reset role;

delete from public.source_annotations where id='b0000000-0000-4000-8000-000000000001';
do $test$
begin
  if (select count(*) from public.annotation_credibility_reviews where annotation_id='b0000000-0000-4000-8000-000000000001')<>2
    or exists(select 1 from public.fusion_inventory_annotation_quality_v1 where record_id='b0000000-0000-4000-8000-000000000001') then
    raise exception 'deleted passage history or Inventory visibility is wrong';
  end if;
end
$test$;
-- Use the otherwise independent same-owner project to exercise privacy cascade
-- without invoking pre-existing Fusion activity triggers on unrelated fixtures.
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
select review_id from public.save_annotation_credibility_review_v1(
  '20000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
  4, 'The judgment belongs only to this second investigation.', 'ADMIRALTY_ANNOTATION_V1', null,
  (select provenance from public.annotation_credibility_current_v1 where annotation_id='b0000000-0000-4000-8000-000000000003'),
  gen_random_uuid());
delete from public.source_assets where id='a0000000-0000-4000-8000-000000000003';
delete from public.projects where id='20000000-0000-4000-8000-000000000003';
do $test$
begin
  if exists(select 1 from public.annotation_credibility_reviews where project_id='20000000-0000-4000-8000-000000000003')
    or not exists(select 1 from public.annotation_credibility_reviews where project_id='20000000-0000-4000-8000-000000000001')
    then raise exception 'scoped privacy cascade failed';
  end if;
end
$test$;
reset role;
