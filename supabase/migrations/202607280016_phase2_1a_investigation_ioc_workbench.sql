-- CİTEM Product Roadmap Phase 2.1A
-- Investigation foundation and IOC Workbench.
-- Additive only: historical migrations 001-015 remain unchanged.

do $$ begin
  create type public.investigation_status as enum (
    'DRAFT',
    'ACTIVE',
    'ANALYSIS',
    'REVIEW',
    'COMPLETED',
    'ARCHIVED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.indicator_status as enum (
    'UNVERIFIED',
    'SUSPICIOUS',
    'MALICIOUS',
    'BENIGN',
    'FALSE_POSITIVE',
    'INACTIVE',
    'EXPIRED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.indicator_observation_origin as enum (
    'MANUAL',
    'BULK_INTAKE',
    'AI_APPROVAL',
    'IMPORT',
    'OTHER'
  );
exception when duplicate_object then null; end $$;

alter table public.projects
  add column if not exists research_question text,
  add column if not exists investigation_status public.investigation_status not null default 'DRAFT',
  add column if not exists current_assessment text,
  add column if not exists assessment_confidence public.confidence_level,
  add column if not exists closed_at timestamptz;

alter table public.projects
  drop constraint if exists projects_research_question_length,
  add constraint projects_research_question_length
    check (research_question is null or char_length(research_question) <= 2000),
  drop constraint if exists projects_current_assessment_length,
  add constraint projects_current_assessment_length
    check (current_assessment is null or char_length(current_assessment) <= 10000);

create index if not exists projects_owner_investigation_status_idx
  on public.projects(owner_id, investigation_status, updated_at desc);
create index if not exists projects_owner_closed_at_idx
  on public.projects(owner_id, closed_at desc nulls last)
  where closed_at is not null;

alter table public.indicators
  add column if not exists status public.indicator_status not null default 'UNVERIFIED',
  add column if not exists analyst_rationale text,
  add column if not exists current_relevance text;

alter table public.indicators
  drop constraint if exists indicators_analyst_rationale_length,
  add constraint indicators_analyst_rationale_length
    check (analyst_rationale is null or char_length(analyst_rationale) <= 5000),
  drop constraint if exists indicators_current_relevance_length,
  add constraint indicators_current_relevance_length
    check (current_relevance is null or char_length(current_relevance) <= 2000);

create index if not exists indicators_project_status_updated_idx
  on public.indicators(project_id, status, updated_at desc);

create table public.indicator_observations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  indicator_id uuid not null,
  observed_value text not null
    check (char_length(trim(observed_value)) between 1 and 8000),
  observed_at timestamptz,
  ingested_at timestamptz not null default now(),
  origin_kind public.indicator_observation_origin not null default 'MANUAL',
  source_label text
    check (source_label is null or char_length(source_label) <= 500),
  analyst_note text not null default ''
    check (char_length(analyst_note) <= 5000),
  confidence public.confidence_level,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(project_id, id),
  foreign key(project_id, indicator_id)
    references public.indicators(project_id, id) on delete cascade
);

create index indicator_observations_project_indicator_time_idx
  on public.indicator_observations(
    project_id,
    indicator_id,
    observed_at desc nulls last,
    ingested_at desc,
    id
  );
create index indicator_observations_project_origin_idx
  on public.indicator_observations(project_id, origin_kind, ingested_at desc);

alter table public.indicator_observations enable row level security;

create policy "indicator observations select owned investigation"
  on public.indicator_observations
  for select to authenticated
  using (public.project_is_owned(project_id));

create policy "indicator observations insert owned investigation"
  on public.indicator_observations
  for insert to authenticated
  with check (
    public.project_is_owned(project_id)
    and created_by = auth.uid()
  );

create policy "indicator observations update owned investigation"
  on public.indicator_observations
  for update to authenticated
  using (public.project_is_owned(project_id))
  with check (
    public.project_is_owned(project_id)
    and created_by = auth.uid()
  );

create policy "indicator observations delete owned investigation"
  on public.indicator_observations
  for delete to authenticated
  using (public.project_is_owned(project_id));

-- One server-validated candidate is imported per call. The function preserves the
-- project-level canonical uniqueness already enforced by indicators and records
-- the observed form in the same database transaction.
create or replace function public.import_indicator_observation(
  p_project_id uuid,
  p_value text,
  p_type public.indicator_type,
  p_confidence public.confidence_level,
  p_source text,
  p_tags text[],
  p_first_seen timestamptz,
  p_observed_value text,
  p_observed_at timestamptz,
  p_origin_kind public.indicator_observation_origin,
  p_source_label text,
  p_analyst_note text,
  p_add_observation_when_existing boolean default true
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_indicator_id uuid;
  v_created boolean := false;
  v_observation_id uuid;
begin
  if auth.uid() is null or not public.project_is_owned(p_project_id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if p_value is null or length(trim(p_value)) = 0 or length(p_value) > 8000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_value');
  end if;

  if p_observed_value is null
     or length(trim(p_observed_value)) = 0
     or length(p_observed_value) > 8000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_observation');
  end if;

  if p_source is not null and length(p_source) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;

  if p_source_label is not null and length(p_source_label) > 500 then
    return jsonb_build_object('ok', false, 'error', 'invalid_source_label');
  end if;

  if p_analyst_note is not null and length(p_analyst_note) > 5000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_note');
  end if;

  insert into public.indicators (
    project_id,
    value,
    type,
    confidence,
    source,
    tags,
    first_seen
  ) values (
    p_project_id,
    p_value,
    p_type,
    coalesce(p_confidence, 'MEDIUM'::public.confidence_level),
    nullif(trim(p_source), ''),
    coalesce(p_tags, '{}'::text[]),
    p_first_seen
  )
  on conflict (project_id, type, normalized_value) do nothing
  returning id into v_indicator_id;

  if v_indicator_id is not null then
    v_created := true;
  else
    select id into v_indicator_id
    from public.indicators
    where project_id = p_project_id
      and type = p_type
      and normalized_value = public.normalize_indicator_value(p_value, p_type)
    limit 1;
  end if;

  if v_indicator_id is null then
    return jsonb_build_object('ok', false, 'error', 'indicator_conflict');
  end if;

  if v_created or coalesce(p_add_observation_when_existing, true) then
    insert into public.indicator_observations (
      project_id,
      indicator_id,
      observed_value,
      observed_at,
      origin_kind,
      source_label,
      analyst_note,
      confidence,
      created_by
    ) values (
      p_project_id,
      v_indicator_id,
      p_observed_value,
      p_observed_at,
      coalesce(p_origin_kind, 'BULK_INTAKE'::public.indicator_observation_origin),
      nullif(trim(p_source_label), ''),
      coalesce(p_analyst_note, ''),
      p_confidence,
      auth.uid()
    )
    returning id into v_observation_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'indicator_id', v_indicator_id,
    'indicator_created', v_created,
    'observation_created', v_observation_id is not null
  );
end;
$$;

revoke all on function public.import_indicator_observation(
  uuid,
  text,
  public.indicator_type,
  public.confidence_level,
  text,
  text[],
  timestamptz,
  text,
  timestamptz,
  public.indicator_observation_origin,
  text,
  text,
  boolean
) from public, anon;

grant execute on function public.import_indicator_observation(
  uuid,
  text,
  public.indicator_type,
  public.confidence_level,
  text,
  text[],
  timestamptz,
  text,
  timestamptz,
  public.indicator_observation_origin,
  text,
  text,
  boolean
) to authenticated;
