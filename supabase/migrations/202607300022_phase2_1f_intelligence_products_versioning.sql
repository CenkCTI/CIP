-- Phase 2.1F: controlled intelligence products and immutable assessments.
create type public.intelligence_product_type as enum ('TECHNICAL_NOTE','IOC_BRIEF','INFRASTRUCTURE_ASSESSMENT','CAMPAIGN_ASSESSMENT','ATTRIBUTION_ASSESSMENT','OPERATIONAL_INTELLIGENCE_REPORT','INCIDENT_UPDATE','OTHER');
create type public.report_lifecycle_status as enum ('DRAFT','IN_REVIEW','APPROVED','PUBLISHED','SUPERSEDED','ARCHIVED');
create type public.report_version_status as enum ('SAVED','PUBLISHED','SUPERSEDED');
create type public.report_reference_type as enum ('SOURCE','EVIDENCE','INDICATOR','ENRICHMENT_RESULT','INFRASTRUCTURE_CLUSTER','TIMELINE_EVENT','CAMPAIGN','THREAT_ACTOR','MALWARE','CVE','MITRE_TECHNIQUE','ATTRIBUTION_HYPOTHESIS','ATTRIBUTION_ASSESSMENT');

alter table public.reports
  add column product_type public.intelligence_product_type not null default 'OTHER',
  add column lifecycle_status public.report_lifecycle_status not null default 'DRAFT',
  add column current_version_number integer not null default 0 check (current_version_number >= 0),
  add column authoritative_version_id uuid,
  add column reviewed_at timestamptz,
  add column approved_at timestamptz,
  add column published_at timestamptz,
  add column superseded_at timestamptz,
  add column archived_at timestamptz;

create table public.report_versions (
  id uuid primary key default gen_random_uuid(), project_id uuid not null, report_id uuid not null,
  version_number integer not null check (version_number > 0), version_status public.report_version_status not null default 'SAVED',
  title_snapshot text not null check (char_length(btrim(title_snapshot)) between 1 and 200), product_type_snapshot public.intelligence_product_type not null,
  content_snapshot jsonb not null check (jsonb_typeof(content_snapshot)='object' and content_snapshot->>'type'='doc'),
  executive_summary_snapshot text not null check (char_length(btrim(executive_summary_snapshot)) between 1 and 20000),
  key_judgments_snapshot text not null check (char_length(btrim(key_judgments_snapshot)) between 1 and 20000),
  confidence_snapshot text not null check (char_length(btrim(confidence_snapshot)) between 1 and 100),
  intelligence_gaps_snapshot text not null check (char_length(btrim(intelligence_gaps_snapshot)) between 1 and 20000),
  recommendations_snapshot text not null check (char_length(btrim(recommendations_snapshot)) between 1 and 20000),
  change_summary text not null check (char_length(btrim(change_summary)) between 1 and 2000),
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(), published_at timestamptz, superseded_at timestamptz,
  unique (report_id, version_number), unique(project_id, report_id, id),
  foreign key(project_id, report_id) references public.reports(project_id,id) on delete restrict
);
alter table public.reports add constraint reports_authoritative_version_fk foreign key(project_id,id,authoritative_version_id) references public.report_versions(project_id,report_id,id) deferrable initially deferred;

create table public.report_references (
  id uuid primary key default gen_random_uuid(), project_id uuid not null, report_id uuid not null,
  reference_type public.report_reference_type not null, reference_id uuid not null,
  label text not null check(char_length(btrim(label)) between 1 and 500), state text not null default 'CURRENT', source_updated_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
  unique(report_id,reference_type,reference_id), foreign key(project_id,report_id) references public.reports(project_id,id) on delete cascade
);

create table public.report_version_references (
  id uuid primary key default gen_random_uuid(), project_id uuid not null, report_id uuid not null, report_version_id uuid not null,
  reference_type public.report_reference_type not null,
  source_id uuid, evidence_id uuid, indicator_id uuid, enrichment_result_id uuid, infrastructure_cluster_id uuid, timeline_event_id uuid, campaign_id uuid, threat_actor_id uuid, malware_id uuid, cve_id uuid, mitre_technique_id uuid, attribution_hypothesis_id uuid, attribution_assessment_id uuid,
  label_snapshot text not null check(char_length(btrim(label_snapshot)) between 1 and 500), state_snapshot jsonb not null default '{}'::jsonb, source_updated_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
  foreign key(project_id,report_id,report_version_id) references public.report_versions(project_id,report_id,id) on delete restrict,
  constraint report_version_references_exactly_one check (num_nonnulls(source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)=1),
  unique(report_version_id,reference_type,source_id,evidence_id,indicator_id,enrichment_result_id,infrastructure_cluster_id,timeline_event_id,campaign_id,threat_actor_id,malware_id,cve_id,mitre_technique_id,attribution_hypothesis_id,attribution_assessment_id)
);

