-- Fusion Graph: extend the EXISTING graph entity system; do not create parallel edges.
alter type public.graph_entity_type add value if not exists 'COUNTRY';
alter type public.graph_entity_type add value if not exists 'SOURCE';
alter type public.graph_entity_type add value if not exists 'SOURCE_ASSET';
alter type public.graph_entity_type add value if not exists 'SOURCE_NOTE';
alter type public.graph_entity_type add value if not exists 'ANNOTATION';
alter type public.graph_entity_type add value if not exists 'SOURCE_CLAIM';
alter type public.graph_entity_type add value if not exists 'ATTRIBUTION_CLAIM';
alter type public.graph_entity_type add value if not exists 'RESEARCH_NOTE';
alter type public.graph_entity_type add value if not exists 'TIMELINE_EVENT';
alter type public.graph_entity_type add value if not exists 'COUNTRY_NOTE';
create or replace function public.graph_entity_exists(p_project_id uuid,p_type public.graph_entity_type,p_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  case p_type::text
   when 'ACTOR' then return exists(select 1 from public.threat_actors where project_id=p_project_id and id=p_id);
   when 'CAMPAIGN' then return exists(select 1 from public.campaigns where project_id=p_project_id and id=p_id);
   when 'INDICATOR' then return exists(select 1 from public.indicators where project_id=p_project_id and id=p_id);
   when 'MALWARE' then return exists(select 1 from public.malware where project_id=p_project_id and id=p_id);
   when 'CVE' then return exists(select 1 from public.cves where project_id=p_project_id and id=p_id);
   when 'MITRE' then return exists(select 1 from public.mitre_techniques where project_id=p_project_id and id=p_id);
   when 'EVIDENCE' then return exists(select 1 from public.evidence where project_id=p_project_id and id=p_id);
   when 'REPORT' then return exists(select 1 from public.reports where project_id=p_project_id and id=p_id);
   when 'INFRASTRUCTURE_CLUSTER' then return exists(select 1 from public.infrastructure_clusters where project_id=p_project_id and id=p_id);
   when 'COUNTRY' then return exists(select 1 from public.investigation_countries where project_id=p_project_id and id=p_id);
   when 'SOURCE' then return exists(select 1 from public.sources where project_id=p_project_id and id=p_id);
   when 'SOURCE_ASSET' then return exists(select 1 from public.source_assets where project_id=p_project_id and id=p_id);
   when 'SOURCE_NOTE' then return exists(select 1 from public.source_notes where project_id=p_project_id and id=p_id);
   when 'ANNOTATION' then return exists(select 1 from public.source_annotations where project_id=p_project_id and id=p_id);
   when 'SOURCE_CLAIM' then return exists(select 1 from public.source_claims where project_id=p_project_id and id=p_id);
   when 'ATTRIBUTION_CLAIM' then return exists(select 1 from public.source_attribution_claims where project_id=p_project_id and id=p_id);
   when 'RESEARCH_NOTE' then return exists(select 1 from public.research_notes where project_id=p_project_id and id=p_id);
   when 'TIMELINE_EVENT' then return exists(select 1 from public.timeline_events where project_id=p_project_id and id=p_id);
   when 'COUNTRY_NOTE' then return exists(select 1 from public.investigation_country_notes where project_id=p_project_id and id=p_id);
   else return false;
  end case;
end $$;
revoke all on function public.graph_entity_exists(uuid,public.graph_entity_type,uuid) from public,anon,authenticated;
-- A record's deletion must remove its graph edges and saved positions.
create trigger fusion_graph_cleanup_investigation_countries before delete on public.investigation_countries for each row execute function public.cleanup_entity_relationships('COUNTRY');
create trigger fusion_graph_positions_investigation_countries before delete on public.investigation_countries for each row execute function public.cleanup_graph_node_positions('COUNTRY');
create trigger fusion_graph_cleanup_sources before delete on public.sources for each row execute function public.cleanup_entity_relationships('SOURCE');
create trigger fusion_graph_positions_sources before delete on public.sources for each row execute function public.cleanup_graph_node_positions('SOURCE');
create trigger fusion_graph_cleanup_source_assets before delete on public.source_assets for each row execute function public.cleanup_entity_relationships('SOURCE_ASSET');
create trigger fusion_graph_positions_source_assets before delete on public.source_assets for each row execute function public.cleanup_graph_node_positions('SOURCE_ASSET');
create trigger fusion_graph_cleanup_source_notes before delete on public.source_notes for each row execute function public.cleanup_entity_relationships('SOURCE_NOTE');
create trigger fusion_graph_positions_source_notes before delete on public.source_notes for each row execute function public.cleanup_graph_node_positions('SOURCE_NOTE');
create trigger fusion_graph_cleanup_source_annotations before delete on public.source_annotations for each row execute function public.cleanup_entity_relationships('ANNOTATION');
create trigger fusion_graph_positions_source_annotations before delete on public.source_annotations for each row execute function public.cleanup_graph_node_positions('ANNOTATION');
create trigger fusion_graph_cleanup_source_claims before delete on public.source_claims for each row execute function public.cleanup_entity_relationships('SOURCE_CLAIM');
create trigger fusion_graph_positions_source_claims before delete on public.source_claims for each row execute function public.cleanup_graph_node_positions('SOURCE_CLAIM');
create trigger fusion_graph_cleanup_source_attribution_claims before delete on public.source_attribution_claims for each row execute function public.cleanup_entity_relationships('ATTRIBUTION_CLAIM');
create trigger fusion_graph_positions_source_attribution_claims before delete on public.source_attribution_claims for each row execute function public.cleanup_graph_node_positions('ATTRIBUTION_CLAIM');
create trigger fusion_graph_cleanup_research_notes before delete on public.research_notes for each row execute function public.cleanup_entity_relationships('RESEARCH_NOTE');
create trigger fusion_graph_positions_research_notes before delete on public.research_notes for each row execute function public.cleanup_graph_node_positions('RESEARCH_NOTE');
create trigger fusion_graph_cleanup_timeline_events before delete on public.timeline_events for each row execute function public.cleanup_entity_relationships('TIMELINE_EVENT');
create trigger fusion_graph_positions_timeline_events before delete on public.timeline_events for each row execute function public.cleanup_graph_node_positions('TIMELINE_EVENT');
create trigger fusion_graph_cleanup_investigation_country_notes before delete on public.investigation_country_notes for each row execute function public.cleanup_entity_relationships('COUNTRY_NOTE');
create trigger fusion_graph_positions_investigation_country_notes before delete on public.investigation_country_notes for each row execute function public.cleanup_graph_node_positions('COUNTRY_NOTE');
