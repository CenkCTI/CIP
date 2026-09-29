-- CİTEM Stage 2.1 hardening: provenance constraints and atomic annotation context updates.

alter table public.source_assets
  drop constraint if exists source_assets_derivation_v2_check,
  add constraint source_assets_derivation_v2_check
    check (
      (asset_role = 'ORIGINAL' and derived_from_asset_id is null)
      or asset_role = 'DERIVED_PREVIEW'
      or (asset_role = 'ANNOTATED_EXPORT' and derived_from_asset_id is not null)
    );

alter table public.source_assets
  drop constraint if exists source_assets_size_bytes_check,
  add constraint source_assets_size_bytes_check
    check (
      size_bytes is null
      or (
        size_bytes >= 0
        and (
          (asset_role = 'ORIGINAL' and size_bytes <= 52428800)
          or (asset_role <> 'ORIGINAL' and size_bytes <= 104857600)
        )
      )
    ),
  add constraint source_assets_derived_same_source_fk
    foreign key(project_id, source_id, derived_from_asset_id)
    references public.source_assets(project_id, source_id, id)
    on delete restrict;

alter table public.source_export_events
  add constraint source_export_events_original_asset_scope_fk
    foreign key(project_id, source_id, asset_id)
    references public.source_assets(project_id, source_id, id)
    on delete restrict,
  add constraint source_export_events_export_asset_scope_fk
    foreign key(project_id, source_id, export_asset_id)
    references public.source_assets(project_id, source_id, id)
    on delete restrict;

alter table public.source_annotations
  drop constraint if exists source_annotations_geometry_anchor_check,
  add constraint source_annotations_geometry_anchor_check
    check (
      (geometry_version = 1 and anchor_kind = 'LEGACY_SCREEN')
      or
      (geometry_version = 2 and anchor_kind in ('TEXT', 'REGION'))
    );

alter table public.source_annotations
  add constraint source_annotations_project_source_asset_id_unique
    unique(project_id, source_id, asset_id, id);

alter table public.source_annotation_fragments
  add constraint source_annotation_fragments_anchor_kind_check
    check(anchor_kind in ('TEXT', 'REGION')),
  add constraint source_annotation_fragments_annotation_scope_fk
    foreign key(project_id, source_id, asset_id, annotation_id)
    references public.source_annotations(project_id, source_id, asset_id, id)
    on delete cascade;

