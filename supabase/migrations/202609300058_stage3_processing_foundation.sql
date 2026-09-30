-- CITEM Stage 3 Processing Foundation
-- Source annotations become resumable processing work items while preserving the
-- epistemic boundary between source-reported content and later analytical judgement.

do $$ begin
  create type public.source_annotation_processing_state as enum (
    'UNPROCESSED','PROCESSED','IGNORED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.source_annotation_output_type as enum (
    'INDICATOR',
    'MALWARE',
    'CVE',
    'MITRE_TECHNIQUE',
    'CAMPAIGN',
    'THREAT_ACTOR',
    'ATTRIBUTION_CLAIM'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.source_annotation_output_action as enum ('CREATED','LINKED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.source_annotation_mapping_origin as enum (
    'SOURCE_EXPLICIT',
    'ANALYST_MAPPED',
    'REFERENCE_MAPPED',
    'AI_SUGGESTED'
  );
exception when duplicate_object then null; end $$;

alter table public.source_annotations
  add column if not exists processing_state public.source_annotation_processing_state not null default 'UNPROCESSED',
  add column if not exists processing_note text,
  add column if not exists processed_at timestamptz,
  add column if not exists processed_by uuid references auth.users(id) on delete restrict;

alter table public.source_annotations
  drop constraint if exists source_annotations_processing_note_bounds,
  add constraint source_annotations_processing_note_bounds
    check(processing_note is null or char_length(processing_note) <= 4000),
  drop constraint if exists source_annotations_processing_state_consistency,
  add constraint source_annotations_processing_state_consistency
    check(
      (processing_state='UNPROCESSED' and processed_at is null and processed_by is null)
      or
      (processing_state in ('PROCESSED','IGNORED') and processed_at is not null and processed_by is not null)
    );

create index if not exists source_annotations_processing_queue_idx
  on public.source_annotations(project_id, source_id, processing_state, page_number, created_at, id);

create table if not exists public.source_attribution_claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_annotation_id uuid not null,
  claim_summary text not null check(char_length(trim(claim_summary)) between 1 and 10000),
  claimed_actor_text text not null check(char_length(trim(claimed_actor_text)) between 1 and 500),
  canonical_threat_actor_id uuid,
  mapping_origin public.source_annotation_mapping_origin not null default 'SOURCE_EXPLICIT',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(project_id,source_annotation_id)
    references public.source_annotations(project_id,id) on delete cascade,
  foreign key(project_id,canonical_threat_actor_id)
    references public.threat_actors(project_id,id) on delete restrict,
  unique(project_id,id)
);

create index if not exists source_attribution_claims_annotation_idx
  on public.source_attribution_claims(project_id,source_annotation_id,created_at,id);
create index if not exists source_attribution_claims_actor_idx
  on public.source_attribution_claims(project_id,canonical_threat_actor_id,created_at,id)
  where canonical_threat_actor_id is not null;

drop trigger if exists source_attribution_claims_set_updated_at on public.source_attribution_claims;
create trigger source_attribution_claims_set_updated_at
  before update on public.source_attribution_claims
  for each row execute function public.set_updated_at();

create table if not exists public.source_annotation_outputs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_annotation_id uuid not null,
  output_type public.source_annotation_output_type not null,
  output_action public.source_annotation_output_action not null,
  mapping_origin public.source_annotation_mapping_origin not null default 'SOURCE_EXPLICIT',
  target_label text not null check(char_length(trim(target_label)) between 1 and 500),
  raw_value text check(raw_value is null or char_length(raw_value) <= 20000),
  normalized_value text check(normalized_value is null or char_length(normalized_value) <= 20000),

  indicator_id uuid,
  malware_id uuid,
  cve_id uuid,
  mitre_technique_id uuid,
  campaign_id uuid,
  threat_actor_id uuid,
  attribution_claim_id uuid,

  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),

  foreign key(project_id,source_annotation_id)
    references public.source_annotations(project_id,id) on delete cascade,
  foreign key(project_id,indicator_id)
    references public.indicators(project_id,id) on delete restrict,
  foreign key(project_id,malware_id)
    references public.malware(project_id,id) on delete restrict,
  foreign key(project_id,cve_id)
    references public.cves(project_id,id) on delete restrict,
  foreign key(project_id,mitre_technique_id)
    references public.mitre_techniques(project_id,id) on delete restrict,
  foreign key(project_id,campaign_id)
    references public.campaigns(project_id,id) on delete restrict,
  foreign key(project_id,threat_actor_id)
    references public.threat_actors(project_id,id) on delete restrict,
  foreign key(project_id,attribution_claim_id)
    references public.source_attribution_claims(project_id,id) on delete restrict,

  unique(project_id,id),

  constraint source_annotation_outputs_single_target check(
    num_nonnulls(
      indicator_id,malware_id,cve_id,mitre_technique_id,
      campaign_id,threat_actor_id,attribution_claim_id
    )=1
  ),
  constraint source_annotation_outputs_type_target_check check(
    (output_type='INDICATOR' and indicator_id is not null)
    or (output_type='MALWARE' and malware_id is not null)
    or (output_type='CVE' and cve_id is not null)
    or (output_type='MITRE_TECHNIQUE' and mitre_technique_id is not null)
    or (output_type='CAMPAIGN' and campaign_id is not null)
    or (output_type='THREAT_ACTOR' and threat_actor_id is not null)
    or (output_type='ATTRIBUTION_CLAIM' and attribution_claim_id is not null)
  )
);

