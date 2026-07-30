-- Phase 2.1F: controlled intelligence products and immutable assessments. Migration is intentionally additive to 001-021.
create type public.intelligence_product_type as enum ('TECHNICAL_NOTE','IOC_BRIEF','INFRASTRUCTURE_ASSESSMENT','CAMPAIGN_ASSESSMENT','ATTRIBUTION_ASSESSMENT','OPERATIONAL_INTELLIGENCE_REPORT','INCIDENT_UPDATE','OTHER');
create type public.report_lifecycle_status as enum ('DRAFT','IN_REVIEW','APPROVED','PUBLISHED','SUPERSEDED','ARCHIVED');
create type public.report_version_status as enum ('SAVED','PUBLISHED','SUPERSEDED');
create type public.report_reference_type as enum ('SOURCE','EVIDENCE','INDICATOR','ENRICHMENT_RESULT','INFRASTRUCTURE_CLUSTER','TIMELINE_EVENT','CAMPAIGN','THREAT_ACTOR','MALWARE','CVE','MITRE_TECHNIQUE','ATTRIBUTION_HYPOTHESIS','ATTRIBUTION_ASSESSMENT');

alter table public.reports add column product_type public.intelligence_product_type not null default 'OTHER', add column lifecycle_status public.report_lifecycle_status not null default 'DRAFT', add column current_version_number integer not null default 0 check(current_version_number>=0), add column authoritative_version_id uuid, add column reviewed_at timestamptz, add column approved_at timestamptz, add column published_at timestamptz, add column superseded_at timestamptz, add column archived_at timestamptz;

create table public.report_versions(
 id uuid primary key default gen_random_uuid(), project_id uuid not null, report_id uuid not null, version_number integer not null check(version_number>0), version_status public.report_version_status not null default 'SAVED',
 title_snapshot text not null check(char_length(trim(title_snapshot)) between 1 and 200), product_type_snapshot public.intelligence_product_type not null, content_snapshot jsonb not null check(jsonb_typeof(content_snapshot)='object' and content_snapshot->>'type'='doc' and content_snapshot#>>'{attrs,version}'='1'),
 executive_summary_snapshot text not null check(char_length(trim(executive_summary_snapshot)) between 1 and 20000), key_judgments_snapshot text not null check(char_length(trim(key_judgments_snapshot)) between 1 and 20000), confidence_snapshot text not null check(char_length(trim(confidence_snapshot)) between 1 and 100), intelligence_gaps_snapshot text not null check(char_length(trim(intelligence_gaps_snapshot)) between 1 and 20000), recommendations_snapshot text not null check(char_length(trim(recommendations_snapshot)) between 1 and 20000), change_summary text not null check(char_length(trim(change_summary)) between 1 and 2000),
 created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), published_at timestamptz, superseded_at timestamptz,
 unique(report_id,version_number), unique(project_id,report_id,id), foreign key(project_id,report_id) references public.reports(project_id,id) on delete restrict
);
alter table public.reports add constraint reports_authoritative_version_fk foreign key(project_id,id,authoritative_version_id) references public.report_versions(project_id,report_id,id) deferrable initially deferred;

