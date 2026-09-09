-- Notes & Reports Workspace V2
-- Additive migration: Obsidian-like folders, structured note drafts, and optimistic draft revisions.

create type public.workspace_folder_kind as enum ('NOTES','REPORTS');

create table public.workspace_folders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind public.workspace_folder_kind not null,
  parent_id uuid references public.workspace_folders(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_folders_project_id_id_unique unique(project_id,id),
  constraint workspace_folders_name_length check(char_length(btrim(name)) between 1 and 120),
  constraint workspace_folders_name_safe check(name !~ '[\\/]' and name !~ '[[:cntrl:]]')
);

create unique index workspace_folders_root_name_unique
  on public.workspace_folders(project_id,kind,lower(name))
  where parent_id is null;
create unique index workspace_folders_child_name_unique
  on public.workspace_folders(project_id,kind,parent_id,lower(name))
  where parent_id is not null;
create index workspace_folders_tree_idx
  on public.workspace_folders(project_id,kind,parent_id,lower(name));

create trigger workspace_folders_set_updated_at
before update on public.workspace_folders
for each row execute function public.set_updated_at();

create or replace function public.validate_workspace_folder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_project uuid;
  parent_kind public.workspace_folder_kind;
  cycle_found boolean := false;
  max_depth integer := 0;
begin
  if not exists (
    select 1 from public.projects p
    where p.id = new.project_id and p.owner_id = auth.uid()
  ) then
    raise exception 'not authorized' using errcode='42501';
  end if;

  new.name := btrim(new.name);

  if new.parent_id is not null then
    select f.project_id, f.kind into parent_project, parent_kind
    from public.workspace_folders f
    where f.id = new.parent_id;

    if parent_project is null or parent_project <> new.project_id or parent_kind <> new.kind then
      raise exception 'invalid workspace folder parent' using errcode='23514';
    end if;

    if tg_op = 'UPDATE' and new.parent_id = new.id then
      raise exception 'workspace folder cycle' using errcode='23514';
    end if;

    with recursive ancestors as (
      select f.id, f.parent_id, 1 as depth
      from public.workspace_folders f
      where f.id = new.parent_id
      union all
      select f.id, f.parent_id, a.depth + 1
      from public.workspace_folders f
      join ancestors a on f.id = a.parent_id
      where a.depth < 17
    )
    select
      coalesce(bool_or(a.id = new.id), false),
      coalesce(max(a.depth), 0)
    into cycle_found, max_depth
    from ancestors a;

    if cycle_found then
      raise exception 'workspace folder cycle' using errcode='23514';
    end if;
    if max_depth >= 16 then
      raise exception 'workspace folder depth exceeds 16' using errcode='23514';
    end if;
  end if;

  return new;
end $$;
revoke all on function public.validate_workspace_folder() from public,anon,authenticated;

create trigger workspace_folders_validate
before insert or update on public.workspace_folders
for each row execute function public.validate_workspace_folder();

alter table public.workspace_folders enable row level security;
create policy workspace_folders_select on public.workspace_folders
for select to authenticated
using (public.project_is_owned(project_id));
create policy workspace_folders_insert on public.workspace_folders
for insert to authenticated
with check (public.project_is_owned(project_id));
create policy workspace_folders_update on public.workspace_folders
for update to authenticated
using (public.project_is_owned(project_id))
with check (public.project_is_owned(project_id));
create policy workspace_folders_delete on public.workspace_folders
for delete to authenticated
using (public.project_is_owned(project_id));

alter table public.research_notes
  add column folder_id uuid references public.workspace_folders(id) on delete restrict,
  add column content_doc jsonb,
  add column content_schema_version smallint not null default 1,
  add column edit_revision bigint not null default 0;

update public.research_notes
set content_doc = jsonb_build_object(
  'type','doc',
  'attrs',jsonb_build_object('version',1),
  'content',jsonb_build_array(
    case
      when content = '' then jsonb_build_object('type','paragraph')
      else jsonb_build_object(
        'type','paragraph',
        'content',jsonb_build_array(jsonb_build_object('type','text','text',content))
      )
    end
  )
)
where content_doc is null;

alter table public.research_notes
  alter column content_doc set not null,
  alter column content_doc set default '{"type":"doc","attrs":{"version":1},"content":[{"type":"paragraph"}]}'::jsonb,
  add constraint research_notes_content_doc_object check(jsonb_typeof(content_doc)='object'),
  add constraint research_notes_content_doc_version check(content_doc->>'type'='doc' and content_doc#>>'{attrs,version}'='1'),
  add constraint research_notes_edit_revision_nonnegative check(edit_revision>=0);

create index research_notes_folder_title_idx
  on public.research_notes(project_id,folder_id,lower(title));

alter table public.reports
  add column folder_id uuid references public.workspace_folders(id) on delete restrict,
  add column draft_revision bigint not null default 0,
  add constraint reports_draft_revision_nonnegative check(draft_revision>=0);

create index reports_folder_title_idx
  on public.reports(project_id,folder_id,lower(title));

create or replace function public.validate_workspace_document_folder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_kind public.workspace_folder_kind;
  folder_project uuid;
  folder_kind public.workspace_folder_kind;
begin
  if new.folder_id is null then
    return new;
  end if;

  expected_kind := case when tg_table_name = 'research_notes' then 'NOTES'::public.workspace_folder_kind else 'REPORTS'::public.workspace_folder_kind end;

  select f.project_id, f.kind into folder_project, folder_kind
  from public.workspace_folders f
  where f.id = new.folder_id;

  if folder_project is null or folder_project <> new.project_id or folder_kind <> expected_kind then
    raise exception 'invalid workspace document folder' using errcode='23514';
  end if;

  return new;
end $$;
revoke all on function public.validate_workspace_document_folder() from public,anon,authenticated;

create trigger research_notes_validate_workspace_folder
before insert or update of project_id,folder_id on public.research_notes
for each row execute function public.validate_workspace_document_folder();

create trigger reports_validate_workspace_folder
before insert or update of project_id,folder_id on public.reports
for each row execute function public.validate_workspace_document_folder();
