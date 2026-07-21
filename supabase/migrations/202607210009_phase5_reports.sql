-- Phase 5 reports core schema
create type public.report_type as enum ('TECHNICAL','EXECUTIVE','CTI','AI_SECURITY','OSINT');
create type public.report_status as enum ('DRAFT','REVIEW','FINAL');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  type public.report_type not null default 'TECHNICAL',
  content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}],"attrs":{"version":1}}'::jsonb,
  status public.report_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_project_id_id_unique unique (project_id, id),
  constraint reports_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint reports_content_object check (jsonb_typeof(content) = 'object')
);

create index reports_project_updated_idx on public.reports(project_id, updated_at desc);
create index reports_project_title_idx on public.reports(project_id, lower(title));
create index reports_project_type_status_idx on public.reports(project_id, type, status);

create or replace function public.validate_report_author() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.projects p where p.id = new.project_id and p.owner_id = auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
  elsif new.author_id <> old.author_id or new.project_id <> old.project_id then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.validate_report_author() from public, anon, authenticated;

create trigger validate_report_author before insert or update on public.reports for each row execute function public.validate_report_author();
create trigger set_reports_updated_at before update on public.reports for each row execute function public.set_updated_at();

alter table public.reports enable row level security;
create policy reports_select on public.reports for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy reports_insert on public.reports for insert to authenticated with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy reports_update on public.reports for update to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())) with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy reports_delete on public.reports for delete to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
