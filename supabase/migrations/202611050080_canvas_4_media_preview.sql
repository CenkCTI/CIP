-- CANVAS-4 — live, owner-authorized private Source Asset previews.
-- Existing notes, entity references, frames, graph relationships and file blobs are untouched.
alter table public.analysis_canvas_items add column preview_page integer;
alter table public.analysis_canvas_items add constraint analysis_canvas_items_media_preview_check
  check (preview_page is null or (
    kind='ENTITY_REF' and record_type='SOURCE_ASSET'
    and preview_page between 1 and 10000
  ));
comment on column public.analysis_canvas_items.preview_page is
  'Optional selected page of a canonical SOURCE_ASSET, never a copied blob or signed Storage URL.';

-- Deny older browser tabs overwriting a CANVAS-4 preview at the same revision.
create or replace function public.save_analysis_canvas_v1(
  p_project_id uuid,
  p_canvas_id uuid,
  p_base_revision bigint,
  p_request_id uuid,
  p_items jsonb
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_revision bigint;
  v_existing public.analysis_canvas_mutations%rowtype;
  v_hash text;
  v_new_revision bigint;
begin
  if v_uid is null or p_request_id is null or p_base_revision is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select b.revision into v_revision
  from public.analysis_canvases b
  join public.projects p on p.id = b.project_id
  where b.project_id = p_project_id and b.id = p_canvas_id
    and b.created_by = v_uid and p.owner_id = v_uid
  for update of b;
  if not found then
    raise exception 'Canvas not found' using errcode = '42501';
  end if;
  -- An old Canvas-1/2 tab must not silently erase Canvas-3 organization.
  if exists (
    select 1 from public.analysis_canvas_items
    where project_id = p_project_id and canvas_id = p_canvas_id
      and (kind = 'FRAME' or group_id is not null or preview_page is not null)
  ) or exists (
    select 1 from public.analysis_canvas_edges
    where project_id = p_project_id and canvas_id = p_canvas_id
  ) then
    raise exception 'EDIT_CONFLICT' using errcode = '40001';
  end if;


  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'Invalid item set' using errcode = '22023';
  end if;
  v_hash := encode(sha256(convert_to(p_items::text, 'UTF8')), 'hex');
  select * into v_existing from public.analysis_canvas_mutations
    where canvas_id = p_canvas_id and request_id = p_request_id;
  if found then
    if v_existing.base_revision = p_base_revision and v_existing.input_sha256 = v_hash then
      return v_existing.result_revision;
    end if;
    raise exception 'Request ID already used' using errcode = '22023';
  end if;

  if p_base_revision <> v_revision then
    raise exception 'EDIT_CONFLICT' using errcode = '40001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as item(id uuid, kind text, content text,
      x double precision, y double precision, width double precision, height double precision, z_index integer)
    group by item.id having item.id is null or count(*) > 1
  ) then
    raise exception 'Duplicate or missing item IDs' using errcode = '22023';
  end if;

  -- New canonical references must belong to this Investigation.
  -- Existing references are permitted to survive source deletion as visibly missing cards.
  -- This does NOT allow a newly introduced unknown or cross-project reference.
  if exists (
    select 1 from jsonb_to_recordset(p_items) as item(
      kind text, record_type text, record_id uuid
    )
    where item.kind = 'ENTITY_REF'
      and not exists (
        select 1 from public.fusion_inventory_base inv
        where inv.project_id = p_project_id
          and inv.record_type = item.record_type and inv.record_id = item.record_id
      )
      and not exists (
        select 1 from public.analysis_canvas_items old
        where old.project_id = p_project_id and old.canvas_id = p_canvas_id
          and old.kind = 'ENTITY_REF' and old.record_type = item.record_type
          and old.record_id = item.record_id
      )
  ) then
    raise exception 'Reference not found in Investigation' using errcode = '23503';
  end if;

  delete from public.analysis_canvas_items where project_id = p_project_id and canvas_id = p_canvas_id;
  insert into public.analysis_canvas_items
    (id, project_id, canvas_id, kind, content, x, y, width, height, z_index, record_type, record_id)
    select item.id, p_project_id, p_canvas_id, item.kind, item.content, item.x, item.y,
      item.width, item.height, item.z_index, item.record_type, item.record_id
    from jsonb_to_recordset(p_items) as item(
      id uuid, kind text, content text,
      x double precision, y double precision, width double precision, height double precision,
      z_index integer, record_type text, record_id uuid
    );
  update public.analysis_canvases set revision = revision + 1, updated_at = now()
    where id = p_canvas_id and project_id = p_project_id returning revision into v_new_revision;
  insert into public.analysis_canvas_mutations
    (project_id, canvas_id, request_id, base_revision, result_revision, input_sha256, created_by)
    values (p_project_id, p_canvas_id, p_request_id, p_base_revision, v_new_revision, v_hash, v_uid);
  return v_new_revision;