create table public.report_references(
 id uuid primary key default gen_random_uuid(), project_id uuid not null, report_id uuid not null, reference_type public.report_reference_type not null, source_id uuid, evidence_id uuid, indicator_id uuid, enrichment_result_id uuid, infrastructure_cluster_id uuid, timeline_event_id uuid, campaign_id uuid, threat_actor_id uuid, malware_id uuid, cve_id uuid, mitre_technique_id uuid, attribution_hypothesis_id uuid, attribution_assessment_id uuid,
 label text not null default '' check(char_length(trim(label)) between 1 and 500), state_snapshot jsonb not null default '{}' check(jsonb_typeof(state_snapshot)='object' and pg_column_size(state_snapshot)<=4096), source_updated_at timestamptz not null, created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(),
 unique(project_id,report_id,id), foreign key(project_id,report_id) references public.reports(project_id,id) on delete cascade,
  foreign key(project_id,source_id) references public.sources(project_id,id) on delete restrict,
  foreign key(project_id,evidence_id) references public.evidence(project_id,id) on delete restrict,
  foreign key(project_id,indicator_id) references public.indicators(project_id,id) on delete restrict,
  foreign key(project_id,enrichment_result_id) references public.enrichment_results(project_id,id) on delete restrict,
  foreign key(project_id,infrastructure_cluster_id) references public.infrastructure_clusters(project_id,id) on delete restrict,
  foreign key(project_id,timeline_event_id) references public.timeline_events(project_id,id) on delete restrict,
  foreign key(project_id,campaign_id) references public.campaigns(project_id,id) on delete restrict,
  foreign key(project_id,threat_actor_id) references public.threat_actors(project_id,id) on delete restrict,
  foreign key(project_id,malware_id) references public.malware(project_id,id) on delete restrict,
  foreign key(project_id,cve_id) references public.cves(project_id,id) on delete restrict,
  foreign key(project_id,mitre_technique_id) references public.mitre_techniques(project_id,id) on delete restrict,
  foreign key(project_id,attribution_hypothesis_id) references public.attribution_hypotheses(project_id,id) on delete restrict,
  foreign key(project_id,attribution_assessment_id) references public.campaign_attribution_assessments(project_id,id) on delete restrict,
 constraint report_references_type_target_match check((reference_type='SOURCE' and source_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='EVIDENCE' and evidence_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='INDICATOR' and indicator_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='ENRICHMENT_RESULT' and enrichment_result_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='INFRASTRUCTURE_CLUSTER' and infrastructure_cluster_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='TIMELINE_EVENT' and timeline_event_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='CAMPAIGN' and campaign_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='THREAT_ACTOR' and threat_actor_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='MALWARE' and malware_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='CVE' and cve_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='MITRE_TECHNIQUE' and mitre_technique_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='ATTRIBUTION_HYPOTHESIS' and attribution_hypothesis_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='ATTRIBUTION_ASSESSMENT' and attribution_assessment_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1))
);
create table public.report_version_references(
 id uuid primary key default gen_random_uuid(), project_id uuid not null, report_id uuid not null, report_version_id uuid not null, reference_type public.report_reference_type not null, source_id uuid, evidence_id uuid, indicator_id uuid, enrichment_result_id uuid, infrastructure_cluster_id uuid, timeline_event_id uuid, campaign_id uuid, threat_actor_id uuid, malware_id uuid, cve_id uuid, mitre_technique_id uuid, attribution_hypothesis_id uuid, attribution_assessment_id uuid,
 label_snapshot text not null check(char_length(trim(label_snapshot)) between 1 and 500), state_snapshot jsonb not null check(jsonb_typeof(state_snapshot)='object' and pg_column_size(state_snapshot)<=4096), source_updated_at timestamptz not null, created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(),
 foreign key(project_id,report_id,report_version_id) references public.report_versions(project_id,report_id,id) on delete restrict,
 constraint report_version_references_type_target_match check((reference_type='SOURCE' and source_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='EVIDENCE' and evidence_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='INDICATOR' and indicator_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='ENRICHMENT_RESULT' and enrichment_result_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='INFRASTRUCTURE_CLUSTER' and infrastructure_cluster_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='TIMELINE_EVENT' and timeline_event_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='CAMPAIGN' and campaign_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='THREAT_ACTOR' and threat_actor_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='MALWARE' and malware_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='CVE' and cve_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='MITRE_TECHNIQUE' and mitre_technique_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='ATTRIBUTION_HYPOTHESIS' and attribution_hypothesis_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1) or
    (reference_type='ATTRIBUTION_ASSESSMENT' and attribution_assessment_id is not null and num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1))
);
create unique index report_references_source_unique on public.report_references(report_id,source_id) where source_id is not null;
create unique index report_version_references_source_unique on public.report_version_references(report_version_id,source_id) where source_id is not null;
create unique index report_references_evidence_unique on public.report_references(report_id,evidence_id) where evidence_id is not null;
create unique index report_version_references_evidence_unique on public.report_version_references(report_version_id,evidence_id) where evidence_id is not null;
create unique index report_references_indicator_unique on public.report_references(report_id,indicator_id) where indicator_id is not null;
create unique index report_version_references_indicator_unique on public.report_version_references(report_version_id,indicator_id) where indicator_id is not null;
create unique index report_references_enrichment_result_unique on public.report_references(report_id,enrichment_result_id) where enrichment_result_id is not null;
create unique index report_version_references_enrichment_result_unique on public.report_version_references(report_version_id,enrichment_result_id) where enrichment_result_id is not null;
create unique index report_references_infrastructure_cluster_unique on public.report_references(report_id,infrastructure_cluster_id) where infrastructure_cluster_id is not null;
create unique index report_version_references_infrastructure_cluster_unique on public.report_version_references(report_version_id,infrastructure_cluster_id) where infrastructure_cluster_id is not null;
create unique index report_references_timeline_event_unique on public.report_references(report_id,timeline_event_id) where timeline_event_id is not null;
create unique index report_version_references_timeline_event_unique on public.report_version_references(report_version_id,timeline_event_id) where timeline_event_id is not null;
create unique index report_references_campaign_unique on public.report_references(report_id,campaign_id) where campaign_id is not null;
create unique index report_version_references_campaign_unique on public.report_version_references(report_version_id,campaign_id) where campaign_id is not null;
create unique index report_references_threat_actor_unique on public.report_references(report_id,threat_actor_id) where threat_actor_id is not null;
create unique index report_version_references_threat_actor_unique on public.report_version_references(report_version_id,threat_actor_id) where threat_actor_id is not null;
create unique index report_references_malware_unique on public.report_references(report_id,malware_id) where malware_id is not null;
create unique index report_version_references_malware_unique on public.report_version_references(report_version_id,malware_id) where malware_id is not null;
create unique index report_references_cve_unique on public.report_references(report_id,cve_id) where cve_id is not null;
create unique index report_version_references_cve_unique on public.report_version_references(report_version_id,cve_id) where cve_id is not null;
create unique index report_references_mitre_technique_unique on public.report_references(report_id,mitre_technique_id) where mitre_technique_id is not null;
create unique index report_version_references_mitre_technique_unique on public.report_version_references(report_version_id,mitre_technique_id) where mitre_technique_id is not null;
create unique index report_references_attribution_hypothesis_unique on public.report_references(report_id,attribution_hypothesis_id) where attribution_hypothesis_id is not null;
create unique index report_version_references_attribution_hypothesis_unique on public.report_version_references(report_version_id,attribution_hypothesis_id) where attribution_hypothesis_id is not null;
create unique index report_references_attribution_assessment_unique on public.report_references(report_id,attribution_assessment_id) where attribution_assessment_id is not null;
create unique index report_version_references_attribution_assessment_unique on public.report_version_references(report_version_id,attribution_assessment_id) where attribution_assessment_id is not null;

