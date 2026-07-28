-- CİTEM Product Roadmap Phase 2.1 — Slice A
-- Investigation metadata, structured sources, and IOC observation provenance.
-- Additive only: historical migrations 001-015 remain unchanged.

do $$ begin
  create type public.investigation_status as enum (
    'DRAFT','ACTIVE','ANALYSIS','REVIEW','COMPLETED','ARCHIVED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.indicator_status as enum (
    'UNVERIFIED','SUSPICIOUS','MALICIOUS','BENIGN','FALSE_POSITIVE','INACTIVE','EXPIRED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.source_type as enum (
    'VENDOR_REPORT','CERT_ADVISORY','RESEARCH_BLOG','THREAT_FEED',
    'ENRICHMENT_PROVIDER','MALWARE_SANDBOX','TECHNICAL_REPORT','WEB_PAGE',
    'ANALYST_OBSERVATION','OTHER'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.source_reliability as enum ('HIGH','MEDIUM','LOW','UNKNOWN');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.provenance_origin_kind as enum ('ANALYST','SYSTEM','PROVIDER','AI','IMPORT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.verification_state as enum ('UNVERIFIED','VERIFIED','DISPUTED');
exception when duplicate_object then null; end $$;

alter table public.projects
  add column if not exists research_question text,
  add column if not exists investigation_status public.investigation_status not null default 'DRAFT',
  add column if not exists current_assessment text,
  add column if not exists confidence public.confidence_level,
  add column if not exists closed_at timestamptz;

alter table public.projects
  drop constraint if exists projects_research_question_length,
  add constraint projects_research_question_length
    check (research_question is null or char_length(research_question) <= 5000),
  drop constraint if exists projects_current_assessment_length,
  add constraint projects_current_assessment_length
    check (current_assessment is null or char_length(current_assessment) <= 20000);

create index if not exists projects_investigation_status_idx
  on public.projects(owner_id, investigation_status, updated_at desc);

alter table public.indicators
  add column if not exists status public.indicator_status not null default 'UNVERIFIED',
  add column if not exists analyst_rationale text,
  add column if not exists current_relevance text;

alter table public.indicators
  drop constraint if exists indicators_analyst_rationale_length,
  add constraint indicators_analyst_rationale_length
    check (analyst_rationale is null or char_length(analyst_rationale) <= 10000),
  drop constraint if exists indicators_current_relevance_length,
  add constraint indicators_current_relevance_length
    check (current_relevance is null or char_length(current_relevance) <= 4000);

create index if not exists indicators_project_status_idx
  on public.indicators(project_id, status, updated_at desc);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 240),
  source_type public.source_type not null,
  publisher text check (publisher is null or char_length(publisher) <= 240),
  url text check (url is null or url ~* '^https?://'),
  published_at timestamptz,
  accessed_at timestamptz,
  description text not null default '' check (char_length(description) <= 10000),
  reliability public.source_reliability not null default 'UNKNOWN',
  analyst_notes text not null default '' check (char_length(analyst_notes) <= 20000),
  evidence_id uuid,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, id),
  foreign key(project_id, evidence_id)
    references public.evidence(project_id, id) on delete set null
);

create table if not exists public.indicator_observations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  indicator_id uuid not null,
  source_id uuid,
  observed_value text not null check (char_length(trim(observed_value)) between 1 and 8000),
  canonical_value text not null check (char_length(trim(canonical_value)) between 1 and 8000),
  defanged_value text not null check (char_length(trim(defanged_value)) between 1 and 8000),
  observed_at timestamptz,
  ingested_at timestamptz not null default now(),
  origin_kind public.provenance_origin_kind not null default 'ANALYST',
  confidence public.confidence_level,
  verification_state public.verification_state not null default 'UNVERIFIED',
  notes text not null default '' check (char_length(notes) <= 10000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(project_id, id),
  foreign key(project_id, indicator_id)
    references public.indicators(project_id, id) on delete cascade,
  foreign key(project_id, source_id)
    references public.sources(project_id, id) on delete set null
);

create index if not exists sources_project_updated_idx
  on public.sources(project_id, updated_at desc, id);
create index if not exists sources_project_type_idx
  on public.sources(project_id, source_type, published_at desc);
create index if not exists indicator_observations_indicator_idx
  on public.indicator_observations(project_id, indicator_id, observed_at desc nulls last, ingested_at desc);
create index if not exists indicator_observations_source_idx
  on public.indicator_observations(project_id, source_id) where source_id is not null;

create trigger sources_set_updated_at
  before update on public.sources
  for each row execute function public.set_updated_at();

alter table public.sources enable row level security;
alter table public.indicator_observations enable row level security;

create policy "sources select owned project"
  on public.sources for select to authenticated
  using (public.project_is_owned(project_id));
create policy "sources insert owned project"
  on public.sources for insert to authenticated
  with check (public.project_is_owned(project_id) and created_by = auth.uid());
create policy "sources update owned project"
  on public.sources for update to authenticated
  using (public.project_is_owned(project_id))
  with check (public.project_is_owned(project_id) and created_by = auth.uid());
create policy "sources delete owned project"
  on public.sources for delete to authenticated
  using (public.project_is_owned(project_id));

create policy "indicator observations select owned project"
  on public.indicator_observations for select to authenticated
  using (public.project_is_owned(project_id));
create policy "indicator observations insert owned project"
  on public.indicator_observations for insert to authenticated
  with check (public.project_is_owned(project_id) and created_by = auth.uid());
create policy "indicator observations update owned project"
  on public.indicator_observations for update to authenticated
  using (public.project_is_owned(project_id))
  with check (public.project_is_owned(project_id) and created_by = auth.uid());
create policy "indicator observations delete owned project"
  on public.indicator_observations for delete to authenticated
  using (public.project_is_owned(project_id));