end
$$;

create or replace function public.save_analysis_canvas_v2(
  p_project_id uuid,
  p_canvas_id uuid,
  p_base_revision bigint,
  p_request_id uuid,
  p_items jsonb,
  p_edges jsonb
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_revision bigint;
  v_existing public.analysis_canvas_mutations%rowtype;
  v_hash text;
  v_new_revision bigint;
begin
  if v_uid is null or p_request_id is null or p_base_revision is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select b.revision into v_revision
  from public.analysis_canvases b
  join public.projects p on p.id = b.project_id
  where b.project_id = p_project_id and b.id = p_canvas_id
    and b.created_by = v_uid and p.owner_id = v_uid
  for update of b;
  if not found then
    raise exception 'Canvas not found' using errcode = '42501';
  end if;

  -- Old CANVAS-3 clients must not erase CANVAS-4 page selections.
  if exists (select 1 from public.analysis_canvas_items
      where project_id=p_project_id and canvas_id=p_canvas_id
        and preview_page is not null) then
    raise exception 'EDIT_CONFLICT' using errcode='40001';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'Invalid item set' using errcode = '22023';
  end if;
  if jsonb_typeof(p_edges) is distinct from 'array' or jsonb_array_length(p_edges) > 1000 then
    raise exception 'Invalid edge set' using errcode = '22023';
  end if;
  v_hash := encode(sha256(convert_to(
    jsonb_build_object('items', p_items, 'edges', p_edges)::text, 'UTF8')), 'hex');
  select * into v_existing from public.analysis_canvas_mutations
    where canvas_id = p_canvas_id and request_id = p_request_id;
  if found then
    if v_existing.base_revision = p_base_revision and v_existing.input_sha256 = v_hash then
      return v_existing.result_revision;
    end if;
    raise exception 'Request ID already used' using errcode = '22023';
  end if;

  if p_base_revision <> v_revision then
    raise exception 'EDIT_CONFLICT' using errcode = '40001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as item(id uuid, kind text, content text,
      x double precision, y double precision, width double precision, height double precision, z_index integer)
    group by item.id having item.id is null or count(*) > 1
  ) then
    raise exception 'Duplicate or missing item IDs' using errcode = '22023';
  end if;

  -- New canonical references must belong to this Investigation.
  -- Existing references are permitted to survive source deletion as visibly missing cards.
  -- This does NOT allow a newly introduced unknown or cross-project reference.
  if exists (
    select 1 from jsonb_to_recordset(p_items) as item(
      kind text, record_type text, record_id uuid
    )
    where item.kind = 'ENTITY_REF'
      and not exists (
        select 1 from public.fusion_inventory_base inv
        where inv.project_id = p_project_id
          and inv.record_type = item.record_type and inv.record_id = item.record_id
      )
      and not exists (
        select 1 from public.analysis_canvas_items old
        where old.project_id = p_project_id and old.canvas_id = p_canvas_id
          and old.kind = 'ENTITY_REF' and old.record_type = item.record_type
          and old.record_id = item.record_id
      )
  ) then
    raise exception 'Reference not found in Investigation' using errcode = '23503';
  end if;

  -- Group membership is presentation-only and non-nested. No foreign frame IDs.
  if exists (
    select 1 from jsonb_to_recordset(p_items) as item(id uuid,kind text,group_id uuid)
    where (item.kind = 'FRAME' and item.group_id is not null)
       or (item.kind <> 'FRAME' and item.group_id is not null and not exists (
         select 1 from jsonb_to_recordset(p_items) as parent(id uuid,kind text)
         where parent.id = item.group_id and parent.kind = 'FRAME'
       ))
  ) then
    raise exception 'Invalid frame membership' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_edges) as edge(id uuid)
    group by edge.id having edge.id is null or count(*) > 1
  ) then
    raise exception 'Duplicate or missing edge IDs' using errcode = '22023';
  end if;
  -- Every relationship joins two different cards on this exact snapshot;
  -- frames cannot be relationship endpoints and are not canonical CTI records.
  if exists (
    select 1 from jsonb_to_recordset(p_edges) as edge(source_id uuid,target_id uuid)
    where edge.source_id is null or edge.target_id is null
      or edge.source_id = edge.target_id
      or not exists (
        select 1 from jsonb_to_recordset(p_items) as item(id uuid,kind text)
        where item.id = edge.source_id and item.kind in ('NOTE','ENTITY_REF')
      )
      or not exists (
        select 1 from jsonb_to_recordset(p_items) as item(id uuid,kind text)
        where item.id = edge.target_id and item.kind in ('NOTE','ENTITY_REF')
      )
  ) then
    raise exception 'Invalid relationship endpoints' using errcode = '22023';
  end if;

  delete from public.analysis_canvas_edges where project_id = p_project_id and canvas_id = p_canvas_id;
  delete from public.analysis_canvas_items where project_id = p_project_id and canvas_id = p_canvas_id;
  insert into public.analysis_canvas_items
    (id, project_id, canvas_id, kind, content, x, y, width, height, z_index,
      record_type, record_id, group_id)
    select item.id, p_project_id, p_canvas_id, item.kind, item.content, item.x, item.y,
      item.width, item.height, item.z_index, item.record_type, item.record_id, item.group_id
    from jsonb_to_recordset(p_items) as item(
      id uuid, kind text, content text,
      x double precision, y double precision, width double precision, height double precision,
      z_index integer, record_type text, record_id uuid, group_id uuid
    );

  insert into public.analysis_canvas_edges
    (id, project_id, canvas_id, source_id, target_id, relation_type, rationale)
    select edge.id, p_project_id, p_canvas_id, edge.source_id, edge.target_id,
      edge.relation_type, edge.rationale
    from jsonb_to_recordset(p_edges) as edge(
      id uuid, source_id uuid, target_id uuid, relation_type text, rationale text
    );
  update public.analysis_canvases set revision = revision + 1, updated_at = now()
    where id = p_canvas_id and project_id = p_project_id returning revision into v_new_revision;
  insert into public.analysis_canvas_mutations
    (project_id, canvas_id, request_id, base_revision, result_revision, input_sha256, created_by)
    values (p_project_id, p_canvas_id, p_request_id, p_base_revision, v_new_revision, v_hash, v_uid);
  return v_new_revision;
