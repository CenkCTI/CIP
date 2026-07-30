-- CİTEM Phase 2.1C — analyst-controlled Infrastructure Analysis.
do $$ begin create type public.infrastructure_cluster_status as enum ('DRAFT','ASSESSED','INACTIVE','ARCHIVED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.infrastructure_member_status as enum ('POSSIBLE','CONFIRMED','REJECTED','REMOVED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.infrastructure_indicator_role as enum ('PHISHING','CREDENTIAL_HARVESTING','REDIRECTOR','PAYLOAD_DELIVERY','COMMAND_AND_CONTROL','STAGING','EXFILTRATION','MALWARE_HOSTING','SCANNING','INFRASTRUCTURE_SUPPORT','UNKNOWN'); exception when duplicate_object then null; end $$;

create table public.infrastructure_clusters (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 name text not null check (char_length(trim(name)) between 1 and 160), description text not null default '' check (char_length(description)<=10000),
 status public.infrastructure_cluster_status not null default 'DRAFT', confidence public.confidence_level not null default 'MEDIUM',
 technical_purpose text not null default '' check (char_length(technical_purpose)<=10000), current_assessment text not null default '' check (char_length(current_assessment)<=20000), operational_relevance text not null default '' check (char_length(operational_relevance)<=20000),
 first_observed_at timestamptz, last_observed_at timestamptz, created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
 unique(project_id,id), check(first_observed_at is null or last_observed_at is null or first_observed_at<=last_observed_at),
 constraint infrastructure_clusters_archive_consistency check ((status='ARCHIVED')=(archived_at is not null)),
 constraint infrastructure_clusters_assessed_content check (status<>'ASSESSED' or char_length(trim(current_assessment))>0)
);
create table public.infrastructure_cluster_members (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, cluster_id uuid not null, indicator_id uuid not null,
 status public.infrastructure_member_status not null default 'POSSIBLE', role public.infrastructure_indicator_role not null default 'UNKNOWN', confidence public.confidence_level not null default 'MEDIUM',
 rationale text not null check (char_length(trim(rationale)) between 1 and 10000), first_observed_at timestamptz, last_observed_at timestamptz,
 created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(project_id,id), unique(project_id,cluster_id,id), unique(cluster_id,indicator_id),
 foreign key(project_id,cluster_id) references public.infrastructure_clusters(project_id,id) on delete cascade,
 foreign key(project_id,indicator_id) references public.indicators(project_id,id) on delete restrict,
 check(first_observed_at is null or last_observed_at is null or first_observed_at<=last_observed_at)
);
create table public.infrastructure_cluster_support (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, cluster_id uuid not null, cluster_member_id uuid,
 source_id uuid, evidence_id uuid, enrichment_result_id uuid, note text not null default '' check(char_length(note)<=5000),
 created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(),
 unique(project_id,id),
 foreign key(project_id,cluster_id) references public.infrastructure_clusters(project_id,id) on delete cascade,
 foreign key(project_id,cluster_id,cluster_member_id) references public.infrastructure_cluster_members(project_id,cluster_id,id) on delete cascade,
 foreign key(project_id,source_id) references public.sources(project_id,id) on delete restrict,
 foreign key(project_id,evidence_id) references public.evidence(project_id,id) on delete restrict,
 foreign key(project_id,enrichment_result_id) references public.enrichment_results(project_id,id) on delete restrict,
 constraint infrastructure_support_exactly_one check(num_nonnulls(source_id,evidence_id,enrichment_result_id)=1)
);
create index infrastructure_clusters_project_view_idx on public.infrastructure_clusters(project_id,archived_at,status,updated_at desc);
create index infrastructure_members_cluster_status_idx on public.infrastructure_cluster_members(project_id,cluster_id,status);
create index infrastructure_members_indicator_idx on public.infrastructure_cluster_members(project_id,indicator_id);
create index infrastructure_support_cluster_idx on public.infrastructure_cluster_support(project_id,cluster_id,cluster_member_id);
create index infrastructure_support_source_idx on public.infrastructure_cluster_support(project_id,source_id) where source_id is not null;
create index infrastructure_support_evidence_idx on public.infrastructure_cluster_support(project_id,evidence_id) where evidence_id is not null;
create index infrastructure_support_result_idx on public.infrastructure_cluster_support(project_id,enrichment_result_id) where enrichment_result_id is not null;
create trigger infrastructure_clusters_set_updated_at before update on public.infrastructure_clusters for each row execute function public.set_updated_at();
create trigger infrastructure_members_set_updated_at before update on public.infrastructure_cluster_members for each row execute function public.set_updated_at();

alter table public.infrastructure_clusters enable row level security; alter table public.infrastructure_cluster_members enable row level security; alter table public.infrastructure_cluster_support enable row level security;
do $$ declare t text; begin foreach t in array array['infrastructure_clusters','infrastructure_cluster_members','infrastructure_cluster_support'] loop
 execute format('create policy %I on public.%I for select to authenticated using (public.project_is_owned(project_id))',t||'_select',t);
 execute format('create policy %I on public.%I for insert to authenticated with check (public.project_is_owned(project_id) and created_by=auth.uid())',t||'_insert',t);
 execute format('create policy %I on public.%I for update to authenticated using (public.project_is_owned(project_id)) with check (public.project_is_owned(project_id) and created_by=auth.uid())',t||'_update',t);
end loop; end $$;
-- Meaningful analysis is preserved: no authenticated DELETE policy for clusters or memberships.
create policy infrastructure_cluster_support_delete on public.infrastructure_cluster_support for delete to authenticated using (public.project_is_owned(project_id));

-- Clusters participate in the existing graph without a parallel relationship table.
alter type public.graph_entity_type add value if not exists 'INFRASTRUCTURE_CLUSTER';
create or replace function public.graph_entity_exists(p_project_id uuid,p_type public.graph_entity_type,p_id uuid) returns boolean language plpgsql stable security definer set search_path='' as $$ begin
 if p_type='INFRASTRUCTURE_CLUSTER' then return exists(select 1 from public.infrastructure_clusters where project_id=p_project_id and id=p_id);
 elsif p_type='ACTOR' then return exists(select 1 from public.threat_actors where project_id=p_project_id and id=p_id); elsif p_type='CAMPAIGN' then return exists(select 1 from public.campaigns where project_id=p_project_id and id=p_id); elsif p_type='INDICATOR' then return exists(select 1 from public.indicators where project_id=p_project_id and id=p_id); elsif p_type='MALWARE' then return exists(select 1 from public.malware where project_id=p_project_id and id=p_id); elsif p_type='CVE' then return exists(select 1 from public.cves where project_id=p_project_id and id=p_id); elsif p_type='MITRE' then return exists(select 1 from public.mitre_techniques where project_id=p_project_id and id=p_id); elsif p_type='EVIDENCE' then return exists(select 1 from public.evidence where project_id=p_project_id and id=p_id); elsif p_type='REPORT' then return exists(select 1 from public.reports where project_id=p_project_id and id=p_id); end if; return false; end $$;
create trigger cleanup_infrastructure_cluster_graph_positions before delete on public.infrastructure_clusters for each row execute function public.cleanup_graph_node_positions('INFRASTRUCTURE_CLUSTER');