create function public.resolve_report_reference() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.created_by<>auth.uid() or not exists(select 1 from public.projects p where p.id=new.project_id and p.owner_id=auth.uid()) then raise exception 'not_authorized' using errcode='42501'; end if;
 case new.reference_type
  when 'SOURCE' then select left((title)::text,500), jsonb_build_object('source_type',t.source_type,'reliability',t.reliability,'verification_state',t.verification_state,'archived_at',t.archived_at), updated_at into new.label,new.state_snapshot,new.source_updated_at from public.sources t where t.project_id=new.project_id and t.id=new.source_id;
  when 'EVIDENCE' then select left((title)::text,500), jsonb_build_object('type',t.type), updated_at into new.label,new.state_snapshot,new.source_updated_at from public.evidence t where t.project_id=new.project_id and t.id=new.evidence_id;
  when 'INDICATOR' then select left((value)::text,500), jsonb_build_object('type',t.type,'confidence',t.confidence), updated_at into new.label,new.state_snapshot,new.source_updated_at from public.indicators t where t.project_id=new.project_id and t.id=new.indicator_id;
  when 'ENRICHMENT_RESULT' then select left(('Enrichment '||t.category::text)::text,500), jsonb_build_object('category',t.category,'confidence',t.confidence,'expires_at',t.expires_at), created_at into new.label,new.state_snapshot,new.source_updated_at from public.enrichment_results t where t.project_id=new.project_id and t.id=new.enrichment_result_id;
  when 'INFRASTRUCTURE_CLUSTER' then select left((name)::text,500), jsonb_build_object('status',t.status,'confidence',t.confidence,'archived_at',t.archived_at), updated_at into new.label,new.state_snapshot,new.source_updated_at from public.infrastructure_clusters t where t.project_id=new.project_id and t.id=new.infrastructure_cluster_id;
  when 'TIMELINE_EVENT' then select left((event_name)::text,500), jsonb_build_object('assessment_status',t.assessment_status,'confidence',t.confidence), updated_at into new.label,new.state_snapshot,new.source_updated_at from public.timeline_events t where t.project_id=new.project_id and t.id=new.timeline_event_id;
  when 'CAMPAIGN' then select left((name)::text,500), jsonb_build_object('start_date',t.start_date,'end_date',t.end_date), updated_at into new.label,new.state_snapshot,new.source_updated_at from public.campaigns t where t.project_id=new.project_id and t.id=new.campaign_id;
  when 'THREAT_ACTOR' then select left((name)::text,500), jsonb_build_object('country',t.country), updated_at into new.label,new.state_snapshot,new.source_updated_at from public.threat_actors t where t.project_id=new.project_id and t.id=new.threat_actor_id;
  when 'MALWARE' then select left((name)::text,500), jsonb_build_object('family',t.family), updated_at into new.label,new.state_snapshot,new.source_updated_at from public.malware t where t.project_id=new.project_id and t.id=new.malware_id;
  when 'CVE' then select left((cve_id)::text,500), jsonb_build_object('severity',t.severity,'exploit_status',t.exploit_status), updated_at into new.label,new.state_snapshot,new.source_updated_at from public.cves t where t.project_id=new.project_id and t.id=new.cve_id;
  when 'MITRE_TECHNIQUE' then select left((t.technique_id||' — '||t.technique_name)::text,500), jsonb_build_object('tactic',t.tactic), updated_at into new.label,new.state_snapshot,new.source_updated_at from public.mitre_techniques t where t.project_id=new.project_id and t.id=new.mitre_technique_id;
  when 'ATTRIBUTION_HYPOTHESIS' then select left((title)::text,500), jsonb_build_object('status',t.status,'confidence',t.confidence,'archived_at',t.archived_at), updated_at into new.label,new.state_snapshot,new.source_updated_at from public.attribution_hypotheses t where t.project_id=new.project_id and t.id=new.attribution_hypothesis_id;
  when 'ATTRIBUTION_ASSESSMENT' then select left(('Campaign attribution assessment')::text,500), jsonb_build_object('assessment_status',t.assessment_status,'conclusion_type',t.conclusion_type,'confidence',t.confidence), updated_at into new.label,new.state_snapshot,new.source_updated_at from public.campaign_attribution_assessments t where t.project_id=new.project_id and t.id=new.attribution_assessment_id;
 end case;
 if new.label is null or new.source_updated_at is null then raise exception 'reference_not_found' using errcode='23503'; end if;
 return new; end $$;
