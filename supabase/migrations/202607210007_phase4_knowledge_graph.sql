-- Phase 4 manual knowledge graph relationships
create type public.graph_entity_type as enum ('ACTOR','CAMPAIGN','INDICATOR','MALWARE','CVE','MITRE','EVIDENCE');

create table public.entity_relationships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_type public.graph_entity_type not null,
  source_id uuid not null,
  target_type public.graph_entity_type not null,
  target_id uuid not null,
  relationship_type text not null check (relationship_type ~ '^[A-Za-z0-9][A-Za-z0-9 _.:/-]{1,80}$'),
  description text check (description is null or char_length(description) <= 2000),
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entity_relationships_no_self_link check (source_type <> target_type or source_id <> target_id),
  constraint entity_relationships_unique_exact unique (project_id, source_type, source_id, target_type, target_id, relationship_type)
);

create index entity_relationships_project_source_idx on public.entity_relationships(project_id, source_type, source_id);
create index entity_relationships_project_target_idx on public.entity_relationships(project_id, target_type, target_id);
create index entity_relationships_project_type_idx on public.entity_relationships(project_id, relationship_type);

create trigger set_entity_relationships_updated_at before update on public.entity_relationships for each row execute function public.set_updated_at();

alter table public.entity_relationships enable row level security;
create policy entity_relationships_select on public.entity_relationships for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy entity_relationships_insert on public.entity_relationships for insert to authenticated with check (created_by = auth.uid() and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy entity_relationships_update on public.entity_relationships for update to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())) with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy entity_relationships_delete on public.entity_relationships for delete to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

create or replace function public.cleanup_entity_relationships() returns trigger
language plpgsql security invoker set search_path = public as $$
declare kind public.graph_entity_type;
begin
  kind := TG_ARGV[0]::public.graph_entity_type;
  delete from public.entity_relationships
    where project_id = old.project_id
      and ((source_type = kind and source_id = old.id) or (target_type = kind and target_id = old.id));
  return old;
end $$;
revoke all on function public.cleanup_entity_relationships() from public, anon;
grant execute on function public.cleanup_entity_relationships() to authenticated;

create trigger cleanup_actor_relationships before delete on public.threat_actors for each row execute function public.cleanup_entity_relationships('ACTOR');
create trigger cleanup_campaign_relationships before delete on public.campaigns for each row execute function public.cleanup_entity_relationships('CAMPAIGN');
create trigger cleanup_indicator_relationships before delete on public.indicators for each row execute function public.cleanup_entity_relationships('INDICATOR');
create trigger cleanup_malware_relationships before delete on public.malware for each row execute function public.cleanup_entity_relationships('MALWARE');
create trigger cleanup_cve_relationships before delete on public.cves for each row execute function public.cleanup_entity_relationships('CVE');
create trigger cleanup_mitre_relationships before delete on public.mitre_techniques for each row execute function public.cleanup_entity_relationships('MITRE');
create trigger cleanup_evidence_relationships before delete on public.evidence for each row execute function public.cleanup_entity_relationships('EVIDENCE');
