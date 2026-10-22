-- Investigation-scoped Copilot memory. AI hypotheses are NOT intelligence-domain records.
-- Authenticated owner only; no service-role, background AI write, or public grants.
create table public.copilot_memory_profiles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_id uuid not null,
  asset_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  notes text not null default '' check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,source_id,asset_id,owner_id),
  unique(project_id,id,owner_id),
  foreign key(project_id,source_id) references public.sources(project_id,id) on delete cascade,
  foreign key(project_id,source_id,asset_id)
    references public.source_assets(project_id,source_id,id) on delete cascade
);
create index copilot_memory_profiles_owner_idx on public.copilot_memory_profiles(owner_id,project_id);

create table public.copilot_memory_turns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 1500),
  mode text not null default 'analyst' check (mode in ('analyst')),
  context jsonb not null,
  result jsonb not null,
  web_research boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key(project_id,profile_id,owner_id)
    references public.copilot_memory_profiles(project_id,id,owner_id) on delete cascade,
  check (jsonb_typeof(context) = 'object'),
  check (jsonb_typeof(result) = 'object'),
  check (octet_length(result::text) <= 32000)
);
create index copilot_memory_turns_recent_idx
  on public.copilot_memory_turns(profile_id,created_at desc,id desc);

alter table public.copilot_memory_profiles enable row level security;
alter table public.copilot_memory_turns enable row level security;
grant select,insert,update,delete on public.copilot_memory_profiles to authenticated;
grant select,insert,delete on public.copilot_memory_turns to authenticated;
create policy copilot_memory_profiles_owner_select
  on public.copilot_memory_profiles for select to authenticated
  using (owner_id = (select auth.uid()) and public.project_is_owned(project_id));
create policy copilot_memory_profiles_owner_insert
  on public.copilot_memory_profiles for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.project_is_owned(project_id));
create policy copilot_memory_profiles_owner_update
  on public.copilot_memory_profiles for update to authenticated
  using (owner_id = (select auth.uid()) and public.project_is_owned(project_id))
  with check (owner_id = (select auth.uid()) and public.project_is_owned(project_id));
create policy copilot_memory_profiles_owner_delete
  on public.copilot_memory_profiles for delete to authenticated
  using (owner_id = (select auth.uid()) and public.project_is_owned(project_id));
create policy copilot_memory_turns_owner_select
  on public.copilot_memory_turns for select to authenticated
  using (owner_id = (select auth.uid()) and public.project_is_owned(project_id));
create policy copilot_memory_turns_owner_insert
  on public.copilot_memory_turns for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.project_is_owned(project_id));
create policy copilot_memory_turns_owner_delete
  on public.copilot_memory_turns for delete to authenticated
  using (owner_id = (select auth.uid()) and public.project_is_owned(project_id));

create trigger copilot_memory_profiles_set_updated_at before update
  on public.copilot_memory_profiles for each row execute function public.set_updated_at();