create trigger report_references_resolve before insert or update on public.report_references for each row execute function public.resolve_report_reference();

create function public.guard_report_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if current_setting('citem.lifecycle_rpc',true) is distinct from 'on' then
  if new.lifecycle_status not in ('DRAFT','IN_REVIEW','APPROVED','ARCHIVED') then raise exception 'lifecycle_transition_requires_workflow' using errcode='42501'; end if;
  if old.lifecycle_status in ('PUBLISHED','SUPERSEDED') and new.lifecycle_status not in ('ARCHIVED',old.lifecycle_status) then raise exception 'issued_product_transition_requires_workflow' using errcode='42501'; end if;
 end if;
 if new.lifecycle_status='ARCHIVED' then new.archived_at=coalesce(old.archived_at,now()); elsif old.lifecycle_status='ARCHIVED' then new.archived_at=null; end if;
 if new.lifecycle_status='IN_REVIEW' and old.lifecycle_status<>'IN_REVIEW' then new.reviewed_at=now(); end if;
 if new.lifecycle_status='APPROVED' and old.lifecycle_status<>'APPROVED' then new.approved_at=now(); end if;
 return new; end $$;
create trigger reports_lifecycle_guard before update of lifecycle_status on public.reports for each row execute function public.guard_report_lifecycle();