create or replace function public.record_source_annotation_v2(
  p_source_id uuid,
  p_asset_id uuid,
  p_annotation_type public.source_annotation_type,
  p_anchor_kind public.source_annotation_anchor_kind,
  p_selected_text text,
  p_comment text,
  p_fragments jsonb,
  p_gap_ids uuid[] default '{}'::uuid[],
  p_requirement_ids uuid[] default '{}'::uuid[]
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_annotation_id uuid := gen_random_uuid();
  v_fragment jsonb;
  v_quad jsonb;
  v_gap uuid;
  v_requirement uuid;
  v_first_page integer;
  v_total_quads integer := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_anchor_kind not in ('TEXT', 'REGION') then
    raise exception 'invalid anchor kind';
  end if;
  if p_anchor_kind = 'TEXT' and p_annotation_type = 'REGION' then
    raise exception 'text anchors cannot use REGION annotation type';
  end if;
  if p_anchor_kind = 'REGION' and p_annotation_type <> 'REGION' then
    raise exception 'region anchors must use REGION annotation type';
  end if;
  if p_anchor_kind = 'TEXT' and nullif(trim(coalesce(p_selected_text, '')), '') is null then
    raise exception 'text annotation requires selected text';
  end if;
  if p_selected_text is not null and char_length(p_selected_text) > 20000 then
    raise exception 'selected text too long';
  end if;
  if p_comment is not null and char_length(p_comment) > 10000 then
    raise exception 'annotation comment too long';
  end if;

  if jsonb_typeof(p_fragments) <> 'array'
     or jsonb_array_length(p_fragments) < 1
     or jsonb_array_length(p_fragments) > 10 then
    raise exception 'invalid fragment set';
  end if;

  select a.project_id
    into v_project_id
  from public.source_assets a
  where a.id = p_asset_id
    and a.source_id = p_source_id
    and a.asset_role = 'ORIGINAL'
    and a.state = 'READY'
    and (
      lower(coalesce(a.mime_type, '')) = 'application/pdf'
      or lower(a.original_filename) like '%.pdf'
    )
    and public.project_is_owned(a.project_id);

  if v_project_id is null then
    raise exception 'ready original PDF source asset not found';
  end if;

  if p_gap_ids is not null and exists(
    select 1
    from unnest(p_gap_ids) x
    where not exists(
      select 1
      from public.investigation_information_gaps g
      where g.project_id = v_project_id
        and g.id = x
    )
  ) then
    raise exception 'invalid information gap';
  end if;

  if p_requirement_ids is not null and exists(
    select 1
    from unnest(p_requirement_ids) x
    where not exists(
      select 1
      from public.collection_requirements r
      where r.project_id = v_project_id
        and r.id = x
    )
  ) then
    raise exception 'invalid collection requirement';
  end if;

  for v_fragment in
    select value from jsonb_array_elements(p_fragments)
  loop
    if jsonb_typeof(v_fragment) <> 'object'
       or jsonb_typeof(v_fragment->'quads') <> 'array'
       or jsonb_array_length(v_fragment->'quads') < 1
       or jsonb_array_length(v_fragment->'quads') > 500
       or coalesce((v_fragment->>'page_number')::integer, 0) < 1
       or coalesce((v_fragment->>'page_width')::double precision, 0) <= 0
       or coalesce((v_fragment->>'page_width')::double precision, 0) > 100000
       or coalesce((v_fragment->>'page_height')::double precision, 0) <= 0
       or coalesce((v_fragment->>'page_height')::double precision, 0) > 100000
       or coalesce((v_fragment->>'page_rotation')::integer, 0) not in (0, 90, 180, 270) then
      raise exception 'invalid annotation fragment';
    end if;

    v_total_quads := v_total_quads + jsonb_array_length(v_fragment->'quads');
    if v_total_quads > 500 then
      raise exception 'annotation contains too many quads';
    end if;

    for v_quad in
      select value from jsonb_array_elements(v_fragment->'quads')
    loop
      if jsonb_typeof(v_quad) <> 'object'
         or not (v_quad ?& array['x1','y1','x2','y2','x3','y3','x4','y4'])
         or jsonb_typeof(v_quad->'x1') <> 'number'
         or jsonb_typeof(v_quad->'y1') <> 'number'
         or jsonb_typeof(v_quad->'x2') <> 'number'
         or jsonb_typeof(v_quad->'y2') <> 'number'
         or jsonb_typeof(v_quad->'x3') <> 'number'
         or jsonb_typeof(v_quad->'y3') <> 'number'
         or jsonb_typeof(v_quad->'x4') <> 'number'
         or jsonb_typeof(v_quad->'y4') <> 'number' then
        raise exception 'invalid PDF quad';
      end if;
    end loop;
  end loop;

  v_first_page := ((p_fragments->0)->>'page_number')::integer;

  insert into public.source_annotations(
    id,
    project_id,
    source_id,
    asset_id,
    annotation_type,
    page_number,
    rects,
    selected_text,
    comment,
    geometry_version,
    anchor_kind,
    created_by
  ) values (
    v_annotation_id,
    v_project_id,
    p_source_id,
    p_asset_id,
    p_annotation_type,
    v_first_page,
    '[]'::jsonb,
    nullif(trim(coalesce(p_selected_text, '')), ''),
    nullif(trim(coalesce(p_comment, '')), ''),
    2,
    p_anchor_kind,
    auth.uid()
  );

  for v_fragment in
    select value from jsonb_array_elements(p_fragments)
  loop
    insert into public.source_annotation_fragments(
      project_id,
      source_id,
      asset_id,
      annotation_id,
      page_number,
      anchor_kind,
      quads,
      selected_text,
      page_width,
      page_height,
      page_rotation,
      created_by
    ) values (
      v_project_id,
      p_source_id,
      p_asset_id,
      v_annotation_id,
      (v_fragment->>'page_number')::integer,
      p_anchor_kind,
      v_fragment->'quads',
      nullif(v_fragment->>'selected_text', ''),
      (v_fragment->>'page_width')::double precision,
      (v_fragment->>'page_height')::double precision,
      coalesce((v_fragment->>'page_rotation')::integer, 0),
      auth.uid()
    );
  end loop;

  if p_gap_ids is not null then
    foreach v_gap in array p_gap_ids loop
      insert into public.source_annotation_gap_links(
        project_id, annotation_id, gap_id, created_by
      ) values (
        v_project_id, v_annotation_id, v_gap, auth.uid()
      )
      on conflict(project_id, annotation_id, gap_id) do nothing;
    end loop;
  end if;

  if p_requirement_ids is not null then
    foreach v_requirement in array p_requirement_ids loop
      insert into public.source_annotation_requirement_links(
        project_id, annotation_id, requirement_id, created_by
      ) values (
        v_project_id, v_annotation_id, v_requirement, auth.uid()
      )
      on conflict(project_id, annotation_id, requirement_id) do nothing;
    end loop;
  end if;

  return v_annotation_id;
end
$$;

revoke all on function public.record_source_annotation_v2(
  uuid,
  uuid,
  public.source_annotation_type,
  public.source_annotation_anchor_kind,
  text,
  text,
  jsonb,
  uuid[],
  uuid[]
) from public, anon;
grant execute on function public.record_source_annotation_v2(
  uuid,
  uuid,
  public.source_annotation_type,
  public.source_annotation_anchor_kind,
  text,
  text,
  jsonb,
  uuid[],
  uuid[]
) to authenticated;

create or replace function public.update_source_annotation_context_v2(
  p_source_id uuid,
  p_annotation_id uuid,
  p_comment text,
  p_gap_ids uuid[] default '{}'::uuid[],
  p_requirement_ids uuid[] default '{}'::uuid[]
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_gap uuid;
  v_requirement uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if p_comment is not null and char_length(p_comment) > 10000 then
    raise exception 'annotation comment too long';
  end if;

  select a.project_id
    into v_project_id
  from public.source_annotations a
  where a.id = p_annotation_id
    and a.source_id = p_source_id
    and public.project_is_owned(a.project_id);

  if v_project_id is null then
    raise exception 'annotation not found';
  end if;

  if p_gap_ids is not null and exists(
    select 1
    from unnest(p_gap_ids) x
    where not exists(
      select 1
      from public.investigation_information_gaps g
      where g.project_id = v_project_id
        and g.id = x
    )
  ) then
    raise exception 'invalid information gap';
  end if;

  if p_requirement_ids is not null and exists(
    select 1
    from unnest(p_requirement_ids) x
    where not exists(
      select 1
      from public.collection_requirements r
      where r.project_id = v_project_id
        and r.id = x
    )
  ) then
    raise exception 'invalid collection requirement';
  end if;

  update public.source_annotations
  set comment = nullif(trim(coalesce(p_comment, '')), '')
  where project_id = v_project_id
    and source_id = p_source_id
    and id = p_annotation_id;

  delete from public.source_annotation_gap_links
  where project_id = v_project_id
    and annotation_id = p_annotation_id;

  delete from public.source_annotation_requirement_links
  where project_id = v_project_id
    and annotation_id = p_annotation_id;

  if p_gap_ids is not null then
    foreach v_gap in array p_gap_ids loop
      insert into public.source_annotation_gap_links(
        project_id, annotation_id, gap_id, created_by
      ) values (
        v_project_id, p_annotation_id, v_gap, auth.uid()
      )
      on conflict(project_id, annotation_id, gap_id) do nothing;
    end loop;
  end if;

  if p_requirement_ids is not null then
    foreach v_requirement in array p_requirement_ids loop
      insert into public.source_annotation_requirement_links(
        project_id, annotation_id, requirement_id, created_by
      ) values (
        v_project_id, p_annotation_id, v_requirement, auth.uid()
      )
      on conflict(project_id, annotation_id, requirement_id) do nothing;
    end loop;
  end if;

  return p_annotation_id;
end
$$;

revoke all on function public.update_source_annotation_context_v2(
  uuid, uuid, text, uuid[], uuid[]
) from public, anon;
grant execute on function public.update_source_annotation_context_v2(
  uuid, uuid, text, uuid[], uuid[]
) to authenticated;

comment on function public.update_source_annotation_context_v2(uuid, uuid, text, uuid[], uuid[])
  is 'Atomically updates analyst comment and Investigation links without changing immutable PDF geometry.';
