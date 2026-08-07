-- Investigation-scoped attribution matrix.
-- Keeps Phase 2.1E Campaign-scoped records valid while allowing new hypotheses,
-- clues and evaluations to exist directly under an Investigation.

-- Hypotheses and clue rows may now be Investigation-scoped. The existing
-- composite Campaign foreign keys remain useful for legacy rows; PostgreSQL
-- does not enforce a composite FK when campaign_id is null.
alter table public.attribution_hypotheses
  alter column campaign_id drop not null;

alter table public.attribution_evidence_items
  alter column campaign_id drop not null;

alter table public.attribution_evidence_evaluations
  alter column campaign_id drop not null,
  alter column diagnostic_value set default 'MEDIUM';

-- Free-form clues are valid analytical observations even before supporting
-- material is linked. Keep legacy inline references bounded to at most one;
-- additional references live in attribution_evidence_item_links below.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.attribution_evidence_items'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%num_nonnulls%'
  loop
    execute format(
      'alter table public.attribution_evidence_items drop constraint %I',
      c.conname
    );
  end loop;
end $$;

alter table public.attribution_evidence_items
  add constraint attribution_evidence_items_reference_count_check
  check (
    num_nonnulls(
      source_id,
      evidence_id,
      timeline_event_id,
      infrastructure_cluster_id,
      indicator_id,
      enrichment_result_id,
      malware_id,
      mitre_technique_id
    ) <= 1
  );

-- Investigation-scoped rows must still be unique per referenced object.
create unique index attribution_evidence_source_project_unique
  on public.attribution_evidence_items(project_id, source_id)
  where campaign_id is null and source_id is not null;
create unique index attribution_evidence_evidence_project_unique
  on public.attribution_evidence_items(project_id, evidence_id)
  where campaign_id is null and evidence_id is not null;
create unique index attribution_evidence_timeline_project_unique
  on public.attribution_evidence_items(project_id, timeline_event_id)
  where campaign_id is null and timeline_event_id is not null;
create unique index attribution_evidence_cluster_project_unique
  on public.attribution_evidence_items(project_id, infrastructure_cluster_id)
  where campaign_id is null and infrastructure_cluster_id is not null;
create unique index attribution_evidence_indicator_project_unique
  on public.attribution_evidence_items(project_id, indicator_id)
  where campaign_id is null and indicator_id is not null;
create unique index attribution_evidence_enrichment_project_unique
  on public.attribution_evidence_items(project_id, enrichment_result_id)
  where campaign_id is null and enrichment_result_id is not null;
create unique index attribution_evidence_malware_project_unique
  on public.attribution_evidence_items(project_id, malware_id)
  where campaign_id is null and malware_id is not null;
create unique index attribution_evidence_mitre_project_unique
  on public.attribution_evidence_items(project_id, mitre_technique_id)
  where campaign_id is null and mitre_technique_id is not null;

-- Matrix cells must be enforceable even when campaign_id is null.
alter table public.attribution_evidence_evaluations
  add constraint attribution_evaluations_project_hypothesis_fkey
    foreign key(project_id, hypothesis_id)
    references public.attribution_hypotheses(project_id, id)
    on delete cascade,
  add constraint attribution_evaluations_project_clue_fkey
    foreign key(project_id, evidence_item_id)
    references public.attribution_evidence_items(project_id, id)
    on delete cascade;

-- A matrix cell can be classified with one click. Rationale is optional and may
-- be added later without changing the analyst-selected impact.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.attribution_evidence_evaluations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%rationale%'
  loop
    execute format(
      'alter table public.attribution_evidence_evaluations drop constraint %I',
      c.conname
    );
  end loop;
end $$;

alter table public.attribution_evidence_evaluations
  alter column rationale set default '',
  add constraint attribution_evaluations_rationale_bound_check
    check (char_length(rationale) <= 10000);

-- One clue can point to any number of supporting CITEM objects. A reference row
-- points to exactly one object, including Campaign when Campaign context matters.
create table public.attribution_evidence_item_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  evidence_item_id uuid not null,
  campaign_id uuid,
  source_id uuid,
  evidence_id uuid,
  timeline_event_id uuid,
  infrastructure_cluster_id uuid,
  indicator_id uuid,
  enrichment_result_id uuid,
  malware_id uuid,
  mitre_technique_id uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(project_id, id),
  foreign key(project_id, evidence_item_id)
    references public.attribution_evidence_items(project_id, id)
    on delete cascade,
  foreign key(project_id, campaign_id)
    references public.campaigns(project_id, id)
    on delete restrict,
  foreign key(project_id, source_id)
    references public.sources(project_id, id)
    on delete restrict,
  foreign key(project_id, evidence_id)
    references public.evidence(project_id, id)
    on delete restrict,
  foreign key(project_id, timeline_event_id)
    references public.timeline_events(project_id, id)
    on delete restrict,
  foreign key(project_id, infrastructure_cluster_id)
    references public.infrastructure_clusters(project_id, id)
    on delete restrict,
  foreign key(project_id, indicator_id)
    references public.indicators(project_id, id)
    on delete restrict,
  foreign key(project_id, enrichment_result_id)
    references public.enrichment_results(project_id, id)
    on delete restrict,
  foreign key(project_id, malware_id)
    references public.malware(project_id, id)
    on delete restrict,
  foreign key(project_id, mitre_technique_id)
    references public.mitre_techniques(project_id, id)
    on delete restrict,
  check (
    num_nonnulls(
      campaign_id,
      source_id,
      evidence_id,
      timeline_event_id,
      infrastructure_cluster_id,
      indicator_id,
      enrichment_result_id,
      malware_id,
      mitre_technique_id
    ) = 1
  )
);

