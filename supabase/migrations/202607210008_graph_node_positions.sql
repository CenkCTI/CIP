-- Phase 4 hotfix: persistent per-user knowledge graph node positions
create table public.graph_node_positions (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type public.graph_entity_type not null,
  entity_id uuid not null,
  position_x double precision not null,
  position_y double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint graph_node_positions_pk primary key (project_id, user_id, entity_type, entity_id),
  constraint graph_node_positions_reasonable_x check (position_x between -1000000 and 1000000),
  constraint graph_node_positions_reasonable_y check (position_y between -1000000 and 1000000),
  constraint graph_node_positions_finite_x check (position_x::text not in ('NaN', 'Infinity', '-Infinity')),
  constraint graph_node_positions_finite_y check (position_y::text not in ('NaN', 'Infinity', '-Infinity'))
);

create index graph_node_positions_project_user_idx on public.graph_node_positions(project_id, user_id);
create index graph_node_positions_entity_lookup_idx on public.graph_node_positions(project_id, entity_type, entity_id);

create or replace function public.validate_graph_node_position() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects p where p.id = new.project_id and p.owner_id = auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.graph_entity_exists(new.project_id, new.entity_type, new.entity_id) then
    raise exception 'graph entity not found' using errcode = '23503';
  end if;
  return new;
end $$;
revoke all on function public.validate_graph_node_position() from public, anon, authenticated;

create trigger validate_graph_node_position before insert or update on public.graph_node_positions for each row execute function public.validate_graph_node_position();
create trigger set_graph_node_positions_updated_at before update on public.graph_node_positions for each row execute function public.set_updated_at();

alter table public.graph_node_positions enable row level security;
create policy graph_node_positions_select on public.graph_node_positions for select to authenticated using (user_id = auth.uid() and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy graph_node_positions_insert on public.graph_node_positions for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy graph_node_positions_update on public.graph_node_positions for update to authenticated using (user_id = auth.uid() and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())) with check (user_id = auth.uid() and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy graph_node_positions_delete on public.graph_node_positions for delete to authenticated using (user_id = auth.uid() and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

create or replace function public.cleanup_graph_node_positions() returns trigger
language plpgsql security definer set search_path = '' as $$
declare kind public.graph_entity_type;
begin
  kind := TG_ARGV[0]::public.graph_entity_type;
  delete from public.graph_node_positions where project_id = old.project_id and entity_type = kind and entity_id = old.id;
  return old;
end $$;
revoke all on function public.cleanup_graph_node_positions() from public, anon, authenticated;

create trigger cleanup_actor_graph_node_positions before delete on public.threat_actors for each row execute function public.cleanup_graph_node_positions('ACTOR');
create trigger cleanup_campaign_graph_node_positions before delete on public.campaigns for each row execute function public.cleanup_graph_node_positions('CAMPAIGN');
create trigger cleanup_indicator_graph_node_positions before delete on public.indicators for each row execute function public.cleanup_graph_node_positions('INDICATOR');
create trigger cleanup_malware_graph_node_positions before delete on public.malware for each row execute function public.cleanup_graph_node_positions('MALWARE');
create trigger cleanup_cve_graph_node_positions before delete on public.cves for each row execute function public.cleanup_graph_node_positions('CVE');
create trigger cleanup_mitre_graph_node_positions before delete on public.mitre_techniques for each row execute function public.cleanup_graph_node_positions('MITRE');
create trigger cleanup_evidence_graph_node_positions before delete on public.evidence for each row execute function public.cleanup_graph_node_positions('EVIDENCE');