create function public.guard_report_version() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='DELETE' then raise exception 'report_versions_are_permanent' using errcode='55000'; end if;
 if tg_op='UPDATE' and current_setting('citem.version_rpc',true) is distinct from 'on' then raise exception 'report_version_updates_require_workflow' using errcode='42501'; end if;
 if tg_op='UPDATE' and row(new.id,new.project_id,new.report_id,new.version_number,new.title_snapshot,new.product_type_snapshot,new.content_snapshot,new.executive_summary_snapshot,new.key_judgments_snapshot,new.confidence_snapshot,new.intelligence_gaps_snapshot,new.recommendations_snapshot,new.change_summary,new.created_by,new.created_at) is distinct from row(old.id,old.project_id,old.report_id,old.version_number,old.title_snapshot,old.product_type_snapshot,old.content_snapshot,old.executive_summary_snapshot,old.key_judgments_snapshot,old.confidence_snapshot,old.intelligence_gaps_snapshot,old.recommendations_snapshot,old.change_summary,old.created_by,old.created_at) then raise exception 'report_version_snapshot_immutable' using errcode='55000'; end if;
 return coalesce(new,old); end $$;
create trigger report_versions_guard before update or delete on public.report_versions for each row execute function public.guard_report_version();
create function public.guard_version_reference() returns trigger language plpgsql as $$ begin if tg_op<>'INSERT' then raise exception 'version_reference_immutable' using errcode='55000'; end if; return new; end $$;
create trigger report_version_references_guard before update or delete on public.report_version_references for each row execute function public.guard_version_reference();
create function public.guard_report_delete() returns trigger language plpgsql as $$ begin if exists(select 1 from public.report_versions where report_id=old.id) then raise exception 'report_has_permanent_versions' using errcode='55000'; end if; return old; end $$;
create trigger reports_version_history_delete_guard before delete on public.reports for each row execute function public.guard_report_delete();

create function public.create_report_version(p_project_id uuid,p_report_id uuid,p_change_summary text,p_executive_summary text,p_key_judgments text,p_confidence text,p_intelligence_gaps text,p_recommendations text) returns public.report_versions language plpgsql security definer set search_path='' as $$
declare r public.reports; v public.report_versions; n integer; ref public.report_references; begin
 if auth.uid() is null then raise exception 'not_authorized' using errcode='42501'; end if;
 select x.* into r from public.reports x join public.projects p on p.id=x.project_id and p.owner_id=auth.uid() where x.project_id=p_project_id and x.id=p_report_id for update;
 if r.id is null or r.lifecycle_status='ARCHIVED' then raise exception 'report_not_versionable' using errcode='42501'; end if;
 if char_length(trim(p_change_summary)) not between 1 and 2000 or char_length(trim(p_executive_summary)) not between 1 and 20000 or char_length(trim(p_key_judgments)) not between 1 and 20000 or char_length(trim(p_confidence)) not between 1 and 100 or char_length(trim(p_intelligence_gaps)) not between 1 and 20000 or char_length(trim(p_recommendations)) not between 1 and 20000 then raise exception 'invalid_version_metadata' using errcode='22023'; end if;
 n=r.current_version_number+1;
 insert into public.report_versions(project_id,report_id,version_number,title_snapshot,product_type_snapshot,content_snapshot,executive_summary_snapshot,key_judgments_snapshot,confidence_snapshot,intelligence_gaps_snapshot,recommendations_snapshot,change_summary,created_by) values(p_project_id,p_report_id,n,r.title,r.product_type,r.content,p_executive_summary,p_key_judgments,p_confidence,p_intelligence_gaps,p_recommendations,p_change_summary,auth.uid()) returning * into v;
 for ref in select * from public.report_references where project_id=p_project_id and report_id=p_report_id for share loop
  insert into public.report_version_references(id,project_id,report_id,report_version_id,reference_type,source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id,label_snapshot,state_snapshot,source_updated_at,created_by) values(gen_random_uuid(),ref.project_id,ref.report_id,v.id,ref.reference_type,ref.source_id,ref.evidence_id,ref.indicator_id,ref.enrichment_result_id,ref.infrastructure_cluster_id,ref.timeline_event_id,ref.campaign_id,ref.threat_actor_id,ref.malware_id,ref.cve_id,ref.mitre_technique_id,ref.attribution_hypothesis_id,ref.attribution_assessment_id,ref.label,ref.state_snapshot,ref.source_updated_at,auth.uid());
 end loop;
 update public.reports set current_version_number=n where id=p_report_id and project_id=p_project_id; return v;
