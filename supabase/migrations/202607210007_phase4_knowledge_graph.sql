-- Phase 4 manual knowledge graph relationships
create type public.graph_entity_type as enum ('ACTOR','CAMPAIGN','INDICATOR','MALWARE','CVE','MITRE','EVIDENCE');

create table public.entity_relationships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_type public.graph_entity_type not null,
  source_id uuid not null,
  target_type public.graph_entity_type not null,
  target_id uuid not null,
  relationship_type text not null,
  description text check (description is null or char_length(description) <= 2000),
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entity_relationships_type_format check (
    relationship_type = btrim(relationship_type)
    and char_length(relationship_type) between 2 and 80
    and relationship_type ~ '^[A-Za-z0-9][A-Za-z0-9 _.:/-]*$'
  ),
  constraint entity_relationships_no_self_link check (source_type <> target_type or source_id <> target_id),
  constraint entity_relationships_unique_exact unique (project_id, source_type, source_id, target_type, target_id, relationship_type)
);

create index entity_relationships_project_source_idx on public.entity_relationships(project_id, source_type, source_id);
create index entity_relationships_project_target_idx on public.entity_relationships(project_id, target_type, target_id);
create index entity_relationships_project_type_idx on public.entity_relationships(project_id, relationship_type);

create or replace function public.graph_entity_exists(p_project_id uuid, p_type public.graph_entity_type, p_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_type = 'ACTOR' then
    return exists (select 1 from public.threat_actors where project_id = p_project_id and id = p_id);
  elsif p_type = 'CAMPAIGN' then
    return exists (select 1 from public.campaigns where project_id = p_project_id and id = p_id);
  elsif p_type = 'INDICATOR' then
    return exists (select 1 from public.indicators where project_id = p_project_id and id = p_id);
  elsif p_type = 'MALWARE' then
    return exists (select 1 from public.malware where project_id = p_project_id and id = p_id);
  elsif p_type = 'CVE' then
    return exists (select 1 from public.cves where project_id = p_project_id and id = p_id);
  elsif p_type = 'MITRE' then
    return exists (select 1 from public.mitre_techniques where project_id = p_project_id and id = p_id);
  elsif p_type = 'EVIDENCE' then
    return exists (select 1 from public.evidence where project_id = p_project_id and id = p_id);
  end if;
  return false;
end $$;
revoke all on function public.graph_entity_exists(uuid, public.graph_entity_type, uuid) from public, anon, authenticated;

create or replace function public.validate_entity_relationship() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.projects p where p.id = new.project_id and p.owner_id = auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.created_by <> old.created_by then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if new.created_by is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.graph_entity_exists(new.project_id, new.source_type, new.source_id)
    or not public.graph_entity_exists(new.project_id, new.target_type, new.target_id) then
    raise exception 'relationship endpoint not found' using errcode = '23503';
  end if;
  return new;
end $$;
revoke all on function public.validate_entity_relationship() from public, anon, authenticated;

create trigger validate_entity_relationship before insert or update on public.entity_relationships for each row execute function public.validate_entity_relationship();
create trigger set_entity_relationships_updated_at before update on public.entity_relationships for each row execute function public.set_updated_at();

alter table public.entity_relationships enable row level security;
create policy entity_relationships_select on public.entity_relationships for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy entity_relationships_insert on public.entity_relationships for insert to authenticated with check (created_by = auth.uid() and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy entity_relationships_update on public.entity_relationships for update to authenticated using (created_by = auth.uid() and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())) with check (created_by = auth.uid() and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy entity_relationships_delete on public.entity_relationships for delete to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

create or replace function public.cleanup_entity_relationships() returns trigger
language plpgsql security definer set search_path = '' as $$
declare kind public.graph_entity_type;
begin
  kind := TG_ARGV[0]::public.graph_entity_type;
  delete from public.entity_relationships
    where project_id = old.project_id
      and ((source_type = kind and source_id = old.id) or (target_type = kind and target_id = old.id));
  return old;
end $$;
revoke all on function public.cleanup_entity_relationships() from public, anon, authenticated;

create trigger cleanup_actor_relationships before delete on public.threat_actors for each row execute function public.cleanup_entity_relationships('ACTOR');
create trigger cleanup_campaign_relationships before delete on public.campaigns for each row execute function public.cleanup_entity_relationships('CAMPAIGN');
create trigger cleanup_indicator_relationships before delete on public.indicators for each row execute function public.cleanup_entity_relationships('INDICATOR');
create trigger cleanup_malware_relationships before delete on public.malware for each row execute function public.cleanup_entity_relationships('MALWARE');
create trigger cleanup_cve_relationships before delete on public.cves for each row execute function public.cleanup_entity_relationships('CVE');
create trigger cleanup_mitre_relationships before delete on public.mitre_techniques for each row execute function public.cleanup_entity_relationships('MITRE');
create trigger cleanup_evidence_relationships before delete on public.evidence for each row execute function public.cleanup_entity_relationships('EVIDENCE');
