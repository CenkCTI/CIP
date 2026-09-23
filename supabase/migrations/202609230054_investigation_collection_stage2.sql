-- CİTEM Intelligence Production Stage 2: Collection
-- Analyst-directed collection requirements, source context, private source assets,
-- notes, annotations and printable working packets.
--
-- Stage boundary:
--   Stage 2 records why material was collected and how it relates to Direction gaps.
--   It does NOT evaluate source reliability/credibility, extract IOCs/TTPs/entities,
--   close gaps automatically, or create analytical assessments.

do $$ begin
  create type public.collection_requirement_status as enum (
    'OPEN', 'COLLECTING', 'SATISFIED', 'STOPPED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.collection_priority as enum ('LOW', 'MEDIUM', 'HIGH');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.source_asset_state as enum ('PENDING', 'READY', 'FAILED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.source_asset_role as enum ('ORIGINAL', 'DERIVED_PREVIEW');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.source_annotation_type as enum ('HIGHLIGHT', 'UNDERLINE', 'REGION');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.source_export_kind as enum ('PRINT_PACKET');
exception when duplicate_object then null; end $$;

alter table public.sources
  add column if not exists collection_rationale text;

alter table public.sources
  drop constraint if exists sources_collection_rationale_bounds_check,
  add constraint sources_collection_rationale_bounds_check
    check (
      collection_rationale is null
      or char_length(trim(collection_rationale)) between 1 and 4000
    );

create table public.collection_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  requirement text not null check (char_length(trim(requirement)) between 5 and 4000),
  rationale text check (rationale is null or char_length(rationale) <= 4000),
  priority public.collection_priority not null default 'MEDIUM',
  status public.collection_requirement_status not null default 'OPEN',
  sort_order integer not null default 0 check (sort_order >= 0),
  satisfied_at timestamptz,
  stopped_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, id),
  check (status = 'SATISFIED' or satisfied_at is null),
  check (status = 'STOPPED' or stopped_at is null)
);

create index collection_requirements_project_order_idx
  on public.collection_requirements(project_id, sort_order, created_at, id);
create index collection_requirements_project_status_idx
  on public.collection_requirements(project_id, status, priority, updated_at desc);
create trigger collection_requirements_set_updated_at
  before update on public.collection_requirements
  for each row execute function public.set_updated_at();

create table public.collection_requirement_gap_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  requirement_id uuid not null,
  gap_id uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key(project_id, requirement_id)
    references public.collection_requirements(project_id, id) on delete cascade,
  foreign key(project_id, gap_id)
    references public.investigation_information_gaps(project_id, id) on delete cascade,
  unique(project_id, requirement_id, gap_id)
);

create index collection_requirement_gap_links_gap_idx
  on public.collection_requirement_gap_links(project_id, gap_id, requirement_id);

create table public.source_requirement_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_id uuid not null,
  requirement_id uuid not null,
  analyst_note text check (analyst_note is null or char_length(analyst_note) <= 4000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key(project_id, source_id)
    references public.sources(project_id, id) on delete cascade,
  foreign key(project_id, requirement_id)
    references public.collection_requirements(project_id, id) on delete cascade,
  unique(project_id, source_id, requirement_id)
);

create index source_requirement_links_requirement_idx
  on public.source_requirement_links(project_id, requirement_id, source_id);

create table public.source_gap_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_id uuid not null,
  gap_id uuid not null,
  analyst_note text check (analyst_note is null or char_length(analyst_note) <= 4000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key(project_id, source_id)
    references public.sources(project_id, id) on delete cascade,
  foreign key(project_id, gap_id)
    references public.investigation_information_gaps(project_id, id) on delete cascade,
  unique(project_id, source_id, gap_id)
);

create index source_gap_links_gap_idx
  on public.source_gap_links(project_id, gap_id, source_id);

create table public.source_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_id uuid not null,
  body text not null check (char_length(trim(body)) between 1 and 20000),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(project_id, source_id)
    references public.sources(project_id, id) on delete cascade,
  unique(project_id, id)
);