create unique index attribution_clue_link_campaign_unique
  on public.attribution_evidence_item_links(evidence_item_id, campaign_id)
  where campaign_id is not null;
create unique index attribution_clue_link_source_unique
  on public.attribution_evidence_item_links(evidence_item_id, source_id)
  where source_id is not null;
create unique index attribution_clue_link_evidence_unique
  on public.attribution_evidence_item_links(evidence_item_id, evidence_id)
  where evidence_id is not null;
create unique index attribution_clue_link_timeline_unique
  on public.attribution_evidence_item_links(evidence_item_id, timeline_event_id)
  where timeline_event_id is not null;
create unique index attribution_clue_link_cluster_unique
  on public.attribution_evidence_item_links(evidence_item_id, infrastructure_cluster_id)
  where infrastructure_cluster_id is not null;
create unique index attribution_clue_link_indicator_unique
  on public.attribution_evidence_item_links(evidence_item_id, indicator_id)
  where indicator_id is not null;
create unique index attribution_clue_link_enrichment_unique
  on public.attribution_evidence_item_links(evidence_item_id, enrichment_result_id)
  where enrichment_result_id is not null;
create unique index attribution_clue_link_malware_unique
  on public.attribution_evidence_item_links(evidence_item_id, malware_id)
  where malware_id is not null;
create unique index attribution_clue_link_mitre_unique
  on public.attribution_evidence_item_links(evidence_item_id, mitre_technique_id)
  where mitre_technique_id is not null;
create index attribution_clue_links_project_idx
  on public.attribution_evidence_item_links(project_id, evidence_item_id);

-- Current judgement is now Investigation-scoped. Legacy Campaign assessments are
-- retained unchanged and remain available from legacy Campaign routes.
create table public.investigation_attribution_assessments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique,
  assessment_status public.attribution_assessment_status not null default 'DRAFT',
  conclusion_type public.attribution_conclusion_type not null default 'UNRESOLVED',
  confidence public.confidence_level not null default 'MEDIUM',
  preferred_hypothesis_id uuid,
  current_judgment text not null default '' check(char_length(current_judgment) <= 20000),
  alternative_explanations text not null default '' check(char_length(alternative_explanations) <= 20000),
  key_uncertainties text not null default '' check(char_length(key_uncertainties) <= 20000),
  discriminating_information_needed text not null default '' check(char_length(discriminating_information_needed) <= 20000),
  assessed_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(project_id) references public.projects(id) on delete cascade,
  foreign key(project_id, preferred_hypothesis_id)
    references public.attribution_hypotheses(project_id, id)
    on delete restrict,
  check(
    assessment_status = 'DRAFT'
    or (char_length(trim(current_judgment)) > 0 and assessed_at is not null)
  ),
  check(
    (conclusion_type = 'PREFERRED_HYPOTHESIS') =
    (preferred_hypothesis_id is not null)
  )
);

create trigger investigation_attribution_assessments_set_updated_at
  before update on public.investigation_attribution_assessments
  for each row execute function public.set_updated_at();

create function public.validate_investigation_preferred_attribution_hypothesis()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.preferred_hypothesis_id is not null and not exists (
    select 1
    from public.attribution_hypotheses h
    where h.id = new.preferred_hypothesis_id
      and h.project_id = new.project_id
      and h.archived_at is null
      and h.status <> 'REJECTED'
  ) then
    raise exception using errcode='23514', message='preferred_hypothesis_must_be_current';
  end if;
  return new;
end
$$;

create trigger investigation_attribution_assessment_validate_preferred
  before insert or update on public.investigation_attribution_assessments
  for each row execute function public.validate_investigation_preferred_attribution_hypothesis();

-- Protect a preferred hypothesis regardless of whether the judgement is legacy
-- Campaign-scoped or the new Investigation-scoped judgement.
create or replace function public.protect_preferred_attribution_hypothesis()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.archived_at is not null or new.status = 'REJECTED' then
    if exists (
      select 1 from public.campaign_attribution_assessments a
      where a.preferred_hypothesis_id = new.id
    ) or exists (
      select 1 from public.investigation_attribution_assessments a
      where a.preferred_hypothesis_id = new.id
    ) then
      raise exception using errcode='23503', message='preferred_hypothesis_is_active';
    end if;
  end if;
  return new;
end
$$;

alter table public.attribution_evidence_item_links enable row level security;
alter table public.investigation_attribution_assessments enable row level security;

create policy attribution_clue_links_select_owned
  on public.attribution_evidence_item_links
  for select to authenticated
  using (public.project_is_owned(project_id));
create policy attribution_clue_links_insert_owned
  on public.attribution_evidence_item_links
  for insert to authenticated
  with check (public.project_is_owned(project_id) and created_by = auth.uid());
create policy attribution_clue_links_delete_owned
  on public.attribution_evidence_item_links
  for delete to authenticated
  using (public.project_is_owned(project_id));

create policy investigation_attribution_assessments_select_owned
  on public.investigation_attribution_assessments
  for select to authenticated
  using (public.project_is_owned(project_id));
create policy investigation_attribution_assessments_insert_owned
  on public.investigation_attribution_assessments
  for insert to authenticated
  with check (public.project_is_owned(project_id) and created_by = auth.uid());
create policy investigation_attribution_assessments_update_owned
  on public.investigation_attribution_assessments
  for update to authenticated
  using (public.project_is_owned(project_id))
  with check (public.project_is_owned(project_id) and created_by = auth.uid());
create policy investigation_attribution_assessments_delete_owned
  on public.investigation_attribution_assessments
  for delete to authenticated
  using (public.project_is_owned(project_id));
