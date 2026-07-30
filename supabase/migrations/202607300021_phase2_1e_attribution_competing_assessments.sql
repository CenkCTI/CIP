-- Phase 2.1E: analyst-controlled attribution and competing assessments.
do $$ begin create type public.attribution_assessment_status as enum ('DRAFT','ASSESSED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.attribution_conclusion_type as enum ('UNRESOLVED','PREFERRED_HYPOTHESIS','MULTIPLE_PLAUSIBLE','INSUFFICIENT_EVIDENCE','ATTRIBUTION_WITHHELD'); exception when duplicate_object then null; end $$;
do $$ begin create type public.attribution_subject_kind as enum ('EXISTING_THREAT_ACTOR','ACTOR_CLASS','UNKNOWN_ACTOR','NON_ATTRIBUTION_ALTERNATIVE'); exception when duplicate_object then null; end $$;
do $$ begin create type public.attribution_hypothesis_status as enum ('DRAFT','ACTIVE','DISFAVORED','REJECTED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.attribution_evidence_impact as enum ('SUPPORTS','CONTRADICTS','NEUTRAL'); exception when duplicate_object then null; end $$;
do $$ begin create type public.attribution_diagnostic_value as enum ('LOW','MEDIUM','HIGH'); exception when duplicate_object then null; end $$;

create table public.attribution_hypotheses (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, campaign_id uuid not null,
 title text not null check(char_length(trim(title)) between 1 and 180), subject_kind public.attribution_subject_kind not null,
 threat_actor_id uuid, subject_label text not null default '' check(char_length(subject_label)<=180),
 proposition text not null check(char_length(trim(proposition)) between 1 and 10000), status public.attribution_hypothesis_status not null default 'DRAFT',
 confidence public.confidence_level not null default 'MEDIUM', analytic_rationale text not null default '' check(char_length(analytic_rationale)<=20000),
 key_assumptions text not null default '' check(char_length(key_assumptions)<=20000), known_weaknesses text not null default '' check(char_length(known_weaknesses)<=20000),
 information_gaps text not null default '' check(char_length(information_gaps)<=20000), status_rationale text not null default '' check(char_length(status_rationale)<=10000),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
 unique(project_id,id), unique(project_id,campaign_id,id),
 foreign key(project_id,campaign_id) references public.campaigns(project_id,id) on delete cascade,
 foreign key(project_id,threat_actor_id) references public.threat_actors(project_id,id) on delete restrict,
 check((subject_kind='EXISTING_THREAT_ACTOR' and threat_actor_id is not null) or (subject_kind<>'EXISTING_THREAT_ACTOR' and threat_actor_id is null and char_length(trim(subject_label))>0)),
 check(status<>'ACTIVE' or char_length(trim(analytic_rationale))>0),
 check(status not in ('DISFAVORED','REJECTED') or char_length(trim(status_rationale))>0)
);

create table public.campaign_attribution_assessments (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, campaign_id uuid not null,
 assessment_status public.attribution_assessment_status not null default 'DRAFT', conclusion_type public.attribution_conclusion_type not null default 'UNRESOLVED',
 confidence public.confidence_level not null default 'MEDIUM', preferred_hypothesis_id uuid,
 current_judgment text not null default '' check(char_length(current_judgment)<=20000), alternative_explanations text not null default '' check(char_length(alternative_explanations)<=20000),
 key_uncertainties text not null default '' check(char_length(key_uncertainties)<=20000), discriminating_information_needed text not null default '' check(char_length(discriminating_information_needed)<=20000),
 assessed_at timestamptz, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(project_id,id), unique(campaign_id), foreign key(project_id,campaign_id) references public.campaigns(project_id,id) on delete cascade,
 foreign key(project_id,campaign_id,preferred_hypothesis_id) references public.attribution_hypotheses(project_id,campaign_id,id) on delete restrict,
 check((assessment_status='DRAFT') or (char_length(trim(current_judgment))>0 and assessed_at is not null)),
 check((conclusion_type='PREFERRED_HYPOTHESIS')=(preferred_hypothesis_id is not null))
);

create table public.attribution_evidence_items (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, campaign_id uuid not null,
 title text not null check(char_length(trim(title)) between 1 and 180), relevance_note text not null check(char_length(trim(relevance_note)) between 1 and 10000),
 source_id uuid, evidence_id uuid, timeline_event_id uuid, infrastructure_cluster_id uuid, indicator_id uuid, enrichment_result_id uuid, malware_id uuid, mitre_technique_id uuid,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
 unique(project_id,id), unique(project_id,campaign_id,id), foreign key(project_id,campaign_id) references public.campaigns(project_id,id) on delete cascade,
 foreign key(project_id,source_id) references public.sources(project_id,id) on delete restrict, foreign key(project_id,evidence_id) references public.evidence(project_id,id) on delete restrict,
 foreign key(project_id,timeline_event_id) references public.timeline_events(project_id,id) on delete restrict, foreign key(project_id,infrastructure_cluster_id) references public.infrastructure_clusters(project_id,id) on delete restrict,
 foreign key(project_id,indicator_id) references public.indicators(project_id,id) on delete restrict, foreign key(project_id,enrichment_result_id) references public.enrichment_results(project_id,id) on delete restrict,
 foreign key(project_id,malware_id) references public.malware(project_id,id) on delete restrict, foreign key(project_id,mitre_technique_id) references public.mitre_techniques(project_id,id) on delete restrict,
 check(num_nonnulls(source_id,evidence_id,timeline_event_id,infrastructure_cluster_id,indicator_id,enrichment_result_id,malware_id,mitre_technique_id)=1)
);
create unique index attribution_evidence_source_unique on public.attribution_evidence_items(campaign_id,source_id) where source_id is not null;
create unique index attribution_evidence_evidence_unique on public.attribution_evidence_items(campaign_id,evidence_id) where evidence_id is not null;
create unique index attribution_evidence_timeline_unique on public.attribution_evidence_items(campaign_id,timeline_event_id) where timeline_event_id is not null;
create unique index attribution_evidence_cluster_unique on public.attribution_evidence_items(campaign_id,infrastructure_cluster_id) where infrastructure_cluster_id is not null;
create unique index attribution_evidence_indicator_unique on public.attribution_evidence_items(campaign_id,indicator_id) where indicator_id is not null;
create unique index attribution_evidence_enrichment_unique on public.attribution_evidence_items(campaign_id,enrichment_result_id) where enrichment_result_id is not null;
create unique index attribution_evidence_malware_unique on public.attribution_evidence_items(campaign_id,malware_id) where malware_id is not null;
create unique index attribution_evidence_mitre_unique on public.attribution_evidence_items(campaign_id,mitre_technique_id) where mitre_technique_id is not null;

create table public.attribution_evidence_evaluations (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, campaign_id uuid not null, hypothesis_id uuid not null, evidence_item_id uuid not null,
 impact public.attribution_evidence_impact not null, diagnostic_value public.attribution_diagnostic_value not null,
 rationale text not null check(char_length(trim(rationale)) between 1 and 10000), created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(project_id,id), unique(hypothesis_id,evidence_item_id),
 foreign key(project_id,campaign_id) references public.campaigns(project_id,id) on delete cascade,
 foreign key(project_id,campaign_id,hypothesis_id) references public.attribution_hypotheses(project_id,campaign_id,id) on delete cascade,
 foreign key(project_id,campaign_id,evidence_item_id) references public.attribution_evidence_items(project_id,campaign_id,id) on delete cascade
);

create function public.protect_preferred_attribution_hypothesis() returns trigger language plpgsql set search_path=public as $$
begin
 if (new.archived_at is not null or new.status='REJECTED') and exists(select 1 from public.campaign_attribution_assessments a where a.preferred_hypothesis_id=new.id) then
  raise exception using errcode='23503', message='preferred_hypothesis_is_active';
 end if; return new;
end $$;
create trigger attribution_hypothesis_protect_preferred before update on public.attribution_hypotheses for each row execute function public.protect_preferred_attribution_hypothesis();
create function public.validate_preferred_attribution_hypothesis() returns trigger language plpgsql set search_path=public as $$
begin
 if new.preferred_hypothesis_id is not null and not exists(select 1 from public.attribution_hypotheses h where h.id=new.preferred_hypothesis_id and h.project_id=new.project_id and h.campaign_id=new.campaign_id and h.archived_at is null and h.status<>'REJECTED') then
  raise exception using errcode='23514', message='preferred_hypothesis_must_be_current';
 end if; return new;
end $$;
create trigger attribution_assessment_validate_preferred before insert or update on public.campaign_attribution_assessments for each row execute function public.validate_preferred_attribution_hypothesis();

create index attribution_hypotheses_campaign_idx on public.attribution_hypotheses(project_id,campaign_id,status,archived_at);
create index attribution_evidence_campaign_idx on public.attribution_evidence_items(project_id,campaign_id,archived_at);
create index attribution_evaluations_campaign_idx on public.attribution_evidence_evaluations(project_id,campaign_id,hypothesis_id);
create trigger attribution_hypotheses_set_updated_at before update on public.attribution_hypotheses for each row execute function public.set_updated_at();
create trigger campaign_attribution_assessments_set_updated_at before update on public.campaign_attribution_assessments for each row execute function public.set_updated_at();
create trigger attribution_evidence_items_set_updated_at before update on public.attribution_evidence_items for each row execute function public.set_updated_at();
create trigger attribution_evidence_evaluations_set_updated_at before update on public.attribution_evidence_evaluations for each row execute function public.set_updated_at();

alter table public.attribution_hypotheses enable row level security; alter table public.campaign_attribution_assessments enable row level security;
alter table public.attribution_evidence_items enable row level security; alter table public.attribution_evidence_evaluations enable row level security;
do $$ declare t text; begin foreach t in array array['attribution_hypotheses','campaign_attribution_assessments','attribution_evidence_items','attribution_evidence_evaluations'] loop
 execute format('create policy %I on public.%I for select to authenticated using (public.project_is_owned(project_id))',t||'_select_owned',t);
 execute format('create policy %I on public.%I for insert to authenticated with check (public.project_is_owned(project_id) and created_by=auth.uid())',t||'_insert_owned',t);
 execute format('create policy %I on public.%I for update to authenticated using (public.project_is_owned(project_id)) with check (public.project_is_owned(project_id) and created_by=auth.uid())',t||'_update_owned',t);
 end loop; end $$;
create policy attribution_assessments_delete_owned on public.campaign_attribution_assessments for delete to authenticated using(public.project_is_owned(project_id));
create policy attribution_evaluations_delete_owned on public.attribution_evidence_evaluations for delete to authenticated using(public.project_is_owned(project_id));
