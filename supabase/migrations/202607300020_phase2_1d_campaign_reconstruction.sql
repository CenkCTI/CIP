-- CİTEM Phase 2.1D — analyst-controlled attack timeline and Campaign reconstruction.
do $$ begin create type public.timeline_event_basis as enum ('OBSERVED','INFERRED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.attack_activity_phase as enum ('INFRASTRUCTURE_PREPARATION','TARGETING','DELIVERY','INITIAL_ACCESS','EXECUTION','PERSISTENCE','COMMAND_AND_CONTROL','COLLECTION','EXFILTRATION','IMPACT','INFRASTRUCTURE_CHANGE','OTHER','UNKNOWN'); exception when duplicate_object then null; end $$;
do $$ begin create type public.timeline_assessment_status as enum ('RECORDED','ASSESSED','DISPUTED','RETRACTED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.reconstruction_status as enum ('DRAFT','ASSESSED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.campaign_activity_status as enum ('UNKNOWN','ACTIVE','DORMANT','CONCLUDED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.campaign_membership_status as enum ('POSSIBLE','CONFIRMED','REJECTED','REMOVED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.timeline_entity_role as enum ('SUBJECT','INFRASTRUCTURE','PAYLOAD','TECHNIQUE','VULNERABILITY','SUPPORTING_ARTIFACT','OTHER'); exception when duplicate_object then null; end $$;

alter table public.timeline_events
 add column basis public.timeline_event_basis not null default 'OBSERVED',
 add column activity_phase public.attack_activity_phase not null default 'UNKNOWN',
 add column assessment_status public.timeline_assessment_status not null default 'RECORDED',
 add column confidence public.confidence_level not null default 'MEDIUM',
 add column analyst_rationale text not null default '',
 add column occurred_end_at timestamptz,
 add constraint timeline_events_rationale_length check(char_length(analyst_rationale)<=10000),
 add constraint timeline_events_range check(occurred_end_at is null or event_date<=occurred_end_at),
 add constraint timeline_events_required_rationale check((basis<>'INFERRED' and assessment_status not in ('DISPUTED','RETRACTED')) or char_length(trim(analyst_rationale))>0);

create table public.campaign_reconstructions (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, campaign_id uuid not null,
 reconstruction_status public.reconstruction_status not null default 'DRAFT', activity_status public.campaign_activity_status not null default 'UNKNOWN', confidence public.confidence_level not null default 'MEDIUM',
 operational_objective text not null default '', current_assessment text not null default '', next_expected_activity text not null default '', key_uncertainties text not null default '',
 first_observed_at timestamptz, last_observed_at timestamptz, assessed_at timestamptz,
 created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(project_id,id), unique(campaign_id), foreign key(project_id,campaign_id) references public.campaigns(project_id,id) on delete cascade,
 check(char_length(operational_objective)<=10000 and char_length(current_assessment)<=20000 and char_length(next_expected_activity)<=10000 and char_length(key_uncertainties)<=20000),
 check(first_observed_at is null or last_observed_at is null or first_observed_at<=last_observed_at),
 check(reconstruction_status<>'ASSESSED' or (char_length(trim(current_assessment))>0 and assessed_at is not null))
);
create table public.campaign_timeline_events (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, campaign_id uuid not null, timeline_event_id uuid not null,
 status public.campaign_membership_status not null default 'POSSIBLE', confidence public.confidence_level not null default 'MEDIUM', rationale text not null, sequence_order integer,
 created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(project_id,id), unique(campaign_id,timeline_event_id),
 foreign key(project_id,campaign_id) references public.campaigns(project_id,id) on delete cascade,
 foreign key(project_id,timeline_event_id) references public.timeline_events(project_id,id) on delete restrict,
 check(char_length(trim(rationale)) between 1 and 10000), check(sequence_order is null or sequence_order>=0)
);
create table public.campaign_infrastructure_clusters (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, campaign_id uuid not null, infrastructure_cluster_id uuid not null,
 status public.campaign_membership_status not null default 'POSSIBLE', confidence public.confidence_level not null default 'MEDIUM', rationale text not null,
 first_observed_at timestamptz, last_observed_at timestamptz, created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(project_id,id), unique(campaign_id,infrastructure_cluster_id),
 foreign key(project_id,campaign_id) references public.campaigns(project_id,id) on delete cascade,
 foreign key(project_id,infrastructure_cluster_id) references public.infrastructure_clusters(project_id,id) on delete restrict,
 check(char_length(trim(rationale)) between 1 and 10000), check(first_observed_at is null or last_observed_at is null or first_observed_at<=last_observed_at)
);
create table public.timeline_event_entities (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, timeline_event_id uuid not null,
 indicator_id uuid, infrastructure_cluster_id uuid, malware_id uuid, cve_id uuid, mitre_technique_id uuid,
 role public.timeline_entity_role not null, analyst_note text not null default '', created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), unique(project_id,id),
 foreign key(project_id,timeline_event_id) references public.timeline_events(project_id,id) on delete restrict,
 foreign key(project_id,indicator_id) references public.indicators(project_id,id) on delete restrict,
 foreign key(project_id,infrastructure_cluster_id) references public.infrastructure_clusters(project_id,id) on delete restrict,
 foreign key(project_id,malware_id) references public.malware(project_id,id) on delete restrict,
 foreign key(project_id,cve_id) references public.cves(project_id,id) on delete restrict,
 foreign key(project_id,mitre_technique_id) references public.mitre_techniques(project_id,id) on delete restrict,
 check(num_nonnulls(indicator_id,infrastructure_cluster_id,malware_id,cve_id,mitre_technique_id)=1), check(char_length(analyst_note)<=5000)
);
create unique index timeline_entity_indicator_unique on public.timeline_event_entities(timeline_event_id,indicator_id) where indicator_id is not null;
create unique index timeline_entity_cluster_unique on public.timeline_event_entities(timeline_event_id,infrastructure_cluster_id) where infrastructure_cluster_id is not null;
create unique index timeline_entity_malware_unique on public.timeline_event_entities(timeline_event_id,malware_id) where malware_id is not null;
create unique index timeline_entity_cve_unique on public.timeline_event_entities(timeline_event_id,cve_id) where cve_id is not null;
create unique index timeline_entity_mitre_unique on public.timeline_event_entities(timeline_event_id,mitre_technique_id) where mitre_technique_id is not null;
create table public.timeline_event_support (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, timeline_event_id uuid not null, source_id uuid, evidence_id uuid, enrichment_result_id uuid,
 analyst_note text not null default '', created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), unique(project_id,id),
 foreign key(project_id,timeline_event_id) references public.timeline_events(project_id,id) on delete restrict,
 foreign key(project_id,source_id) references public.sources(project_id,id) on delete restrict,
 foreign key(project_id,evidence_id) references public.evidence(project_id,id) on delete restrict,
 foreign key(project_id,enrichment_result_id) references public.enrichment_results(project_id,id) on delete restrict,
 check(num_nonnulls(source_id,evidence_id,enrichment_result_id)=1), check(char_length(analyst_note)<=5000)
);
create unique index timeline_support_source_unique on public.timeline_event_support(timeline_event_id,source_id) where source_id is not null;
create unique index timeline_support_evidence_unique on public.timeline_event_support(timeline_event_id,evidence_id) where evidence_id is not null;
create unique index timeline_support_enrichment_unique on public.timeline_event_support(timeline_event_id,enrichment_result_id) where enrichment_result_id is not null;

create index timeline_events_reconstruction_idx on public.timeline_events(project_id,event_date,basis,activity_phase,assessment_status);
create index campaign_timeline_events_campaign_idx on public.campaign_timeline_events(project_id,campaign_id,status,timeline_event_id);
create index campaign_timeline_events_event_idx on public.campaign_timeline_events(project_id,timeline_event_id);
create index campaign_clusters_campaign_idx on public.campaign_infrastructure_clusters(project_id,campaign_id,status);
create index timeline_entities_event_idx on public.timeline_event_entities(project_id,timeline_event_id);
create index timeline_support_event_idx on public.timeline_event_support(project_id,timeline_event_id);
create trigger campaign_reconstructions_set_updated_at before update on public.campaign_reconstructions for each row execute function public.set_updated_at();
create trigger campaign_timeline_events_set_updated_at before update on public.campaign_timeline_events for each row execute function public.set_updated_at();
create trigger campaign_infrastructure_clusters_set_updated_at before update on public.campaign_infrastructure_clusters for each row execute function public.set_updated_at();

alter table public.campaign_reconstructions enable row level security;
alter table public.campaign_timeline_events enable row level security;
alter table public.campaign_infrastructure_clusters enable row level security;
alter table public.timeline_event_entities enable row level security;
alter table public.timeline_event_support enable row level security;
do $$ declare t text; begin foreach t in array array['campaign_reconstructions','campaign_timeline_events','campaign_infrastructure_clusters','timeline_event_entities','timeline_event_support'] loop
 execute format('create policy %I on public.%I for select to authenticated using (public.project_is_owned(project_id))',t||'_select_owned',t);
 execute format('create policy %I on public.%I for insert to authenticated with check (public.project_is_owned(project_id) and created_by=auth.uid())',t||'_insert_owned',t);
 execute format('create policy %I on public.%I for update to authenticated using (public.project_is_owned(project_id)) with check (public.project_is_owned(project_id) and created_by=auth.uid())',t||'_update_owned',t);
end loop; end $$;
-- Assessments and memberships are historical records; only explicit support/entity links can be unlinked.
create policy timeline_event_entities_delete_owned on public.timeline_event_entities for delete to authenticated using(public.project_is_owned(project_id));
create policy timeline_event_support_delete_owned on public.timeline_event_support for delete to authenticated using(public.project_is_owned(project_id));
-- Historical Campaign-event analysis can only be deliberately unlinked after it
-- has first been assessed REJECTED or REMOVED. Active analysis never cascades.
create policy campaign_timeline_events_delete_historical_owned
 on public.campaign_timeline_events for delete to authenticated
 using(public.project_is_owned(project_id) and status in ('REJECTED','REMOVED'));
create or replace function public.prevent_active_campaign_timeline_event_delete()
returns trigger language plpgsql set search_path='' as $$
begin
 if old.status in ('POSSIBLE','CONFIRMED') then
  raise exception using errcode='23503', message='active_campaign_membership';
 end if;
 return old;
end $$;
create trigger campaign_timeline_events_prevent_active_delete
 before delete on public.campaign_timeline_events for each row
 execute function public.prevent_active_campaign_timeline_event_delete();
