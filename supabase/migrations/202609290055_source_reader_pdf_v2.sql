-- CİTEM Stage 2.1: native PDF reader, PDF-space annotations and deterministic exports.
do $$ begin
  create type public.source_annotation_anchor_kind as enum ('TEXT', 'REGION', 'LEGACY_SCREEN');
exception when duplicate_object then null; end $$;

do $$ declare c record; begin
  for c in select conname from pg_constraint
    where conrelid='public.source_assets'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%derived_from_asset_id%'
  loop execute format('alter table public.source_assets drop constraint %I',c.conname); end loop;
end $$;

alter table public.source_assets alter column asset_role drop default;
create type public.source_asset_role_v2 as enum ('ORIGINAL','DERIVED_PREVIEW','ANNOTATED_EXPORT');
alter table public.source_assets alter column asset_role type public.source_asset_role_v2 using asset_role::text::public.source_asset_role_v2;
drop type public.source_asset_role;
alter type public.source_asset_role_v2 rename to source_asset_role;
alter table public.source_assets alter column asset_role set default 'ORIGINAL'::public.source_asset_role;
alter table public.source_assets
  drop constraint if exists source_assets_size_bytes_check,
  add constraint source_assets_size_bytes_check check(size_bytes is null or size_bytes between 0 and 104857600),
  add constraint source_assets_derivation_v2_check check((asset_role='ORIGINAL' and derived_from_asset_id is null) or asset_role in('DERIVED_PREVIEW','ANNOTATED_EXPORT'));

alter table public.source_export_events alter column export_kind drop default;
create type public.source_export_kind_v2 as enum ('PRINT_PACKET','ANNOTATED_PDF');
alter table public.source_export_events alter column export_kind type public.source_export_kind_v2 using export_kind::text::public.source_export_kind_v2;
drop type public.source_export_kind;
alter type public.source_export_kind_v2 rename to source_export_kind;
alter table public.source_export_events alter column export_kind set default 'PRINT_PACKET'::public.source_export_kind;

alter table public.source_annotations
  add column if not exists geometry_version smallint not null default 1,
  add column if not exists anchor_kind public.source_annotation_anchor_kind not null default 'LEGACY_SCREEN';
alter table public.source_annotations
  drop constraint if exists source_annotations_geometry_version_check,
  add constraint source_annotations_geometry_version_check check(geometry_version in(1,2));

create table public.source_annotation_fragments(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_id uuid not null, asset_id uuid not null, annotation_id uuid not null,
  page_number integer not null check(page_number>=1),
  anchor_kind public.source_annotation_anchor_kind not null,
  quads jsonb not null check(jsonb_typeof(quads)='array' and jsonb_array_length(quads) between 1 and 500),
  selected_text text check(selected_text is null or char_length(selected_text)<=20000),
  page_width double precision not null check(page_width>0 and page_width<=100000),
  page_height double precision not null check(page_height>0 and page_height<=100000),
  page_rotation integer not null default 0 check(page_rotation between 0 and 359),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key(project_id,source_id,asset_id) references public.source_assets(project_id,source_id,id) on delete cascade,
  foreign key(project_id,annotation_id) references public.source_annotations(project_id,id) on delete cascade,
  unique(project_id,id)
);
create index source_annotation_fragments_source_page_idx on public.source_annotation_fragments(project_id,source_id,page_number,created_at,id);
create index source_annotation_fragments_annotation_idx on public.source_annotation_fragments(project_id,annotation_id,page_number,id);

alter table public.source_export_events
  add column if not exists export_asset_id uuid,
  add column if not exists export_sha256 text,
  add column if not exists export_input_sha256 text,
  add column if not exists export_filename text;
alter table public.source_export_events
  add constraint source_export_events_export_asset_fk foreign key(project_id,export_asset_id) references public.source_assets(project_id,id) on delete restrict,
  add constraint source_export_events_export_sha256_check check(export_sha256 is null or export_sha256~'^[a-f0-9]{64}$'),
  add constraint source_export_events_export_input_sha256_check check(export_input_sha256 is null or export_input_sha256~'^[a-f0-9]{64}$'),
  add constraint source_export_events_export_filename_check check(export_filename is null or char_length(export_filename) between 1 and 255);

alter table public.source_annotation_fragments enable row level security;
create policy source_annotation_fragments_select_owned on public.source_annotation_fragments for select to authenticated using(public.project_is_owned(project_id));
create policy source_annotation_fragments_insert_owned on public.source_annotation_fragments for insert to authenticated with check(public.project_is_owned(project_id) and created_by=auth.uid());
create policy source_annotation_fragments_delete_owned on public.source_annotation_fragments for delete to authenticated using(public.project_is_owned(project_id));

update storage.buckets set file_size_limit=104857600 where id='source-assets';

