do $$ begin
  create type public.technical_source_class as enum (
    'VULNERABILITY_DATABASE','EXPLOITED_VULNERABILITY_CATALOG','EXPLOIT_PROBABILITY','IOC_SHARING',
    'MALWARE_SAMPLE_REPOSITORY','OFFICIAL_ADVISORY','CERT_CSIRT_REPORTING','THREAT_RESEARCH',
    'CAMPAIGN_REPORTING','INFRASTRUCTURE_TELEMETRY','DNS_OBSERVATION','CERTIFICATE_OBSERVATION',
    'ROUTING_TELEMETRY','UNKNOWN'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.technical_observation_basis as enum ('OBSERVED','REPORTED','PUBLISHED','SCORED','ENRICHED','UNKNOWN');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.technical_semantic_kind as enum (
    'VULNERABILITY_RECORD','KNOWN_EXPLOITED_VULNERABILITY','EXPLOIT_PROBABILITY_SCORE',
    'IOC_REPORT','MALWARE_SAMPLE_RECORD','UNKNOWN'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.technical_semantic_classification_basis as enum (
    'DETERMINISTIC_SOURCE_MAPPING','DETERMINISTIC_RECORD_MAPPING','UNKNOWN'
  );
exception when duplicate_object then null; end $$;

create table public.technical_observation_semantics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  observation_id uuid not null,
  signal_id uuid not null,
  source_class public.technical_source_class not null,
  observation_basis public.technical_observation_basis not null,
  semantic_kind public.technical_semantic_kind not null,
  semantics_version text not null check (char_length(semantics_version) between 1 and 80 and semantics_version ~ '^[A-Za-z0-9._-]+$'),
  classification_basis public.technical_semantic_classification_basis not null,
  classified_at timestamptz not null default now(),
  unique (owner_id, id),
  unique (owner_id, observation_id, semantics_version),
  foreign key (owner_id, signal_id, observation_id)
    references public.technical_signal_observations(owner_id, signal_id, id) on delete cascade
);

create index technical_observation_semantics_owner_signal_idx
  on public.technical_observation_semantics(owner_id, signal_id, classified_at desc, id desc);
create index technical_observation_semantics_owner_kind_idx
  on public.technical_observation_semantics(owner_id, semantic_kind, observation_basis, classified_at desc);

create trigger technical_observation_semantics_append_only
before update or delete on public.technical_observation_semantics
for each row execute function public.technical_signal_reject_change();

alter table public.technical_observation_semantics enable row level security;
revoke all on public.technical_observation_semantics from anon, authenticated;
grant select on public.technical_observation_semantics to authenticated;
create policy technical_observation_semantics_select_own
  on public.technical_observation_semantics for select to authenticated
  using (auth.uid() = owner_id);

create function public.technical_source_semantics_defaults(p_source_system text)
returns jsonb
language sql
immutable
strict
set search_path = ''
as $$
  select case lower(trim(p_source_system))
    when 'cisa-kev' then jsonb_build_object(
      'sourceClass','EXPLOITED_VULNERABILITY_CATALOG',
      'observationBasis','PUBLISHED',
      'semanticKind','KNOWN_EXPLOITED_VULNERABILITY',
      'semanticsVersion','2.3F-C-v1',
      'classificationBasis','DETERMINISTIC_SOURCE_MAPPING'
    )
    when 'nvd-cve' then jsonb_build_object(
      'sourceClass','VULNERABILITY_DATABASE',
      'observationBasis','PUBLISHED',
      'semanticKind','VULNERABILITY_RECORD',
      'semanticsVersion','2.3F-C-v1',
      'classificationBasis','DETERMINISTIC_SOURCE_MAPPING'
    )
    when 'first-epss' then jsonb_build_object(
      'sourceClass','EXPLOIT_PROBABILITY',
      'observationBasis','SCORED',
      'semanticKind','EXPLOIT_PROBABILITY_SCORE',
      'semanticsVersion','2.3F-C-v1',
      'classificationBasis','DETERMINISTIC_SOURCE_MAPPING'
    )
    when 'threatfox' then jsonb_build_object(
      'sourceClass','IOC_SHARING',
      'observationBasis','REPORTED',
      'semanticKind','IOC_REPORT',
      'semanticsVersion','2.3F-C-v1',
      'classificationBasis','DETERMINISTIC_SOURCE_MAPPING'
    )
    when 'malwarebazaar' then jsonb_build_object(
      'sourceClass','MALWARE_SAMPLE_REPOSITORY',
      'observationBasis','PUBLISHED',
      'semanticKind','MALWARE_SAMPLE_RECORD',
      'semanticsVersion','2.3F-C-v1',
      'classificationBasis','DETERMINISTIC_SOURCE_MAPPING'
    )
    else jsonb_build_object(
      'sourceClass','UNKNOWN',
      'observationBasis','UNKNOWN',
      'semanticKind','UNKNOWN',
      'semanticsVersion','2.3F-C-v1',
      'classificationBasis','UNKNOWN'
    )
  end
$$;

insert into public.technical_observation_semantics(
  owner_id, observation_id, signal_id, source_class, observation_basis, semantic_kind,
  semantics_version, classification_basis, classified_at
)
select
  o.owner_id,
  o.id,
  o.signal_id,
  (d.value->>'sourceClass')::public.technical_source_class,
  (d.value->>'observationBasis')::public.technical_observation_basis,
  (d.value->>'semanticKind')::public.technical_semantic_kind,
  d.value->>'semanticsVersion',
  (d.value->>'classificationBasis')::public.technical_semantic_classification_basis,
  now()
from public.technical_signal_observations o
cross join lateral (select public.technical_source_semantics_defaults(o.source_system) as value) d
on conflict (owner_id, observation_id, semantics_version) do nothing;

create function public.record_technical_signal_with_semantics(
  p_actor uuid,
  p_signal jsonb,
  p_observation jsonb,
  p_entity_assertions jsonb default '[]'::jsonb,
  p_semantics jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  expected jsonb;
  observation_id uuid;
  signal_id uuid;
  existing public.technical_observation_semantics;
begin
  if p_semantics is null or jsonb_typeof(p_semantics) <> 'object'
     or p_semantics - array['sourceClass','observationBasis','semanticKind','semanticsVersion','classificationBasis'] <> '{}'::jsonb
     or not (p_semantics ?& array['sourceClass','observationBasis','semanticKind','semanticsVersion','classificationBasis']) then
    raise exception 'INVALID_OBSERVATION_SEMANTICS' using errcode = '22023';
  end if;

  expected := public.technical_source_semantics_defaults(p_observation->>'sourceSystem');
  if p_semantics <> expected then
    raise exception 'SEMANTICS_MISMATCH' using errcode = '22023';
  end if;

  perform (p_semantics->>'sourceClass')::public.technical_source_class;
  perform (p_semantics->>'observationBasis')::public.technical_observation_basis;
  perform (p_semantics->>'semanticKind')::public.technical_semantic_kind;
  perform (p_semantics->>'classificationBasis')::public.technical_semantic_classification_basis;
  if char_length(p_semantics->>'semanticsVersion') not between 1 and 80
     or (p_semantics->>'semanticsVersion') !~ '^[A-Za-z0-9._-]+$' then
    raise exception 'INVALID_OBSERVATION_SEMANTICS' using errcode = '22023';
  end if;

  result := public.record_technical_signal(p_actor, p_signal, p_observation, p_entity_assertions);
  observation_id := (result->>'observation_id')::uuid;
  signal_id := (result->>'signal_id')::uuid;

  insert into public.technical_observation_semantics(
    owner_id, observation_id, signal_id, source_class, observation_basis, semantic_kind,
    semantics_version, classification_basis
  ) values (
    p_actor,
    observation_id,
    signal_id,
    (p_semantics->>'sourceClass')::public.technical_source_class,
    (p_semantics->>'observationBasis')::public.technical_observation_basis,
    (p_semantics->>'semanticKind')::public.technical_semantic_kind,
    p_semantics->>'semanticsVersion',
    (p_semantics->>'classificationBasis')::public.technical_semantic_classification_basis
  ) on conflict (owner_id, observation_id, semantics_version) do nothing;

  select * into existing
  from public.technical_observation_semantics s
  where s.owner_id = p_actor
    and s.observation_id = observation_id
    and s.semantics_version = p_semantics->>'semanticsVersion';

  if existing.id is null
     or existing.signal_id <> signal_id
     or existing.source_class::text <> p_semantics->>'sourceClass'
     or existing.observation_basis::text <> p_semantics->>'observationBasis'
     or existing.semantic_kind::text <> p_semantics->>'semanticKind'
     or existing.classification_basis::text <> p_semantics->>'classificationBasis' then
    raise exception 'SEMANTICS_MISMATCH' using errcode = '22023';
  end if;

  return result;
exception when invalid_text_representation then
  raise exception 'INVALID_OBSERVATION_SEMANTICS' using errcode = '22023';
end $$;

revoke all on function public.technical_source_semantics_defaults(text) from public, anon, authenticated;
revoke all on function public.record_technical_signal_with_semantics(uuid,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.record_technical_signal_with_semantics(uuid,jsonb,jsonb,jsonb,jsonb) to service_role;