create or replace function public.guard_report_version() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    if old.version_status <> 'SAVED' then raise exception 'published report versions cannot be deleted' using errcode='55000'; end if;
    return old;
  end if;
  if tg_op='UPDATE' then
    if row(new.title_snapshot,new.product_type_snapshot,new.content_snapshot,new.executive_summary_snapshot,new.key_judgments_snapshot,new.confidence_snapshot,new.intelligence_gaps_snapshot,new.recommendations_snapshot,new.change_summary,new.created_by,new.created_at,new.project_id,new.report_id,new.version_number)
       is distinct from row(old.title_snapshot,old.product_type_snapshot,old.content_snapshot,old.executive_summary_snapshot,old.key_judgments_snapshot,old.confidence_snapshot,old.intelligence_gaps_snapshot,old.recommendations_snapshot,old.change_summary,old.created_by,old.created_at,old.project_id,old.report_id,old.version_number) then raise exception 'report version snapshots are immutable' using errcode='55000'; end if;
    return new;
  end if;
  if new.created_by<>auth.uid() or not exists(select 1 from public.projects p where p.id=new.project_id and p.owner_id=auth.uid()) then raise exception 'not authorized' using errcode='42501'; end if;
  if new.version_number <> (select r.current_version_number+1 from public.reports r where r.id=new.report_id and r.project_id=new.project_id for update) then raise exception 'version number must be sequential' using errcode='23514'; end if;
  update public.reports set current_version_number=new.version_number where id=new.report_id and project_id=new.project_id;
  return new;
end $$;
create trigger guard_report_versions before insert or update or delete on public.report_versions for each row execute function public.guard_report_version();

create or replace function public.guard_version_reference() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op<>'INSERT' then raise exception 'version reference snapshots are immutable' using errcode='55000'; end if;
 if new.created_by<>auth.uid() or not exists(select 1 from public.projects p where p.id=new.project_id and p.owner_id=auth.uid()) then raise exception 'not authorized' using errcode='42501'; end if;
 return new; end $$;
create trigger guard_report_version_references before insert or update or delete on public.report_version_references for each row execute function public.guard_version_reference();

create or replace function public.guard_published_report_delete() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if exists(select 1 from public.report_versions v where v.report_id=old.id and v.version_status<>'SAVED') then raise exception 'reports with published history cannot be deleted' using errcode='55000'; end if; return old; end $$;
create trigger guard_published_report_delete before delete on public.reports for each row execute function public.guard_published_report_delete();

create or replace function public.publish_report_version(p_project_id uuid,p_report_id uuid,p_version_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v public.report_versions; begin
 if not exists(select 1 from public.projects where id=p_project_id and owner_id=auth.uid()) then raise exception 'not authorized' using errcode='42501'; end if;
 select * into v from public.report_versions where id=p_version_id and report_id=p_report_id and project_id=p_project_id for update;
 if v.id is null or v.version_status<>'SAVED' then raise exception 'version is not publishable' using errcode='23514'; end if;
 update public.report_versions set version_status='SUPERSEDED',superseded_at=now() where report_id=p_report_id and version_status='PUBLISHED';
 update public.report_versions set version_status='PUBLISHED',published_at=now() where id=p_version_id;
 update public.reports set authoritative_version_id=p_version_id,lifecycle_status='PUBLISHED',published_at=now() where id=p_report_id and project_id=p_project_id;
end $$;
revoke all on function public.publish_report_version(uuid,uuid,uuid) from public,anon; grant execute on function public.publish_report_version(uuid,uuid,uuid) to authenticated;

alter table public.report_versions enable row level security; alter table public.report_references enable row level security; alter table public.report_version_references enable row level security;
create policy report_versions_select on public.report_versions for select to authenticated using(exists(select 1 from public.projects p where p.id=project_id and p.owner_id=auth.uid()));
create policy report_versions_insert on public.report_versions for insert to authenticated with check(created_by=auth.uid() and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=auth.uid()));
create policy report_versions_update on public.report_versions for update to authenticated using(exists(select 1 from public.projects p where p.id=project_id and p.owner_id=auth.uid()));
create policy report_versions_delete_saved on public.report_versions for delete to authenticated using(version_status='SAVED' and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=auth.uid()));
create policy report_references_all on public.report_references for all to authenticated using(exists(select 1 from public.projects p where p.id=project_id and p.owner_id=auth.uid())) with check(created_by=auth.uid() and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=auth.uid()));
create policy report_version_references_select on public.report_version_references for select to authenticated using(exists(select 1 from public.projects p where p.id=project_id and p.owner_id=auth.uid()));
create policy report_version_references_insert on public.report_version_references for insert to authenticated with check(created_by=auth.uid() and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=auth.uid()));