create index source_notes_source_order_idx
  on public.source_notes(project_id, source_id, sort_order, created_at, id);
create trigger source_notes_set_updated_at
  before update on public.source_notes
  for each row execute function public.set_updated_at();

create table public.source_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_id uuid not null,
  asset_role public.source_asset_role not null default 'ORIGINAL',
  state public.source_asset_state not null default 'PENDING',
  original_filename text not null check (char_length(trim(original_filename)) between 1 and 255),
  mime_type text check (mime_type is null or char_length(mime_type) <= 255),
  size_bytes bigint check (size_bytes is null or size_bytes between 0 and 52428800),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  storage_path text not null check (char_length(storage_path) <= 1200),
  derived_from_asset_id uuid,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  unique(project_id, id),
  unique(project_id, source_id, id),
  foreign key(project_id, source_id)
    references public.sources(project_id, id) on delete restrict,
  foreign key(project_id, derived_from_asset_id)
    references public.source_assets(project_id, id) on delete restrict,
  check (asset_role = 'DERIVED_PREVIEW' or derived_from_asset_id is null),
  check (state = 'READY' or ready_at is null)
);

create index source_assets_source_idx
  on public.source_assets(project_id, source_id, asset_role, created_at, id);
create index source_assets_hash_idx
  on public.source_assets(project_id, sha256)
  where sha256 is not null;

create table public.source_annotations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_id uuid not null,
  asset_id uuid not null,
  annotation_type public.source_annotation_type not null,
  page_number integer check (page_number is null or page_number >= 1),
  rects jsonb not null default '[]'::jsonb check (jsonb_typeof(rects) = 'array'),
  selected_text text check (selected_text is null or char_length(selected_text) <= 20000),
  comment text check (comment is null or char_length(comment) <= 10000),
  annotation_group_id uuid,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(project_id, source_id, asset_id)
    references public.source_assets(project_id, source_id, id) on delete cascade,
  unique(project_id, id)
);

create index source_annotations_source_page_idx
  on public.source_annotations(project_id, source_id, page_number, created_at, id);
create trigger source_annotations_set_updated_at
  before update on public.source_annotations
  for each row execute function public.set_updated_at();

create table public.source_annotation_gap_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  annotation_id uuid not null,
  gap_id uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key(project_id, annotation_id)
    references public.source_annotations(project_id, id) on delete cascade,
  foreign key(project_id, gap_id)
    references public.investigation_information_gaps(project_id, id) on delete cascade,
  unique(project_id, annotation_id, gap_id)
);

create table public.source_annotation_requirement_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  annotation_id uuid not null,
  requirement_id uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key(project_id, annotation_id)
    references public.source_annotations(project_id, id) on delete cascade,
  foreign key(project_id, requirement_id)
    references public.collection_requirements(project_id, id) on delete cascade,
  unique(project_id, annotation_id, requirement_id)
);

create table public.source_export_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_id uuid not null,
  asset_id uuid,
  export_kind public.source_export_kind not null default 'PRINT_PACKET',
  annotation_count integer not null default 0 check (annotation_count >= 0),
  note_count integer not null default 0 check (note_count >= 0),
  source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key(project_id, source_id)
    references public.sources(project_id, id) on delete cascade,
  foreign key(project_id, asset_id)
    references public.source_assets(project_id, id) on delete restrict
);

create index source_export_events_source_idx
  on public.source_export_events(project_id, source_id, created_at desc);

alter table public.collection_requirements enable row level security;
alter table public.collection_requirement_gap_links enable row level security;
alter table public.source_requirement_links enable row level security;
alter table public.source_gap_links enable row level security;
alter table public.source_notes enable row level security;
alter table public.source_assets enable row level security;
alter table public.source_annotations enable row level security;
alter table public.source_annotation_gap_links enable row level security;
alter table public.source_annotation_requirement_links enable row level security;
alter table public.source_export_events enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'collection_requirements',
    'collection_requirement_gap_links',
    'source_requirement_links',
    'source_gap_links',
    'source_notes',
    'source_assets',
    'source_annotations',
    'source_annotation_gap_links',
    'source_annotation_requirement_links',
    'source_export_events'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.project_is_owned(project_id))',
      t || '_select_owned', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.project_is_owned(project_id) and created_by = auth.uid())',
      t || '_insert_owned', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.project_is_owned(project_id))',
      t || '_delete_owned', t
    );
  end loop;
