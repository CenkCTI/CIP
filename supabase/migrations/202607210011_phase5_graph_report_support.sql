-- Extend graph validation and cleanup for reports after REPORT enum value is committed.
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
  elsif p_type = 'REPORT' then
    return exists (select 1 from public.reports where project_id = p_project_id and id = p_id);
  end if;
  return false;
end $$;
revoke all on function public.graph_entity_exists(uuid, public.graph_entity_type, uuid) from public, anon, authenticated;

create trigger cleanup_report_relationships before delete on public.reports for each row execute function public.cleanup_entity_relationships('REPORT');
create trigger cleanup_report_graph_node_positions before delete on public.reports for each row execute function public.cleanup_graph_node_positions('REPORT');
