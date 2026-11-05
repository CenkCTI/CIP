-- CANVAS-2: durable references into canonical, owner-scoped Fusion Inventory.
-- Additive: v1 NOTE rows and old Canvas clients remain valid.
alter table public.analysis_canvas_items
  add column record_type text,
  add column record_id uuid;

alter table public.analysis_canvas_items drop constraint analysis_canvas_items_kind_check;

alter table public.analysis_canvas_items add constraint analysis_canvas_items_kind_reference_check
  check (
    (kind = 'NOTE' and record_type is null and record_id is null)
    or
    (kind = 'ENTITY_REF' and content = '' and record_type is not null
      and record_id is not null and record_type in ('SOURCE','SOURCE_ASSET','SOURCE_NOTE','ANNOTATION','SOURCE_CLAIM','ATTRIBUTION_CLAIM','RESEARCH_NOTE','EVIDENCE','TIMELINE_EVENT','ACTOR','CAMPAIGN','INDICATOR','MALWARE','CVE','MITRE','COUNTRY_NOTE','INFORMATION_GAP','COLLECTION_REQUIREMENT'))
  );

create index analysis_canvas_items_record_lookup_idx
  on public.analysis_canvas_items(project_id, record_type, record_id)
  where kind = 'ENTITY_REF';

-- Replaces v1 save implementation without changing its signature or permissions.
-- In particular: authenticated can ONLY write items through this owner-checked RPC.
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

comment on column public.analysis_canvas_items.record_type is
  'Live canonical Fusion Inventory record family. Never an assertion of provenance.';
comment on column public.analysis_canvas_items.record_id is
  'Investigation-scoped source record UUID. No copied intelligence, raw file or signed URL.';