end
$$;

-- Revisioned full-scene replacement with optional preview_page on source-asset references.
-- Existing CANVAS-3 validation, owner lock, exact Inventory check, edge RLS and retry semantics remain.
create or replace function public.save_analysis_canvas_v3(
  p_project_id uuid,
  p_canvas_id uuid,
  p_base_revision bigint,
  p_request_id uuid,
  p_items jsonb,
  p_edges jsonb
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_revision bigint;
  v_existing public.analysis_canvas_mutations%rowtype;
  v_hash text;
  v_new_revision bigint;
begin
  if v_uid is null or p_request_id is null or p_base_revision is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select b.revision into v_revision
  from public.analysis_canvases b
  join public.projects p on p.id = b.project_id
  where b.project_id = p_project_id and b.id = p_canvas_id
    and b.created_by = v_uid and p.owner_id = v_uid
  for update of b;
  if not found then
    raise exception 'Canvas not found' using errcode = '42501';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'Invalid item set' using errcode = '22023';
  end if;
  if jsonb_typeof(p_edges) is distinct from 'array' or jsonb_array_length(p_edges) > 1000 then
    raise exception 'Invalid edge set' using errcode = '22023';
  end if;
  v_hash := encode(sha256(convert_to(
    jsonb_build_object('items', p_items, 'edges', p_edges)::text, 'UTF8')), 'hex');
  select * into v_existing from public.analysis_canvas_mutations
    where canvas_id = p_canvas_id and request_id = p_request_id;
  if found then
    if v_existing.base_revision = p_base_revision and v_existing.input_sha256 = v_hash then
      return v_existing.result_revision;
    end if;
    raise exception 'Request ID already used' using errcode = '22023';
  end if;

  if p_base_revision <> v_revision then
    raise exception 'EDIT_CONFLICT' using errcode = '40001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as item(id uuid, kind text, content text,
      x double precision, y double precision, width double precision, height double precision, z_index integer)
    group by item.id having item.id is null or count(*) > 1
  ) then
    raise exception 'Duplicate or missing item IDs' using errcode = '22023';
  end if;

  -- New canonical references must belong to this Investigation.
  -- Existing references are permitted to survive source deletion as visibly missing cards.
  -- This does NOT allow a newly introduced unknown or cross-project reference.
  if exists (
    select 1 from jsonb_to_recordset(p_items) as item(
      kind text, record_type text, record_id uuid
    )
    where item.kind = 'ENTITY_REF'
      and not exists (
        select 1 from public.fusion_inventory_base inv
        where inv.project_id = p_project_id
          and inv.record_type = item.record_type and inv.record_id = item.record_id
      )
      and not exists (
        select 1 from public.analysis_canvas_items old
        where old.project_id = p_project_id and old.canvas_id = p_canvas_id
          and old.kind = 'ENTITY_REF' and old.record_type = item.record_type
          and old.record_id = item.record_id
      )
  ) then
    raise exception 'Reference not found in Investigation' using errcode = '23503';
  end if;

  -- Group membership is presentation-only and non-nested. No foreign frame IDs.
  if exists (
    select 1 from jsonb_to_recordset(p_items) as item(id uuid,kind text,group_id uuid)
    where (item.kind = 'FRAME' and item.group_id is not null)
       or (item.kind <> 'FRAME' and item.group_id is not null and not exists (
         select 1 from jsonb_to_recordset(p_items) as parent(id uuid,kind text)
         where parent.id = item.group_id and parent.kind = 'FRAME'
       ))
  ) then
    raise exception 'Invalid frame membership' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_edges) as edge(id uuid)
    group by edge.id having edge.id is null or count(*) > 1
  ) then
    raise exception 'Duplicate or missing edge IDs' using errcode = '22023';
  end if;
  -- Every relationship joins two different cards on this exact snapshot;
  -- frames cannot be relationship endpoints and are not canonical CTI records.
  if exists (
    select 1 from jsonb_to_recordset(p_edges) as edge(source_id uuid,target_id uuid)
    where edge.source_id is null or edge.target_id is null
      or edge.source_id = edge.target_id
      or not exists (
        select 1 from jsonb_to_recordset(p_items) as item(id uuid,kind text)
        where item.id = edge.source_id and item.kind in ('NOTE','ENTITY_REF')
      )
      or not exists (
        select 1 from jsonb_to_recordset(p_items) as item(id uuid,kind text)
        where item.id = edge.target_id and item.kind in ('NOTE','ENTITY_REF')
      )
  ) then
    raise exception 'Invalid relationship endpoints' using errcode = '22023';
  end if;

  delete from public.analysis_canvas_edges where project_id = p_project_id and canvas_id = p_canvas_id;
  delete from public.analysis_canvas_items where project_id = p_project_id and canvas_id = p_canvas_id;
  insert into public.analysis_canvas_items
    (id, project_id, canvas_id, kind, content, x, y, width, height, z_index,
      record_type, record_id, group_id, preview_page)
    select item.id, p_project_id, p_canvas_id, item.kind, item.content, item.x, item.y,
      item.width, item.height, item.z_index, item.record_type, item.record_id, item.group_id,
      item.preview_page
    from jsonb_to_recordset(p_items) as item(
      id uuid, kind text, content text,
      x double precision, y double precision, width double precision, height double precision,
      z_index integer, record_type text, record_id uuid, group_id uuid,
      preview_page integer
    );

  insert into public.analysis_canvas_edges
    (id, project_id, canvas_id, source_id, target_id, relation_type, rationale)
    select edge.id, p_project_id, p_canvas_id, edge.source_id, edge.target_id,
      edge.relation_type, edge.rationale
    from jsonb_to_recordset(p_edges) as edge(
      id uuid, source_id uuid, target_id uuid, relation_type text, rationale text
    );
  update public.analysis_canvases set revision = revision + 1, updated_at = now()
    where id = p_canvas_id and project_id = p_project_id returning revision into v_new_revision;
  insert into public.analysis_canvas_mutations
    (project_id, canvas_id, request_id, base_revision, result_revision, input_sha256, created_by)
    values (p_project_id, p_canvas_id, p_request_id, p_base_revision, v_new_revision, v_hash, v_uid);
  return v_new_revision;
end
$$;

revoke all on function public.save_analysis_canvas_v3(uuid,uuid,bigint,uuid,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.save_analysis_canvas_v3(uuid,uuid,bigint,uuid,jsonb,jsonb)
  to authenticated;
