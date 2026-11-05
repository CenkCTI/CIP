-- CANVAS-3 — analyst-only relationships, frames and organization.
-- Schema-only additive migration. No canonical evidence, claims, or graph edges are changed.

-- A FRAME is a visual container. Child item coordinates are relative to the frame.
alter table public.analysis_canvas_items add column group_id uuid;
alter table public.analysis_canvas_items
  drop constraint analysis_canvas_items_kind_reference_check,
  drop constraint analysis_canvas_items_width_check,
  drop constraint analysis_canvas_items_height_check;
alter table public.analysis_canvas_items add constraint analysis_canvas_items_kind_reference_check
  check (
    (kind='NOTE' and record_type is null and record_id is null)
    or (kind='ENTITY_REF' and content='' and record_type is not null and record_id is not null
      and record_type in ('SOURCE','SOURCE_ASSET','SOURCE_NOTE','ANNOTATION','SOURCE_CLAIM',
        'ATTRIBUTION_CLAIM','RESEARCH_NOTE','EVIDENCE','TIMELINE_EVENT','ACTOR','CAMPAIGN',
        'INDICATOR','MALWARE','CVE','MITRE','COUNTRY_NOTE','INFORMATION_GAP',
        'COLLECTION_REQUIREMENT'))
    or (kind='FRAME' and char_length(trim(content)) between 1 and 120
      and record_type is null and record_id is null and group_id is null)
  );
alter table public.analysis_canvas_items
  add constraint analysis_canvas_items_width_check
    check ((kind='FRAME' and width between 320 and 5000) or
           (kind <> 'FRAME' and width between 180 and 1200)),
  add constraint analysis_canvas_items_height_check
    check ((kind='FRAME' and height between 220 and 4000) or
           (kind <> 'FRAME' and height between 120 and 900)),
  add constraint analysis_canvas_items_group_fk
    foreign key (project_id, canvas_id, group_id)
    references public.analysis_canvas_items(project_id, canvas_id, id)
    deferrable initially deferred;
create index analysis_canvas_items_group_idx
  on public.analysis_canvas_items(project_id, canvas_id, group_id)
  where group_id is not null;

create table public.analysis_canvas_edges (
  id uuid primary key,
  project_id uuid not null,
  canvas_id uuid not null,
  source_id uuid not null,
  target_id uuid not null,
  relation_type text not null check (relation_type in
    ('RELATED_TO','SUPPORTS','CONTRADICTS','DERIVED_FROM','INVESTIGATE')),
  rationale text not null default '' check (char_length(rationale) <= 500),
  created_at timestamptz not null default now(),
  foreign key (project_id,canvas_id)
    references public.analysis_canvases(project_id,id) on delete cascade,
  foreign key (project_id,canvas_id,source_id)
    references public.analysis_canvas_items(project_id,canvas_id,id)
    deferrable initially deferred,
  foreign key (project_id,canvas_id,target_id)
    references public.analysis_canvas_items(project_id,canvas_id,id)
    deferrable initially deferred,
  check (source_id <> target_id)
);
create index analysis_canvas_edges_canvas_idx
  on public.analysis_canvas_edges(project_id,canvas_id,id);
alter table public.analysis_canvas_edges enable row level security;

create policy analysis_canvas_edges_select on public.analysis_canvas_edges
  for select to authenticated using (
    public.project_is_owned(project_id) and exists (
      select 1 from public.analysis_canvases b
      where b.project_id=analysis_canvas_edges.project_id
        and b.id=analysis_canvas_edges.canvas_id and b.created_by=auth.uid()
    )
  );
revoke all on public.analysis_canvas_edges from public,anon,authenticated;
grant select on public.analysis_canvas_edges to authenticated;

-- Old browser tabs cannot save a pre-CANVAS-3 snapshot over a frame or edge.
-- This check runs under the same locked Canvas revision as the legacy write.
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
      and (kind = 'FRAME' or group_id is not null)
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


-- New API and browser commit all cards+frames+relationships in one revisioned transaction.
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


revoke all on function public.save_analysis_canvas_v2(uuid,uuid,bigint,uuid,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.save_analysis_canvas_v2(uuid,uuid,bigint,uuid,jsonb,jsonb)
  to authenticated;

comment on table public.analysis_canvas_edges is
  'Canvas-only, analyst-defined visual relationships. Not corroborated evidence or Knowledge Graph assertions.';
comment on column public.analysis_canvas_items.group_id is
  'Optional single-level parent FRAME; child positions are frame-relative. No canonical record mutation.';