create index if not exists source_annotation_outputs_annotation_idx
  on public.source_annotation_outputs(project_id,source_annotation_id,created_at,id);
create index if not exists source_annotation_outputs_project_type_idx
  on public.source_annotation_outputs(project_id,output_type,created_at,id);

create unique index if not exists source_annotation_outputs_indicator_unique
  on public.source_annotation_outputs(project_id,source_annotation_id,indicator_id)
  where indicator_id is not null;
create unique index if not exists source_annotation_outputs_malware_unique
  on public.source_annotation_outputs(project_id,source_annotation_id,malware_id)
  where malware_id is not null;
create unique index if not exists source_annotation_outputs_cve_unique
  on public.source_annotation_outputs(project_id,source_annotation_id,cve_id)
  where cve_id is not null;
create unique index if not exists source_annotation_outputs_mitre_unique
  on public.source_annotation_outputs(project_id,source_annotation_id,mitre_technique_id)
  where mitre_technique_id is not null;
create unique index if not exists source_annotation_outputs_campaign_unique
  on public.source_annotation_outputs(project_id,source_annotation_id,campaign_id)
  where campaign_id is not null;
create unique index if not exists source_annotation_outputs_actor_unique
  on public.source_annotation_outputs(project_id,source_annotation_id,threat_actor_id)
  where threat_actor_id is not null;
create unique index if not exists source_annotation_outputs_claim_unique
  on public.source_annotation_outputs(project_id,source_annotation_id,attribution_claim_id)
  where attribution_claim_id is not null;

alter table public.source_attribution_claims enable row level security;
alter table public.source_annotation_outputs enable row level security;

drop policy if exists source_attribution_claims_select_owned on public.source_attribution_claims;
create policy source_attribution_claims_select_owned
  on public.source_attribution_claims for select to authenticated
  using(public.project_is_owned(project_id));
drop policy if exists source_attribution_claims_insert_owned on public.source_attribution_claims;
create policy source_attribution_claims_insert_owned
  on public.source_attribution_claims for insert to authenticated
  with check(public.project_is_owned(project_id) and created_by=auth.uid());
drop policy if exists source_attribution_claims_update_owned on public.source_attribution_claims;
create policy source_attribution_claims_update_owned
  on public.source_attribution_claims for update to authenticated
  using(public.project_is_owned(project_id))
  with check(public.project_is_owned(project_id) and created_by=auth.uid());
drop policy if exists source_attribution_claims_delete_owned on public.source_attribution_claims;
create policy source_attribution_claims_delete_owned
  on public.source_attribution_claims for delete to authenticated
  using(public.project_is_owned(project_id));

drop policy if exists source_annotation_outputs_select_owned on public.source_annotation_outputs;
create policy source_annotation_outputs_select_owned
  on public.source_annotation_outputs for select to authenticated
  using(public.project_is_owned(project_id));
drop policy if exists source_annotation_outputs_insert_owned on public.source_annotation_outputs;
create policy source_annotation_outputs_insert_owned
  on public.source_annotation_outputs for insert to authenticated
  with check(public.project_is_owned(project_id) and created_by=auth.uid());
drop policy if exists source_annotation_outputs_delete_owned on public.source_annotation_outputs;
create policy source_annotation_outputs_delete_owned
  on public.source_annotation_outputs for delete to authenticated
  using(public.project_is_owned(project_id));

comment on column public.source_annotations.processing_state is
  'Stage 3 analyst work state only. It is not a percentage-complete metric and is never inferred from output count.';
comment on table public.source_annotation_outputs is
  'Immutable provenance ledger from one source annotation to analyst-created or analyst-linked structured CITEM records. It is not an analytical relationship graph.';
comment on column public.source_annotation_outputs.mapping_origin is
  'Origin of the normalization/mapping decision. AI_SUGGESTED means analyst accepted a suggestion; it never means autonomous analytical judgement.';
comment on table public.source_attribution_claims is
  'Source-reported actor attribution statements preserved separately from CITEM attribution hypotheses and assessments.';
