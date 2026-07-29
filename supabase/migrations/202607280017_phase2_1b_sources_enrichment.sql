-- CİTEM Product Roadmap Phase 2.1B
-- Source Registry, provenance and enrichment foundation.
-- Additive only: historical migrations 001-016 remain unchanged.

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
  create type public.source_origin as enum ('ANALYST','SYSTEM','PROVIDER','AI','IMPORT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.verification_state as enum ('UNVERIFIED','VERIFIED','DISPUTED','REJECTED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.enrichment_run_status as enum (
    'PENDING','RUNNING','SUCCEEDED','PARTIAL','FAILED','CANCELLED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.enrichment_result_category as enum (
    'NETWORK','DNS','REGISTRATION','CERTIFICATE','REPUTATION',
    'MALWARE','RELATED_INDICATOR','OTHER'
  );
exception when duplicate_object then null; end $$;

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 240),
  source_type public.source_type not null,
  publisher text check (publisher is null or char_length(publisher) <= 240),
  url text check (
    url is null or (
      char_length(url) <= 2048
      and url ~* '^https?://'
      and url !~* '^https?://[^/[:space:]]+:[^/@[:space:]]+@'
    )
  ),
  published_at timestamptz,
  accessed_at timestamptz,
  reliability public.source_reliability not null default 'UNKNOWN',
  origin_kind public.source_origin not null default 'ANALYST',
  verification_state public.verification_state not null default 'UNVERIFIED',
  description text not null default '' check (char_length(description) <= 10000),
  analyst_notes text not null default '' check (char_length(analyst_notes) <= 20000),
  evidence_id uuid,
  external_key text check (external_key is null or char_length(external_key) <= 500),
  archived_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, id),
  foreign key(project_id, evidence_id)
    references public.evidence(project_id, id) on delete restrict
);

create unique index sources_project_external_key_unique_idx
  on public.sources(project_id, external_key)
  where external_key is not null;
create index sources_project_active_updated_idx
  on public.sources(project_id, archived_at, updated_at desc, id);
create index sources_project_type_published_idx
  on public.sources(project_id, source_type, published_at desc nulls last);
create index sources_project_reliability_verification_idx
  on public.sources(project_id, reliability, verification_state);
create index sources_evidence_idx
  on public.sources(project_id, evidence_id)
  where evidence_id is not null;

create trigger sources_set_updated_at
  before update on public.sources
  for each row execute function public.set_updated_at();

alter table public.indicator_observations
  add column if not exists source_id uuid,
  add column if not exists verification_state public.verification_state not null default 'UNVERIFIED';

alter table public.indicator_observations
  add constraint indicator_observations_source_same_project_fk
  foreign key(project_id, source_id)
  references public.sources(project_id, id) on delete restrict;

create index indicator_observations_project_source_idx
  on public.indicator_observations(project_id, source_id)
  where source_id is not null;
create index indicator_observations_project_verification_idx
  on public.indicator_observations(project_id, verification_state, ingested_at desc);

create table public.enrichment_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  indicator_id uuid not null,
  provider_id text not null check (char_length(trim(provider_id)) between 1 and 80),
  provider_label_snapshot text not null
    check (char_length(trim(provider_label_snapshot)) between 1 and 160),
  indicator_type_snapshot public.indicator_type not null,
  indicator_value_snapshot text not null
    check (char_length(trim(indicator_value_snapshot)) between 1 and 8000),
  status public.enrichment_run_status not null default 'PENDING',
  is_synthetic boolean not null default false,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  safe_error_code text check (safe_error_code is null or char_length(safe_error_code) <= 80),
  safe_error_message text check (safe_error_message is null or char_length(safe_error_message) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, id),
  foreign key(project_id, indicator_id)
    references public.indicators(project_id, id) on delete cascade,
  check (completed_at is null or started_at is null or completed_at >= started_at)
);

create unique index enrichment_runs_one_active_provider_idx
  on public.enrichment_runs(project_id, indicator_id, provider_id)
  where status in ('PENDING','RUNNING');
create index enrichment_runs_indicator_history_idx
  on public.enrichment_runs(project_id, indicator_id, requested_at desc, id);
create index enrichment_runs_provider_history_idx
  on public.enrichment_runs(project_id, provider_id, requested_at desc, id);
