do $$ begin create type public.intel_profile_kind as enum ('STANDALONE','INVESTIGATION'); exception when duplicate_object then null; end $$;
do $$ begin create type public.intel_profile_status as enum ('ACTIVE','PAUSED','ARCHIVED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.intel_profile_priority as enum ('LOW','MEDIUM','HIGH','CRITICAL'); exception when duplicate_object then null; end $$;
do $$ begin create type public.intel_profile_item_origin as enum ('EXPLICIT','DERIVED','SUGGESTED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.intel_profile_item_state as enum ('PENDING','ACTIVE','EXCLUDED','REMOVED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.intel_profile_item_kind as enum ('THREAT_ACTOR','MALWARE','CAMPAIGN','CVE','INDICATOR','INFRASTRUCTURE','ATTACK_TECHNIQUE','VENDOR','PRODUCT','SECTOR','COUNTRY','REGION','TAG','KEYWORD'); exception when duplicate_object then null; end $$;
do $$ begin create type public.intel_profile_semantic_role as enum ('TARGET','AFFECTED_REGION','INFRASTRUCTURE_LOCATION','ACTOR_ASSOCIATION','STRATEGIC_CONTEXT','GENERAL_CONTEXT'); exception when duplicate_object then null; end $$;
do $$ begin create type public.intel_profile_audit_action as enum ('PROFILE_CREATED','PROFILE_UPDATED','PROFILE_PAUSED','PROFILE_RESUMED','PROFILE_ARCHIVED','PROFILE_RESTORED','ITEM_ADDED','ITEM_ACCEPTED','ITEM_EXCLUDED','ITEM_REMOVED','INVESTIGATION_REFRESHED'); exception when duplicate_object then null; end $$;

alter table public.projects add constraint projects_owner_id_id_unique unique(owner_id,id);

create table public.intel_profiles(
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade, kind public.intel_profile_kind not null,
  project_id uuid null, name text not null check(char_length(trim(name)) between 2 and 160), description text not null default '' check(char_length(description)<=2000),
  intelligence_question text not null default '' check(char_length(intelligence_question)<=2000), priority public.intel_profile_priority not null default 'MEDIUM',
  status public.intel_profile_status not null default 'ACTIVE', time_horizon_days integer not null default 90 check(time_horizon_days between 1 and 730),
  minimum_confidence integer null check(minimum_confidence between 0 and 100), relationship_depth integer not null default 1 check(relationship_depth between 0 and 3),
  created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  unique(owner_id,id), foreign key(owner_id,project_id) references public.projects(owner_id,id) on delete cascade,
  check((kind='STANDALONE' and project_id is null) or (kind='INVESTIGATION' and project_id is not null)), check((status='ARCHIVED')=(archived_at is not null))
);
create unique index intel_profiles_one_open_investigation_profile on public.intel_profiles(owner_id,project_id) where kind='INVESTIGATION' and archived_at is null;
create index intel_profiles_owner_kind_idx on public.intel_profiles(owner_id,kind,status,updated_at desc);
drop trigger if exists intel_profiles_set_updated_at on public.intel_profiles; create trigger intel_profiles_set_updated_at before update on public.intel_profiles for each row execute function public.set_updated_at();

create table public.intel_profile_items(
  id uuid primary key default gen_random_uuid(), profile_id uuid not null, owner_id uuid not null references auth.users(id) on delete cascade,
  kind public.intel_profile_item_kind not null, display_value text not null check(char_length(trim(display_value)) between 1 and 300), normalized_value text not null check(char_length(trim(normalized_value)) between 1 and 300),
  profile_local_key text not null check(char_length(profile_local_key)<=700), origin public.intel_profile_item_origin not null, state public.intel_profile_item_state not null,
  semantic_role public.intel_profile_semantic_role null, source_project_id uuid null, source_entity_type text null check(char_length(source_entity_type)<=80), source_entity_id uuid null,
  created_by uuid not null references auth.users(id), accepted_by uuid null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), removed_at timestamptz,
  unique(owner_id,id), foreign key(owner_id,profile_id) references public.intel_profiles(owner_id,id) on delete cascade, foreign key(owner_id,source_project_id) references public.projects(owner_id,id) on delete set null,
  check(origin <> 'SUGGESTED' or state='PENDING' or accepted_by is not null), check(kind not in ('COUNTRY','REGION') or state <> 'ACTIVE' or semantic_role is not null), check((state in ('REMOVED','EXCLUDED'))=(removed_at is not null))
);
create unique index intel_profile_items_active_pending_unique on public.intel_profile_items(owner_id,profile_id,profile_local_key) where state in ('PENDING','ACTIVE');
create index intel_profile_items_profile_state_idx on public.intel_profile_items(owner_id,profile_id,state,updated_at desc);
drop trigger if exists intel_profile_items_set_updated_at on public.intel_profile_items; create trigger intel_profile_items_set_updated_at before update on public.intel_profile_items for each row execute function public.set_updated_at();

create table public.intel_profile_audit_events(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade, profile_id uuid not null, item_id uuid null,
 actor_id uuid not null references auth.users(id), action public.intel_profile_audit_action not null, details jsonb not null default '{}' check(pg_column_size(details)<=4096), created_at timestamptz not null default now(),
 foreign key(owner_id,profile_id) references public.intel_profiles(owner_id,id) on delete cascade, foreign key(owner_id,item_id) references public.intel_profile_items(owner_id,id) on delete set null
);
create index intel_profile_audit_events_profile_idx on public.intel_profile_audit_events(owner_id,profile_id,created_at desc);

alter table public.intel_profiles enable row level security; alter table public.intel_profile_items enable row level security; alter table public.intel_profile_audit_events enable row level security;
create policy intel_profiles_select_own on public.intel_profiles for select to authenticated using(auth.uid()=owner_id);
create policy intel_profiles_insert_own on public.intel_profiles for insert to authenticated with check(auth.uid()=owner_id and auth.uid()=created_by and auth.uid()=updated_by);
create policy intel_profiles_update_own on public.intel_profiles for update to authenticated using(auth.uid()=owner_id) with check(auth.uid()=owner_id and auth.uid()=updated_by);
create policy intel_profile_items_select_own on public.intel_profile_items for select to authenticated using(auth.uid()=owner_id);
create policy intel_profile_items_insert_own on public.intel_profile_items for insert to authenticated with check(auth.uid()=owner_id and auth.uid()=created_by and exists(select 1 from public.intel_profiles p where p.owner_id=auth.uid() and p.id=profile_id));
create policy intel_profile_items_update_own on public.intel_profile_items for update to authenticated using(auth.uid()=owner_id) with check(auth.uid()=owner_id);
create policy intel_profile_audit_events_select_own on public.intel_profile_audit_events for select to authenticated using(auth.uid()=owner_id);
create policy intel_profile_audit_events_insert_own on public.intel_profile_audit_events for insert to authenticated with check(auth.uid()=owner_id and auth.uid()=actor_id);