create or replace function public.record_source_annotation_v2(
  p_source_id uuid,p_asset_id uuid,p_annotation_type public.source_annotation_type,
  p_anchor_kind public.source_annotation_anchor_kind,p_selected_text text,p_comment text,
  p_fragments jsonb,p_gap_ids uuid[] default '{}'::uuid[],p_requirement_ids uuid[] default '{}'::uuid[]
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_project_id uuid;v_annotation_id uuid:=gen_random_uuid();v_fragment jsonb;v_gap uuid;v_requirement uuid;v_first_page integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_anchor_kind='LEGACY_SCREEN' then raise exception 'legacy anchor kind is not accepted'; end if;
  if jsonb_typeof(p_fragments)<>'array' or jsonb_array_length(p_fragments)<1 or jsonb_array_length(p_fragments)>10 then raise exception 'invalid fragment set'; end if;
  select a.project_id into v_project_id from public.source_assets a
    where a.id=p_asset_id and a.source_id=p_source_id and a.state='READY' and public.project_is_owned(a.project_id);
  if v_project_id is null then raise exception 'source asset not found'; end if;
  if p_gap_ids is not null and exists(select 1 from unnest(p_gap_ids)x where not exists(select 1 from public.investigation_information_gaps g where g.project_id=v_project_id and g.id=x))
    then raise exception 'invalid information gap'; end if;
  if p_requirement_ids is not null and exists(select 1 from unnest(p_requirement_ids)x where not exists(select 1 from public.collection_requirements r where r.project_id=v_project_id and r.id=x))
    then raise exception 'invalid collection requirement'; end if;
  v_first_page:=((p_fragments->0)->>'page_number')::integer;
  insert into public.source_annotations(id,project_id,source_id,asset_id,annotation_type,page_number,rects,selected_text,comment,geometry_version,anchor_kind,created_by)
  values(v_annotation_id,v_project_id,p_source_id,p_asset_id,p_annotation_type,v_first_page,'[]',nullif(p_selected_text,''),nullif(p_comment,''),2,p_anchor_kind,auth.uid());
  for v_fragment in select value from jsonb_array_elements(p_fragments) loop
    if (v_fragment->>'page_number')::integer<1 or (v_fragment->>'page_width')::double precision<=0 or (v_fragment->>'page_height')::double precision<=0
      or jsonb_typeof(v_fragment->'quads')<>'array' or jsonb_array_length(v_fragment->'quads')<1 or jsonb_array_length(v_fragment->'quads')>500
      then raise exception 'invalid annotation fragment'; end if;
    insert into public.source_annotation_fragments(project_id,source_id,asset_id,annotation_id,page_number,anchor_kind,quads,selected_text,page_width,page_height,page_rotation,created_by)
    values(v_project_id,p_source_id,p_asset_id,v_annotation_id,(v_fragment->>'page_number')::integer,p_anchor_kind,v_fragment->'quads',nullif(v_fragment->>'selected_text',''),
      (v_fragment->>'page_width')::double precision,(v_fragment->>'page_height')::double precision,coalesce((v_fragment->>'page_rotation')::integer,0),auth.uid());
  end loop;
  if p_gap_ids is not null then foreach v_gap in array p_gap_ids loop
    insert into public.source_annotation_gap_links(project_id,annotation_id,gap_id,created_by) values(v_project_id,v_annotation_id,v_gap,auth.uid())
    on conflict(project_id,annotation_id,gap_id) do nothing; end loop; end if;
  if p_requirement_ids is not null then foreach v_requirement in array p_requirement_ids loop
    insert into public.source_annotation_requirement_links(project_id,annotation_id,requirement_id,created_by) values(v_project_id,v_annotation_id,v_requirement,auth.uid())
    on conflict(project_id,annotation_id,requirement_id) do nothing; end loop; end if;
  return v_annotation_id;
end $$;
revoke all on function public.record_source_annotation_v2(uuid,uuid,public.source_annotation_type,public.source_annotation_anchor_kind,text,text,jsonb,uuid[],uuid[]) from public,anon;
grant execute on function public.record_source_annotation_v2(uuid,uuid,public.source_annotation_type,public.source_annotation_anchor_kind,text,text,jsonb,uuid[],uuid[]) to authenticated;

comment on table public.source_annotation_fragments is 'PDF-space geometry for CİTEM v2 annotations; never browser pixels.';
comment on column public.source_annotations.geometry_version is '1=legacy browser overlay; 2=PDF-space fragments.';
comment on column public.source_annotations.anchor_kind is 'TEXT/REGION for PDF-space anchors; LEGACY_SCREEN for v1 annotations.';
comment on column public.source_assets.asset_role is 'ORIGINAL is immutable; ANNOTATED_EXPORT is a derived CİTEM working copy.';