end $$;

create policy collection_requirements_update_owned
  on public.collection_requirements for update to authenticated
  using (public.project_is_owned(project_id))
  with check (public.project_is_owned(project_id) and created_by = auth.uid());

create policy source_notes_update_owned
  on public.source_notes for update to authenticated
  using (public.project_is_owned(project_id))
  with check (public.project_is_owned(project_id) and created_by = auth.uid());

create policy source_assets_update_owned
  on public.source_assets for update to authenticated
  using (public.project_is_owned(project_id))
  with check (public.project_is_owned(project_id) and created_by = auth.uid());

create policy source_annotations_update_owned
  on public.source_annotations for update to authenticated
  using (public.project_is_owned(project_id))
  with check (public.project_is_owned(project_id) and created_by = auth.uid());

-- Private analyst-source storage. Arbitrary analyst files may be retained, but
-- only allowlisted safe types are previewed by the application.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('source-assets', 'source-assets', false, 52428800, null)
on conflict(id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.source_storage_project_is_owned(project_id_text text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id::text = project_id_text
      and p.owner_id = auth.uid()
  );
$$;

revoke all on function public.source_storage_project_is_owned(text) from public, anon;
grant execute on function public.source_storage_project_is_owned(text) to authenticated;

drop policy if exists "source assets storage read own" on storage.objects;
drop policy if exists "source assets storage insert own" on storage.objects;
drop policy if exists "source assets storage update own" on storage.objects;
drop policy if exists "source assets storage delete own" on storage.objects;

create policy "source assets storage read own"
on storage.objects for select to authenticated
using (
  bucket_id = 'source-assets'
  and auth.uid() is not null
  and cardinality(storage.foldername(name)) = 3
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.source_storage_project_is_owned((storage.foldername(name))[2])
  and coalesce(storage.filename(name), '') <> ''
);

create policy "source assets storage insert own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'source-assets'
  and auth.uid() is not null
  and cardinality(storage.foldername(name)) = 3
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.source_storage_project_is_owned((storage.foldername(name))[2])
  and coalesce(storage.filename(name), '') <> ''
);

create policy "source assets storage update own"
on storage.objects for update to authenticated
using (
  bucket_id = 'source-assets'
  and auth.uid() is not null
  and cardinality(storage.foldername(name)) = 3
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.source_storage_project_is_owned((storage.foldername(name))[2])
)
with check (
  bucket_id = 'source-assets'
  and auth.uid() is not null
  and cardinality(storage.foldername(name)) = 3
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.source_storage_project_is_owned((storage.foldername(name))[2])
);

create policy "source assets storage delete own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'source-assets'
  and auth.uid() is not null
  and cardinality(storage.foldername(name)) = 3
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.source_storage_project_is_owned((storage.foldername(name))[2])
);

comment on table public.collection_requirements is
  'Stage 2 analyst-directed collection needs derived from one or more information gaps.';
comment on column public.collection_requirements.status is
  'SATISFIED means analyst judged collection sufficient; it is never inferred from source count.';
comment on column public.sources.collection_rationale is
  'Why this project-scoped Source was collected. This is collection context, not an analytical judgement.';
comment on table public.source_notes is
  'Working notes attached to Sources. Notes are not Facts, Evidence judgements or Assessments.';
comment on table public.source_annotations is
  'Non-destructive analyst annotations over source assets. Original source bytes remain immutable.';
comment on table public.source_export_events is
  'Audit events for printable annotated working packets; no claim that the browser-produced PDF is an authoritative intelligence product.';