create index enrichment_runs_status_idx
  on public.enrichment_runs(project_id, status, updated_at desc);

create trigger enrichment_runs_set_updated_at
  before update on public.enrichment_runs
  for each row execute function public.set_updated_at();

create table public.enrichment_results (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid not null,
  indicator_id uuid not null,
  source_id uuid not null,
  category public.enrichment_result_category not null,
  schema_version integer not null default 1 check (schema_version = 1),
  normalized_data jsonb not null check (jsonb_typeof(normalized_data) = 'object'),
  provider_observed_at timestamptz,
  queried_at timestamptz not null,
  expires_at timestamptz,
  confidence public.confidence_level,
  response_hash text check (response_hash is null or response_hash ~ '^[a-f0-9]{64}$'),
  safe_raw_data jsonb check (safe_raw_data is null or jsonb_typeof(safe_raw_data) = 'object'),
  created_at timestamptz not null default now(),
  unique(project_id, id),
  foreign key(project_id, run_id)
    references public.enrichment_runs(project_id, id) on delete cascade,
  foreign key(project_id, indicator_id)
    references public.indicators(project_id, id) on delete cascade,
  foreign key(project_id, source_id)
    references public.sources(project_id, id) on delete restrict,
  check (expires_at is null or expires_at >= queried_at)
);

create index enrichment_results_indicator_history_idx
  on public.enrichment_results(project_id, indicator_id, queried_at desc, id);
create index enrichment_results_run_idx
  on public.enrichment_results(project_id, run_id, category, id);
create index enrichment_results_source_idx
  on public.enrichment_results(project_id, source_id, queried_at desc);
create index enrichment_results_freshness_idx
  on public.enrichment_results(project_id, provider_observed_at desc nulls last, expires_at desc nulls last);

create or replace function public.prevent_referenced_source_delete()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1 from public.indicator_observations o
    where o.project_id = old.project_id and o.source_id = old.id
  ) or exists (
    select 1 from public.enrichment_results r
    where r.project_id = old.project_id and r.source_id = old.id
  ) then
    raise exception using errcode = '23503', message = 'source_referenced';
  end if;
  return old;
end;
$$;

create trigger sources_prevent_referenced_delete
  before delete on public.sources
  for each row execute function public.prevent_referenced_source_delete();

alter table public.sources enable row level security;
alter table public.enrichment_runs enable row level security;
alter table public.enrichment_results enable row level security;

create policy "sources select owned investigation"
  on public.sources for select to authenticated
  using (public.project_is_owned(project_id));
create policy "sources insert owned investigation"
  on public.sources for insert to authenticated
  with check (public.project_is_owned(project_id) and created_by = auth.uid());
create policy "sources update owned investigation"
  on public.sources for update to authenticated
  using (public.project_is_owned(project_id))
  with check (public.project_is_owned(project_id) and created_by = auth.uid());
create policy "sources delete owned investigation"
  on public.sources for delete to authenticated
  using (public.project_is_owned(project_id));

create policy "enrichment runs select owned investigation"
  on public.enrichment_runs for select to authenticated
  using (public.project_is_owned(project_id));
create policy "enrichment runs insert owned investigation"
  on public.enrichment_runs for insert to authenticated
  with check (public.project_is_owned(project_id) and requested_by = auth.uid());
create policy "enrichment runs update owned investigation"
  on public.enrichment_runs for update to authenticated
  using (public.project_is_owned(project_id))
  with check (public.project_is_owned(project_id) and requested_by = auth.uid());
create policy "enrichment runs delete owned investigation"
  on public.enrichment_runs for delete to authenticated
  using (public.project_is_owned(project_id));

create policy "enrichment results select owned investigation"
  on public.enrichment_results for select to authenticated
  using (public.project_is_owned(project_id));
create policy "enrichment results insert owned investigation"
  on public.enrichment_results for insert to authenticated
  with check (public.project_is_owned(project_id));
create policy "enrichment results update owned investigation"
  on public.enrichment_results for update to authenticated
  using (public.project_is_owned(project_id))
  with check (public.project_is_owned(project_id));
create policy "enrichment results delete owned investigation"
  on public.enrichment_results for delete to authenticated
  using (public.project_is_owned(project_id));