end $$;
create function public.publish_report_version(p_project_id uuid,p_report_id uuid,p_version_id uuid) returns public.report_versions language plpgsql security definer set search_path='' as $$ declare v public.report_versions; ts timestamptz:=clock_timestamp(); begin
 if auth.uid() is null or not exists(select 1 from public.projects where id=p_project_id and owner_id=auth.uid()) then raise exception 'not_authorized' using errcode='42501'; end if;
 perform set_config('citem.version_rpc','on',true); perform set_config('citem.lifecycle_rpc','on',true);
 select * into v from public.report_versions where project_id=p_project_id and report_id=p_report_id and id=p_version_id for update;
 if v.id is null or v.version_status<>'SAVED' then raise exception 'version_not_publishable' using errcode='22023'; end if;
 update public.report_versions set version_status='SUPERSEDED',superseded_at=ts where project_id=p_project_id and report_id=p_report_id and version_status='PUBLISHED';
 update public.report_versions set version_status='PUBLISHED',published_at=ts where id=p_version_id returning * into v;
 update public.reports set authoritative_version_id=p_version_id,lifecycle_status='PUBLISHED',published_at=ts where project_id=p_project_id and id=p_report_id;
 return v; end $$;
create function public.validate_authoritative_version() returns trigger language plpgsql set search_path='' as $$ begin
 if new.authoritative_version_id is not null and not exists(select 1 from public.report_versions v where v.id=new.authoritative_version_id and v.project_id=new.project_id and v.report_id=new.id and v.version_status='PUBLISHED') then raise exception 'authoritative_version_must_be_published' using errcode='23514'; end if; return new; end $$;
create constraint trigger reports_authoritative_published after insert or update of authoritative_version_id on public.reports deferrable initially deferred for each row execute function public.validate_authoritative_version();
revoke all on function public.create_report_version(uuid,uuid,text,text,text,text,text,text) from public,anon; grant execute on function public.create_report_version(uuid,uuid,text,text,text,text,text,text) to authenticated;
revoke all on function public.publish_report_version(uuid,uuid,uuid) from public,anon; grant execute on function public.publish_report_version(uuid,uuid,uuid) to authenticated;

alter table public.report_versions enable row level security; alter table public.report_references enable row level security; alter table public.report_version_references enable row level security;
create policy report_versions_select on public.report_versions for select to authenticated using(public.project_is_owned(project_id));
create policy report_references_select on public.report_references for select to authenticated using(public.project_is_owned(project_id));
create policy report_references_insert on public.report_references for insert to authenticated with check(public.project_is_owned(project_id) and created_by=auth.uid());
create policy report_references_delete on public.report_references for delete to authenticated using(public.project_is_owned(project_id) and created_by=auth.uid());
create policy report_version_references_select on public.report_version_references for select to authenticated using(public.project_is_owned(project_id));
-- No authenticated INSERT/UPDATE/DELETE policies on immutable versions or snapshots; SECURITY DEFINER workflow RPCs are the sole writers.
