-- Phase 2.3E — Matching, Global Priority and Relevance Engine.
-- Derived intelligence projections only. Immutable Technical Signal source truth is never rewritten.

begin;

do $$ begin create type public.technical_global_priority_level as enum ('INFO','LOW','MEDIUM','HIGH','CRITICAL'); exception when duplicate_object then null; end $$;
do $$ begin create type public.technical_profile_relevance_level as enum ('LOW','MEDIUM','HIGH'); exception when duplicate_object then null; end $$;
do $$ begin create type public.technical_profile_match_quality as enum ('CONTEXTUAL','PROVISIONAL','CONFIRMED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.technical_profile_match_lifecycle as enum ('NEW','REVIEWED','ACCEPTED','DISMISSED','NOT_RELEVANT','SNOOZED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.technical_profile_match_event_action as enum ('CREATED','REEVALUATED','DEACTIVATED','REACTIVATED','LIFECYCLE_CHANGED'); exception when duplicate_object then null; end $$;

do $$ begin
  create type public.technical_profile_match_snapshot as (
    matched boolean,
    relevance public.technical_profile_relevance_level,
    match_quality public.technical_profile_match_quality,
    internal_score integer,
    reason_codes text[],
    matched_profile_item_ids uuid[],
    matched_entity_ids uuid[],
    matched_assertion_ids uuid[],
    pending_assertion_ids uuid[],
    matched_evidence_count integer,
    pending_identity_count integer
  );
exception when duplicate_object then null; end $$;

create table public.technical_signal_global_priorities(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  signal_id uuid not null,
  priority public.technical_global_priority_level not null,
  internal_score integer not null check(internal_score between 0 and 100),
  reason_codes text[] not null default '{}'::text[] check(cardinality(reason_codes)<=32),
  source_systems text[] not null default '{}'::text[] check(cardinality(source_systems)<=32),
  related_cves text[] not null default '{}'::text[] check(cardinality(related_cves)<=32),
  context_snapshot jsonb not null default '{}'::jsonb check(jsonb_typeof(context_snapshot)='object' and pg_column_size(context_snapshot)<=16384),
  engine_version text not null check(char_length(engine_version) between 1 and 80),
  evaluated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,id),
  unique(owner_id,signal_id),
  foreign key(owner_id,signal_id) references public.technical_signals(owner_id,id) on delete cascade
);
create index technical_signal_global_priority_rank_idx on public.technical_signal_global_priorities(owner_id,internal_score desc,evaluated_at desc,signal_id);
create trigger technical_signal_global_priorities_set_updated_at before update on public.technical_signal_global_priorities for each row execute function public.set_updated_at();

create table public.technical_signal_profile_matches(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  signal_id uuid not null,
  profile_id uuid not null,
  relevance public.technical_profile_relevance_level not null,
  match_quality public.technical_profile_match_quality not null,
  lifecycle public.technical_profile_match_lifecycle not null default 'NEW',
  pre_snooze_lifecycle public.technical_profile_match_lifecycle null,
  is_active boolean not null default true,
  internal_score integer not null check(internal_score between 0 and 100),
  reason_codes text[] not null default '{}'::text[] check(cardinality(reason_codes)<=32),
  matched_profile_item_ids uuid[] not null default '{}'::uuid[] check(cardinality(matched_profile_item_ids)<=64),
  matched_entity_ids uuid[] not null default '{}'::uuid[] check(cardinality(matched_entity_ids)<=64),
  matched_assertion_ids uuid[] not null default '{}'::uuid[] check(cardinality(matched_assertion_ids)<=64),
  pending_assertion_ids uuid[] not null default '{}'::uuid[] check(cardinality(pending_assertion_ids)<=64),
  matched_evidence_count integer not null default 0 check(matched_evidence_count>=0),
  pending_identity_count integer not null default 0 check(pending_identity_count>=0),
  snoozed_until timestamptz null,
  engine_version text not null check(char_length(engine_version) between 1 and 80),
  first_matched_at timestamptz not null,
  last_matched_at timestamptz not null,
  evaluated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,id),
  unique(owner_id,signal_id,profile_id),
  foreign key(owner_id,signal_id) references public.technical_signals(owner_id,id) on delete cascade,
  foreign key(owner_id,profile_id) references public.intel_profiles(owner_id,id) on delete cascade,
  check((lifecycle='SNOOZED' and snoozed_until is not null and pre_snooze_lifecycle is not null) or (lifecycle<>'SNOOZED' and snoozed_until is null and pre_snooze_lifecycle is null))
);
create index technical_signal_profile_matches_profile_feed_idx on public.technical_signal_profile_matches(owner_id,profile_id,is_active,internal_score desc,last_matched_at desc,signal_id);
create index technical_signal_profile_matches_signal_idx on public.technical_signal_profile_matches(owner_id,signal_id,is_active,profile_id);
create trigger technical_signal_profile_matches_set_updated_at before update on public.technical_signal_profile_matches for each row execute function public.set_updated_at();

create table public.technical_signal_profile_match_events(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null,
  profile_id uuid not null,
  signal_id uuid not null,
  actor_id uuid not null references auth.users(id),
  action public.technical_profile_match_event_action not null,
  previous_lifecycle public.technical_profile_match_lifecycle null,
  lifecycle public.technical_profile_match_lifecycle null,
  details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object' and pg_column_size(details)<=4096),
  created_at timestamptz not null default now(),
  foreign key(owner_id,match_id) references public.technical_signal_profile_matches(owner_id,id) on delete cascade,
  foreign key(owner_id,profile_id) references public.intel_profiles(owner_id,id) on delete cascade,
  foreign key(owner_id,signal_id) references public.technical_signals(owner_id,id) on delete cascade
);
create index technical_signal_profile_match_events_match_idx on public.technical_signal_profile_match_events(owner_id,match_id,created_at desc,id);
create trigger technical_signal_profile_match_events_append_only before update or delete on public.technical_signal_profile_match_events for each row execute function public.technical_signal_reject_change();

alter table public.technical_signal_global_priorities enable row level security;
alter table public.technical_signal_profile_matches enable row level security;
alter table public.technical_signal_profile_match_events enable row level security;

revoke all on public.technical_signal_global_priorities,public.technical_signal_profile_matches,public.technical_signal_profile_match_events from anon,authenticated;
grant select on public.technical_signal_global_priorities,public.technical_signal_profile_matches,public.technical_signal_profile_match_events to authenticated;
grant all on public.technical_signal_global_priorities,public.technical_signal_profile_matches,public.technical_signal_profile_match_events to service_role;

create policy technical_signal_global_priorities_select_own on public.technical_signal_global_priorities for select to authenticated using(auth.uid()=owner_id);
create policy technical_signal_profile_matches_select_own on public.technical_signal_profile_matches for select to authenticated using(auth.uid()=owner_id);
create policy technical_signal_profile_match_events_select_own on public.technical_signal_profile_match_events for select to authenticated using(auth.uid()=owner_id);

create or replace function public.technical_global_priority_for_score(p_score integer)
returns public.technical_global_priority_level language sql immutable set search_path='' as $$
  select case
    when greatest(0,least(100,p_score))>=70 then 'CRITICAL'::public.technical_global_priority_level
    when greatest(0,least(100,p_score))>=50 then 'HIGH'::public.technical_global_priority_level
    when greatest(0,least(100,p_score))>=30 then 'MEDIUM'::public.technical_global_priority_level
    when greatest(0,least(100,p_score))>=15 then 'LOW'::public.technical_global_priority_level
    else 'INFO'::public.technical_global_priority_level
  end
$$;

create or replace function public.technical_profile_relevance_for_score(p_score integer)
returns public.technical_profile_relevance_level language sql immutable set search_path='' as $$
  select case
    when greatest(0,least(100,p_score))>=40 then 'HIGH'::public.technical_profile_relevance_level
    when greatest(0,least(100,p_score))>=20 then 'MEDIUM'::public.technical_profile_relevance_level
    else 'LOW'::public.technical_profile_relevance_level
  end
$$;

create or replace function public.technical_profile_location_role_matches(
  p_profile_role public.intel_profile_semantic_role,
  p_signal_role public.technical_signal_entity_role
) returns boolean language sql immutable set search_path='' as $$
  select case
    when p_profile_role='INFRASTRUCTURE_LOCATION' then p_signal_role='LOCATED_IN'
    when p_profile_role in ('TARGET','AFFECTED_REGION') then p_signal_role in ('TARGETS','AFFECTS')
    else true
  end
$$;

create or replace function public.evaluate_technical_signal_global_priority(p_actor uuid,p_signal_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  s public.technical_signals;
  score integer:=0;
  reasons text[]:='{}'::text[];
  sources text[]:='{}'::text[];
  cves text[]:='{}'::text[];
  source_count integer:=0;
  max_epss double precision:=null;
  max_percentile double precision:=null;
  severity_rank integer:=0;
  severity_label text:='UNKNOWN';
  has_kev boolean:=false;
  has_active_exploitation boolean:=false;
  has_vendor_advisory boolean:=false;
  fresh_hours double precision:=0;
  priority public.technical_global_priority_level;
  context jsonb;
begin
  if p_actor is null or p_signal_id is null or not exists(select 1 from auth.users where id=p_actor) then
    raise exception 'INVALID_TECHINT_EVALUATION' using errcode='22023';
  end if;
  select * into s from public.technical_signals where owner_id=p_actor and id=p_signal_id;
  if s.id is null then raise exception 'TECHNICAL_SIGNAL_NOT_FOUND' using errcode='P0002'; end if;

  select coalesce(array_agg(distinct upper(a.normalized_value) order by upper(a.normalized_value)),'{}'::text[])
    into cves
  from public.technical_signal_entity_assertions a
  where a.owner_id=p_actor and a.signal_id=p_signal_id and a.entity_kind='CVE';

  if cardinality(cves)>0 then
    select coalesce(array_agg(distinct lower(trim(o.source_system)) order by lower(trim(o.source_system))),'{}'::text[])
      into sources
    from public.technical_signal_observations o
    join public.technical_signal_entity_assertions a on a.owner_id=o.owner_id and a.signal_id=o.signal_id
    where o.owner_id=p_actor and a.entity_kind='CVE' and upper(a.normalized_value)=any(cves);

    select exists(
      select 1 from public.technical_signal_observations o
      join public.technical_signal_entity_assertions a on a.owner_id=o.owner_id and a.signal_id=o.signal_id
      where o.owner_id=p_actor and a.entity_kind='CVE' and upper(a.normalized_value)=any(cves) and lower(trim(o.source_system))='cisa-kev'
    ) into has_kev;

    select exists(
      select 1 from public.technical_signals rs
      join public.technical_signal_entity_assertions a on a.owner_id=rs.owner_id and a.signal_id=rs.id
      where rs.owner_id=p_actor and a.entity_kind='CVE' and upper(a.normalized_value)=any(cves) and rs.signal_type='ACTIVE_EXPLOITATION' and rs.lifecycle='ACTIVE'
    ) into has_active_exploitation;

    select exists(
      select 1 from public.technical_signals rs
      join public.technical_signal_entity_assertions a on a.owner_id=rs.owner_id and a.signal_id=rs.id
      where rs.owner_id=p_actor and a.entity_kind='CVE' and upper(a.normalized_value)=any(cves) and rs.signal_type='TECHNICAL_ADVISORY' and rs.lifecycle='ACTIVE'
    ) into has_vendor_advisory;

    select max(case when rs.facts->>'epss' ~ '^(?:0(?:\.[0-9]+)?|1(?:\.0+)?)$' then (rs.facts->>'epss')::double precision end),
           max(case when rs.facts->>'percentile' ~ '^(?:0(?:\.[0-9]+)?|1(?:\.0+)?)$' then (rs.facts->>'percentile')::double precision end)
      into max_epss,max_percentile
    from public.technical_signals rs
    join public.technical_signal_entity_assertions a on a.owner_id=rs.owner_id and a.signal_id=rs.id
    where rs.owner_id=p_actor and a.entity_kind='CVE' and upper(a.normalized_value)=any(cves);

    select coalesce(max(case rs.severity when 'CRITICAL' then 5 when 'HIGH' then 4 when 'MEDIUM' then 3 when 'LOW' then 2 when 'INFO' then 1 else 0 end),0)
      into severity_rank
    from public.technical_signals rs
    join public.technical_signal_entity_assertions a on a.owner_id=rs.owner_id and a.signal_id=rs.id
    where rs.owner_id=p_actor and a.entity_kind='CVE' and upper(a.normalized_value)=any(cves);
  else
    select coalesce(array_agg(distinct lower(trim(o.source_system)) order by lower(trim(o.source_system))),'{}'::text[])
      into sources from public.technical_signal_observations o where o.owner_id=p_actor and o.signal_id=p_signal_id;
    has_kev:=exists(select 1 from public.technical_signal_observations o where o.owner_id=p_actor and o.signal_id=p_signal_id and lower(trim(o.source_system))='cisa-kev');
    has_active_exploitation:=s.signal_type='ACTIVE_EXPLOITATION' and s.lifecycle='ACTIVE';
    has_vendor_advisory:=s.signal_type='TECHNICAL_ADVISORY' and s.lifecycle='ACTIVE';
    severity_rank:=case s.severity when 'CRITICAL' then 5 when 'HIGH' then 4 when 'MEDIUM' then 3 when 'LOW' then 2 when 'INFO' then 1 else 0 end;
    if s.facts->>'epss' ~ '^(?:0(?:\.[0-9]+)?|1(?:\.0+)?)$' then max_epss:=(s.facts->>'epss')::double precision; end if;
    if s.facts->>'percentile' ~ '^(?:0(?:\.[0-9]+)?|1(?:\.0+)?)$' then max_percentile:=(s.facts->>'percentile')::double precision; end if;
  end if;

  source_count:=cardinality(sources);
  severity_label:=case severity_rank when 5 then 'CRITICAL' when 4 then 'HIGH' when 3 then 'MEDIUM' when 2 then 'LOW' when 1 then 'INFO' else 'UNKNOWN' end;
  fresh_hours:=greatest(0,extract(epoch from (now()-s.first_seen_at))/3600.0);

  if s.lifecycle<>'ACTIVE' then
    score:=0;
    reasons:=array['NON_ACTIVE_LIFECYCLE'];
  else
    if has_kev then score:=score+25; reasons:=array_append(reasons,'CISA_KEV'); end if;
    if has_active_exploitation then score:=score+20; reasons:=array_append(reasons,'CONFIRMED_ACTIVE_EXPLOITATION'); end if;
    if max_epss is not null and max_epss>=0.90 then score:=score+15; reasons:=array_append(reasons,'EPSS_VERY_HIGH');
    elsif max_epss is not null and max_epss>=0.50 then score:=score+8; reasons:=array_append(reasons,'EPSS_HIGH'); end if;
    if max_percentile is not null and max_percentile>=0.99 then score:=score+10; reasons:=array_append(reasons,'EPSS_PERCENTILE_99');
    elsif max_percentile is not null and max_percentile>=0.95 then score:=score+5; reasons:=array_append(reasons,'EPSS_PERCENTILE_95'); end if;
    if severity_rank=5 then score:=score+15; reasons:=array_append(reasons,'TECHNICAL_SEVERITY_CRITICAL');
    elsif severity_rank=4 then score:=score+10; reasons:=array_append(reasons,'TECHNICAL_SEVERITY_HIGH');
    elsif severity_rank=3 then score:=score+5; reasons:=array_append(reasons,'TECHNICAL_SEVERITY_MEDIUM'); end if;
    if fresh_hours<24 then score:=score+10; reasons:=array_append(reasons,'FRESH_LT_24H');
    elsif fresh_hours<168 then score:=score+5; reasons:=array_append(reasons,'FRESH_LT_7D'); end if;
    if source_count>=3 then score:=score+10; reasons:=array_append(reasons,'MULTI_SOURCE_3_PLUS');
    elsif source_count>=2 then score:=score+7; reasons:=array_append(reasons,'MULTI_SOURCE'); end if;
    if has_vendor_advisory then score:=score+5; reasons:=array_append(reasons,'VENDOR_ADVISORY'); end if;
    if s.current_revision_number>1 and s.updated_at>=now()-interval '24 hours' then score:=score+5; reasons:=array_append(reasons,'MATERIAL_REVISION'); end if;
    if s.confidence is not null and s.confidence>=80 then score:=score+5; reasons:=array_append(reasons,'HIGH_SOURCE_CONFIDENCE'); end if;
  end if;

  score:=greatest(0,least(100,score));
  priority:=public.technical_global_priority_for_score(score);
  context:=jsonb_build_object(
    'sourceCount',source_count,'epss',max_epss,'epssPercentile',max_percentile,
    'maxTechnicalSeverity',severity_label,'activeExploitation',has_active_exploitation,
    'kev',has_kev,'vendorAdvisory',has_vendor_advisory,'freshHours',round(fresh_hours::numeric,2),
    'currentRevision',s.current_revision_number
  );

  insert into public.technical_signal_global_priorities(owner_id,signal_id,priority,internal_score,reason_codes,source_systems,related_cves,context_snapshot,engine_version,evaluated_at)
  values(p_actor,p_signal_id,priority,score,reasons,sources,cves,context,'2.3E-v1',now())
  on conflict(owner_id,signal_id) do update set
    priority=excluded.priority,internal_score=excluded.internal_score,reason_codes=excluded.reason_codes,
    source_systems=excluded.source_systems,related_cves=excluded.related_cves,context_snapshot=excluded.context_snapshot,
    engine_version=excluded.engine_version,evaluated_at=excluded.evaluated_at
  where public.technical_signal_global_priorities.priority is distinct from excluded.priority
     or public.technical_signal_global_priorities.internal_score is distinct from excluded.internal_score
     or public.technical_signal_global_priorities.reason_codes is distinct from excluded.reason_codes
     or public.technical_signal_global_priorities.source_systems is distinct from excluded.source_systems
     or public.technical_signal_global_priorities.related_cves is distinct from excluded.related_cves
     or public.technical_signal_global_priorities.context_snapshot is distinct from excluded.context_snapshot
     or public.technical_signal_global_priorities.engine_version is distinct from excluded.engine_version;

  return jsonb_build_object('signal_id',p_signal_id,'priority',priority,'internal_score',score,'reason_codes',reasons,'engine_version','2.3E-v1');
end$$;

create or replace function public.technical_signal_profile_match_snapshot(
  p_owner uuid,p_signal_id uuid,p_profile_id uuid
) returns public.technical_profile_match_snapshot
language plpgsql security definer stable set search_path='' as $$
declare
  p public.intel_profiles;
  s public.technical_signals;
  r record;
  score integer:=0;
  quality_rank integer:=0;
  reasons text[]:='{}'::text[];
  item_ids uuid[]:='{}'::uuid[];
  entity_ids uuid[]:='{}'::uuid[];
  assertion_ids uuid[]:='{}'::uuid[];
  pending_ids uuid[]:='{}'::uuid[];
  evidence_count integer:=0;
  pending_count integer:=0;
  relevance public.technical_profile_relevance_level;
  quality public.technical_profile_match_quality;
  code text;
begin
  select * into p from public.intel_profiles where owner_id=p_owner and id=p_profile_id and status='ACTIVE';
  select * into s from public.technical_signals where owner_id=p_owner and id=p_signal_id and lifecycle='ACTIVE';
  if p.id is null or s.id is null then
    return (false,null,null,0,'{}'::text[],'{}'::uuid[],'{}'::uuid[],'{}'::uuid[],'{}'::uuid[],0,0)::public.technical_profile_match_snapshot;
  end if;
  if s.last_seen_at < now()-make_interval(days=>p.time_horizon_days) then
    return (false,null,null,0,'{}'::text[],'{}'::uuid[],'{}'::uuid[],'{}'::uuid[],'{}'::uuid[],0,0)::public.technical_profile_match_snapshot;
  end if;
  if p.minimum_confidence is not null and s.confidence is not null and s.confidence<p.minimum_confidence then
    return (false,null,null,0,'{}'::text[],'{}'::uuid[],'{}'::uuid[],'{}'::uuid[],'{}'::uuid[],0,0)::public.technical_profile_match_snapshot;
  end if;

  select count(*) into pending_count
  from public.technical_signal_entity_assertions a
  left join public.technical_entity_assertion_resolutions ar on ar.owner_id=a.owner_id and ar.assertion_id=a.id
  where a.owner_id=p_owner and a.signal_id=p_signal_id
    and a.entity_kind not in ('CVE','INDICATOR','ATTACK_TECHNIQUE')
    and (ar.id is null or ar.status='NEEDS_REVIEW');
  select coalesce(array_agg(x.id order by x.created_at,x.id),'{}'::uuid[]) into pending_ids from (
    select a.id,a.created_at
    from public.technical_signal_entity_assertions a
    left join public.technical_entity_assertion_resolutions ar on ar.owner_id=a.owner_id and ar.assertion_id=a.id
    where a.owner_id=p_owner and a.signal_id=p_signal_id
      and a.entity_kind not in ('CVE','INDICATOR','ATTACK_TECHNIQUE')
      and (ar.id is null or ar.status='NEEDS_REVIEW')
    order by a.created_at,a.id limit 64
  ) x;

  -- Confirmed direct identity: canonical resolution (or authoritative project/source entity snapshot) matches an active profile item.
  for r in
    select distinct i.id item_id,i.kind::text kind,i.origin::text origin,a.id assertion_id,ar.entity_id
    from public.intel_profile_items i
    join public.technical_signal_entity_assertions a on a.owner_id=i.owner_id and a.signal_id=p_signal_id and a.entity_kind::text=i.kind::text
    left join public.technical_entity_assertion_resolutions ar on ar.owner_id=a.owner_id and ar.assertion_id=a.id and ar.status='RESOLVED'
    left join public.technical_entities e on e.owner_id=ar.owner_id and e.id=ar.entity_id and e.status='ACTIVE'
    where i.owner_id=p_owner and i.profile_id=p_profile_id and i.state='ACTIVE'
      and i.kind not in ('SECTOR','COUNTRY','REGION','TAG','KEYWORD')
      and (
        (ar.entity_id is not null and ((i.kind='INDICATOR' and e.canonical_normalized=i.normalized_value) or (i.kind<>'INDICATOR' and lower(e.canonical_normalized)=lower(i.normalized_value))))
        or (i.source_entity_id is not null and a.source_entity_id=i.source_entity_id and a.source_entity_type=i.source_entity_type)
      )
  loop
    evidence_count:=evidence_count+1; score:=score+50; quality_rank:=greatest(quality_rank,3);
    if cardinality(item_ids)<64 and not (r.item_id=any(item_ids)) then item_ids:=array_append(item_ids,r.item_id); end if;
    if cardinality(assertion_ids)<64 and not (r.assertion_id=any(assertion_ids)) then assertion_ids:=array_append(assertion_ids,r.assertion_id); end if;
    if r.entity_id is not null and cardinality(entity_ids)<64 and not (r.entity_id=any(entity_ids)) then entity_ids:=array_append(entity_ids,r.entity_id); end if;
    code:='DIRECT_CANONICAL:'||r.item_id::text;
    if cardinality(reasons)<32 and not (code=any(reasons)) then reasons:=array_append(reasons,code); end if;
    if p.kind='INVESTIGATION' and r.origin='DERIVED' and cardinality(reasons)<32 and not ('INVESTIGATION_SCOPE'=any(reasons)) then reasons:=array_append(reasons,'INVESTIGATION_SCOPE'); score:=score+5; end if;
  end loop;

  -- Provisional direct identity: source-backed exact value matches, but canonical resolution is incomplete.
  for r in
    select distinct i.id item_id,i.kind::text kind,i.origin::text origin,a.id assertion_id
    from public.intel_profile_items i
    join public.technical_signal_entity_assertions a on a.owner_id=i.owner_id and a.signal_id=p_signal_id and a.entity_kind::text=i.kind::text
    left join public.technical_entity_assertion_resolutions ar on ar.owner_id=a.owner_id and ar.assertion_id=a.id
    where i.owner_id=p_owner and i.profile_id=p_profile_id and i.state='ACTIVE'
      and i.kind not in ('SECTOR','COUNTRY','REGION','TAG','KEYWORD')
      and (ar.id is null or ar.status='NEEDS_REVIEW')
      and ((i.kind='INDICATOR' and a.normalized_value=i.normalized_value) or (i.kind<>'INDICATOR' and lower(a.normalized_value)=lower(i.normalized_value)))
  loop
    evidence_count:=evidence_count+1; score:=score+40; quality_rank:=greatest(quality_rank,2);
    if cardinality(item_ids)<64 and not (r.item_id=any(item_ids)) then item_ids:=array_append(item_ids,r.item_id); end if;
    if cardinality(assertion_ids)<64 and not (r.assertion_id=any(assertion_ids)) then assertion_ids:=array_append(assertion_ids,r.assertion_id); end if;
    code:='DIRECT_SOURCE:'||r.item_id::text;
    if cardinality(reasons)<32 and not (code=any(reasons)) then reasons:=array_append(reasons,code); end if;
    if p.kind='INVESTIGATION' and r.origin='DERIVED' and cardinality(reasons)<32 and not ('INVESTIGATION_SCOPE'=any(reasons)) then reasons:=array_append(reasons,'INVESTIGATION_SCOPE'); score:=score+5; end if;
  end loop;

  -- Conservative compound product context. This allows Splunk + Enterprise + an explicit "Splunk Enterprise" title to remain visible before PRODUCT normalization completes.
  for r in
    select distinct i.id item_id,pa.id assertion_id
    from public.intel_profile_items i
    join public.technical_signal_entity_assertions pa on pa.owner_id=i.owner_id and pa.signal_id=p_signal_id and pa.entity_kind='PRODUCT'
    left join public.technical_entity_assertion_resolutions pr on pr.owner_id=pa.owner_id and pr.assertion_id=pa.id
    where i.owner_id=p_owner and i.profile_id=p_profile_id and i.state='ACTIVE' and i.kind='PRODUCT'
      and (pr.id is null or pr.status='NEEDS_REVIEW')
      and lower(s.title||' '||s.summary) like '%'||lower(i.normalized_value)||'%'
      and exists(
        select 1 from public.technical_signal_entity_assertions va
        left join public.technical_entity_assertion_resolutions vr on vr.owner_id=va.owner_id and vr.assertion_id=va.id
        where va.owner_id=p_owner and va.signal_id=p_signal_id and va.entity_kind='VENDOR'
          and (vr.id is null or vr.status<>'DISMISSED')
          and lower(i.normalized_value)=lower(va.normalized_value||' '||pa.normalized_value)
      )
  loop
    evidence_count:=evidence_count+1; score:=score+40; quality_rank:=greatest(quality_rank,2);
    if cardinality(item_ids)<64 and not (r.item_id=any(item_ids)) then item_ids:=array_append(item_ids,r.item_id); end if;
    if cardinality(assertion_ids)<64 and not (r.assertion_id=any(assertion_ids)) then assertion_ids:=array_append(assertion_ids,r.assertion_id); end if;
    code:='PRODUCT_CONTEXT:'||r.item_id::text;
    if cardinality(reasons)<32 and not (code=any(reasons)) then reasons:=array_append(reasons,code); end if;
  end loop;

  -- Bounded contextual scope: exact sector/country/region/tag assertions, with location semantics preserved.
  for r in
    select distinct i.id item_id,i.kind::text kind,a.id assertion_id
    from public.intel_profile_items i
    join public.technical_signal_entity_assertions a on a.owner_id=i.owner_id and a.signal_id=p_signal_id and a.entity_kind::text=i.kind::text
    left join public.technical_entity_assertion_resolutions ar on ar.owner_id=a.owner_id and ar.assertion_id=a.id
    where i.owner_id=p_owner and i.profile_id=p_profile_id and i.state='ACTIVE'
      and i.kind in ('SECTOR','COUNTRY','REGION','TAG')
      and (ar.id is null or ar.status<>'DISMISSED')
      and lower(a.normalized_value)=lower(i.normalized_value)
      and (i.kind not in ('COUNTRY','REGION') or public.technical_profile_location_role_matches(i.semantic_role,a.semantic_role))
  loop
    evidence_count:=evidence_count+1; score:=score+20; quality_rank:=greatest(quality_rank,1);
    if cardinality(item_ids)<64 and not (r.item_id=any(item_ids)) then item_ids:=array_append(item_ids,r.item_id); end if;
    if cardinality(assertion_ids)<64 and not (r.assertion_id=any(assertion_ids)) then assertion_ids:=array_append(assertion_ids,r.assertion_id); end if;
    code:='CONTEXT:'||r.item_id::text;
    if cardinality(reasons)<32 and not (code=any(reasons)) then reasons:=array_append(reasons,code); end if;
  end loop;

  -- Explicit keywords are contextual only and never become identity assertions.
  for r in
    select i.id item_id
    from public.intel_profile_items i
    where i.owner_id=p_owner and i.profile_id=p_profile_id and i.state='ACTIVE' and i.kind='KEYWORD'
      and char_length(i.normalized_value)>=3
      and lower(s.title||' '||s.summary) like '%'||lower(i.normalized_value)||'%'
  loop
    evidence_count:=evidence_count+1; score:=score+10; quality_rank:=greatest(quality_rank,1);
    if cardinality(item_ids)<64 and not (r.item_id=any(item_ids)) then item_ids:=array_append(item_ids,r.item_id); end if;
    code:='KEYWORD:'||r.item_id::text;
    if cardinality(reasons)<32 and not (code=any(reasons)) then reasons:=array_append(reasons,code); end if;
  end loop;

  if evidence_count=0 then
    return (false,null,null,0,'{}'::text[],'{}'::uuid[],'{}'::uuid[],'{}'::uuid[],pending_ids,0,pending_count)::public.technical_profile_match_snapshot;
  end if;

  score:=greatest(0,least(100,score));
  relevance:=public.technical_profile_relevance_for_score(score);
  quality:=case quality_rank when 3 then 'CONFIRMED'::public.technical_profile_match_quality when 2 then 'PROVISIONAL'::public.technical_profile_match_quality else 'CONTEXTUAL'::public.technical_profile_match_quality end;
  return (true,relevance,quality,score,reasons,item_ids,entity_ids,assertion_ids,pending_ids,evidence_count,pending_count)::public.technical_profile_match_snapshot;
end$$;

create or replace function public.technical_profile_match_write_event(
  p_owner uuid,p_match uuid,p_profile uuid,p_signal uuid,p_actor uuid,
  p_action public.technical_profile_match_event_action,
  p_previous public.technical_profile_match_lifecycle,
  p_lifecycle public.technical_profile_match_lifecycle,
  p_details jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path='' as $$
begin
  if p_owner is null or p_match is null or p_profile is null or p_signal is null or p_actor is null or jsonb_typeof(p_details)<>'object' or pg_column_size(p_details)>4096 then
    raise exception 'INVALID_PROFILE_MATCH_EVENT' using errcode='22023';
  end if;
  insert into public.technical_signal_profile_match_events(owner_id,match_id,profile_id,signal_id,actor_id,action,previous_lifecycle,lifecycle,details)
  values(p_owner,p_match,p_profile,p_signal,p_actor,p_action,p_previous,p_lifecycle,p_details);
end$$;

create or replace function public.evaluate_technical_signal_profile_match(
  p_actor uuid,p_signal_id uuid,p_profile_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  snap public.technical_profile_match_snapshot;
  m public.technical_signal_profile_matches;
  was_active boolean:=false;
  restored public.technical_profile_match_lifecycle;
  changed boolean:=false;
begin
  if p_actor is null or p_signal_id is null or p_profile_id is null or not exists(select 1 from auth.users where id=p_actor) then raise exception 'INVALID_PROFILE_MATCH_EVALUATION' using errcode='22023'; end if;
  if not exists(select 1 from public.technical_signals where owner_id=p_actor and id=p_signal_id) then raise exception 'TECHNICAL_SIGNAL_NOT_FOUND' using errcode='P0002'; end if;
  if not exists(select 1 from public.intel_profiles where owner_id=p_actor and id=p_profile_id) then raise exception 'INTEL_PROFILE_NOT_FOUND' using errcode='P0002'; end if;

  select * into snap from public.technical_signal_profile_match_snapshot(p_actor,p_signal_id,p_profile_id);
  select * into m from public.technical_signal_profile_matches where owner_id=p_actor and signal_id=p_signal_id and profile_id=p_profile_id for update;
  was_active:=coalesce(m.is_active,false);

  if not snap.matched then
    if m.id is not null and m.is_active then
      update public.technical_signal_profile_matches set is_active=false,evaluated_at=now(),engine_version='2.3E-v1' where id=m.id;
      perform public.technical_profile_match_write_event(p_actor,m.id,p_profile_id,p_signal_id,p_actor,'DEACTIVATED',m.lifecycle,m.lifecycle,jsonb_build_object('engineVersion','2.3E-v1'));
      changed:=true;
    end if;
    return jsonb_build_object('matched',false,'changed',changed,'profile_id',p_profile_id,'signal_id',p_signal_id);
  end if;

  if m.id is null then
    insert into public.technical_signal_profile_matches(
      owner_id,signal_id,profile_id,relevance,match_quality,lifecycle,is_active,internal_score,reason_codes,
      matched_profile_item_ids,matched_entity_ids,matched_assertion_ids,pending_assertion_ids,matched_evidence_count,pending_identity_count,
      engine_version,first_matched_at,last_matched_at,evaluated_at
    ) values(
      p_actor,p_signal_id,p_profile_id,snap.relevance,snap.match_quality,'NEW',true,snap.internal_score,snap.reason_codes,
      snap.matched_profile_item_ids,snap.matched_entity_ids,snap.matched_assertion_ids,snap.pending_assertion_ids,snap.matched_evidence_count,snap.pending_identity_count,
      '2.3E-v1',now(),now(),now()
    ) returning * into m;
    perform public.technical_profile_match_write_event(p_actor,m.id,p_profile_id,p_signal_id,p_actor,'CREATED',null,m.lifecycle,jsonb_build_object('relevance',snap.relevance,'matchQuality',snap.match_quality,'engineVersion','2.3E-v1'));
    changed:=true;
  else
    if m.lifecycle='SNOOZED' and m.snoozed_until<=now() then
      restored:=coalesce(m.pre_snooze_lifecycle,'REVIEWED'::public.technical_profile_match_lifecycle);
      update public.technical_signal_profile_matches set lifecycle=restored,pre_snooze_lifecycle=null,snoozed_until=null where id=m.id;
      perform public.technical_profile_match_write_event(p_actor,m.id,p_profile_id,p_signal_id,p_actor,'LIFECYCLE_CHANGED','SNOOZED',restored,jsonb_build_object('reason','SNOOZE_EXPIRED'));
      m.lifecycle:=restored;m.pre_snooze_lifecycle:=null;m.snoozed_until:=null;changed:=true;
    end if;

    if m.relevance is distinct from snap.relevance
       or m.match_quality is distinct from snap.match_quality
       or m.internal_score is distinct from snap.internal_score
       or m.reason_codes is distinct from snap.reason_codes
       or m.matched_profile_item_ids is distinct from snap.matched_profile_item_ids
       or m.matched_entity_ids is distinct from snap.matched_entity_ids
       or m.matched_assertion_ids is distinct from snap.matched_assertion_ids
       or m.pending_assertion_ids is distinct from snap.pending_assertion_ids
       or m.matched_evidence_count is distinct from snap.matched_evidence_count
       or m.pending_identity_count is distinct from snap.pending_identity_count
       or m.engine_version is distinct from '2.3E-v1'
       or not m.is_active then
      update public.technical_signal_profile_matches set
        relevance=snap.relevance,match_quality=snap.match_quality,internal_score=snap.internal_score,reason_codes=snap.reason_codes,
        matched_profile_item_ids=snap.matched_profile_item_ids,matched_entity_ids=snap.matched_entity_ids,matched_assertion_ids=snap.matched_assertion_ids,
        pending_assertion_ids=snap.pending_assertion_ids,matched_evidence_count=snap.matched_evidence_count,pending_identity_count=snap.pending_identity_count,
        is_active=true,last_matched_at=now(),evaluated_at=now(),engine_version='2.3E-v1'
      where id=m.id;
      perform public.technical_profile_match_write_event(p_actor,m.id,p_profile_id,p_signal_id,p_actor,case when was_active then 'REEVALUATED' else 'REACTIVATED' end,m.lifecycle,m.lifecycle,jsonb_build_object('relevance',snap.relevance,'matchQuality',snap.match_quality,'engineVersion','2.3E-v1'));
      changed:=true;
    end if;
  end if;

  return jsonb_build_object('matched',true,'changed',changed,'match_id',m.id,'profile_id',p_profile_id,'signal_id',p_signal_id,'relevance',snap.relevance,'match_quality',snap.match_quality,'pending_identity_count',snap.pending_identity_count);
end$$;

create or replace function public.evaluate_technical_signal_profile_matches(p_actor uuid,p_signal_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r record;result jsonb;checked integer:=0;matched integer:=0;changed integer:=0;
begin
  if p_actor is null or p_signal_id is null then raise exception 'INVALID_PROFILE_MATCH_EVALUATION' using errcode='22023'; end if;
  for r in
    select p.id
    from public.intel_profiles p
    where p.owner_id=p_actor and p.status='ACTIVE'
    union
    select m.profile_id from public.technical_signal_profile_matches m where m.owner_id=p_actor and m.signal_id=p_signal_id
  loop
    result:=public.evaluate_technical_signal_profile_match(p_actor,p_signal_id,r.id);checked:=checked+1;
    if coalesce((result->>'matched')::boolean,false) then matched:=matched+1; end if;
    if coalesce((result->>'changed')::boolean,false) then changed:=changed+1; end if;
  end loop;
  return jsonb_build_object('profiles_checked',checked,'matches_active',matched,'matches_changed',changed);
end$$;

create or replace function public.evaluate_technical_profile(p_actor uuid,p_profile_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.intel_profiles;r record;result jsonb;checked integer:=0;matched integer:=0;changed integer:=0;
begin
  select * into p from public.intel_profiles where owner_id=p_actor and id=p_profile_id;
  if p.id is null then raise exception 'INTEL_PROFILE_NOT_FOUND' using errcode='P0002'; end if;
  if p.status<>'ACTIVE' then
    for r in select signal_id from public.technical_signal_profile_matches where owner_id=p_actor and profile_id=p_profile_id and is_active loop
      result:=public.evaluate_technical_signal_profile_match(p_actor,r.signal_id,p_profile_id);checked:=checked+1;
      if coalesce((result->>'changed')::boolean,false) then changed:=changed+1; end if;
    end loop;
    return jsonb_build_object('signals_checked',checked,'matches_active',0,'matches_changed',changed);
  end if;

  for r in
    select distinct q.signal_id from (
      select a.signal_id
      from public.intel_profile_items i
      join public.technical_signal_entity_assertions a on a.owner_id=i.owner_id and a.entity_kind::text=i.kind::text
      join public.technical_signals s on s.owner_id=a.owner_id and s.id=a.signal_id
      where i.owner_id=p_actor and i.profile_id=p_profile_id and i.state='ACTIVE' and i.kind<>'KEYWORD'
        and s.lifecycle='ACTIVE' and s.last_seen_at>=now()-make_interval(days=>p.time_horizon_days)
        and ((i.kind='INDICATOR' and a.normalized_value=i.normalized_value) or (i.kind<>'INDICATOR' and lower(a.normalized_value)=lower(i.normalized_value)))
      union
      select a.signal_id
      from public.intel_profile_items i
      join public.technical_signal_entity_assertions a on a.owner_id=i.owner_id and a.entity_kind::text=i.kind::text
      join public.technical_entity_assertion_resolutions ar on ar.owner_id=a.owner_id and ar.assertion_id=a.id and ar.status='RESOLVED'
      join public.technical_entities e on e.owner_id=ar.owner_id and e.id=ar.entity_id and e.status='ACTIVE'
      join public.technical_signals s on s.owner_id=a.owner_id and s.id=a.signal_id
      where i.owner_id=p_actor and i.profile_id=p_profile_id and i.state='ACTIVE'
        and s.lifecycle='ACTIVE' and s.last_seen_at>=now()-make_interval(days=>p.time_horizon_days)
        and ((i.kind='INDICATOR' and e.canonical_normalized=i.normalized_value) or (i.kind<>'INDICATOR' and lower(e.canonical_normalized)=lower(i.normalized_value)))
      union
      select s.id
      from public.intel_profile_items i
      join public.technical_signals s on s.owner_id=i.owner_id
      where i.owner_id=p_actor and i.profile_id=p_profile_id and i.state='ACTIVE' and i.kind='KEYWORD' and char_length(i.normalized_value)>=3
        and s.lifecycle='ACTIVE' and s.last_seen_at>=now()-make_interval(days=>p.time_horizon_days)
        and lower(s.title||' '||s.summary) like '%'||lower(i.normalized_value)||'%'
      union
      select m.signal_id from public.technical_signal_profile_matches m where m.owner_id=p_actor and m.profile_id=p_profile_id
    ) q
  loop
    result:=public.evaluate_technical_signal_profile_match(p_actor,r.signal_id,p_profile_id);checked:=checked+1;
    if coalesce((result->>'matched')::boolean,false) then matched:=matched+1; end if;
    if coalesce((result->>'changed')::boolean,false) then changed:=changed+1; end if;
  end loop;
  return jsonb_build_object('signals_checked',checked,'matches_active',matched,'matches_changed',changed);
end$$;

create or replace function public.evaluate_technical_signal_intelligence_batch(p_actor uuid,p_signal_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare r record;profile_result jsonb;requested integer;evaluated integer:=0;profile_changes integer:=0;expanded_ids uuid[];
begin
  if p_actor is null or p_signal_ids is null or cardinality(p_signal_ids)<1 or cardinality(p_signal_ids)>250 or not exists(select 1 from auth.users where id=p_actor) then raise exception 'INVALID_TECHINT_EVALUATION_BATCH' using errcode='22023'; end if;
  requested:=cardinality(p_signal_ids);
  if exists(select 1 from unnest(p_signal_ids) sid where not exists(select 1 from public.technical_signals s where s.owner_id=p_actor and s.id=sid)) then raise exception 'TECHNICAL_SIGNAL_NOT_FOUND' using errcode='P0002'; end if;

  select coalesce(array_agg(distinct q.signal_id),'{}'::uuid[]) into expanded_ids from (
    select unnest(p_signal_ids) signal_id
    union
    select a2.signal_id
    from public.technical_signal_entity_assertions a1
    join public.technical_signal_entity_assertions a2 on a2.owner_id=a1.owner_id and a2.entity_kind='CVE' and upper(a2.normalized_value)=upper(a1.normalized_value)
    where a1.owner_id=p_actor and a1.signal_id=any(p_signal_ids) and a1.entity_kind='CVE'
  ) q;

  for r in select unnest(expanded_ids) signal_id loop
    perform public.evaluate_technical_signal_global_priority(p_actor,r.signal_id);
    profile_result:=public.evaluate_technical_signal_profile_matches(p_actor,r.signal_id);
    evaluated:=evaluated+1;
    profile_changes:=profile_changes+coalesce((profile_result->>'matches_changed')::integer,0);
  end loop;
  return jsonb_build_object('requested',requested,'evaluated',evaluated,'profile_matches_changed',profile_changes,'engine_version','2.3E-v1');
end$$;

create or replace function public.set_technical_signal_profile_match_lifecycle(
  p_actor uuid,p_match_id uuid,p_lifecycle public.technical_profile_match_lifecycle,p_snoozed_until timestamptz default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.technical_signal_profile_matches;prev public.technical_profile_match_lifecycle;
begin
  select * into m from public.technical_signal_profile_matches where owner_id=p_actor and id=p_match_id for update;
  if m.id is null then raise exception 'PROFILE_MATCH_NOT_FOUND' using errcode='P0002'; end if;
  prev:=m.lifecycle;
  if p_lifecycle='SNOOZED' then
    if p_snoozed_until is null or p_snoozed_until<=now() or p_snoozed_until>now()+interval '90 days' then raise exception 'INVALID_SNOOZE' using errcode='22023'; end if;
    if prev='SNOOZED' then raise exception 'INVALID_MATCH_TRANSITION' using errcode='22023'; end if;
    update public.technical_signal_profile_matches set lifecycle='SNOOZED',pre_snooze_lifecycle=prev,snoozed_until=p_snoozed_until where id=m.id;
  else
    if p_snoozed_until is not null then raise exception 'INVALID_MATCH_TRANSITION' using errcode='22023'; end if;
    if prev='SNOOZED' then raise exception 'USE_UNSNOOZE' using errcode='22023'; end if;
    if p_lifecycle=prev then return jsonb_build_object('match_id',m.id,'profile_id',m.profile_id,'signal_id',m.signal_id,'lifecycle',m.lifecycle,'changed',false); end if;
    if not (
      (prev='NEW' and p_lifecycle in ('REVIEWED','ACCEPTED','DISMISSED','NOT_RELEVANT')) or
      (prev='REVIEWED' and p_lifecycle in ('ACCEPTED','DISMISSED','NOT_RELEVANT','NEW')) or
      (prev='ACCEPTED' and p_lifecycle in ('REVIEWED','DISMISSED','NOT_RELEVANT')) or
      (prev='DISMISSED' and p_lifecycle in ('REVIEWED','ACCEPTED')) or
      (prev='NOT_RELEVANT' and p_lifecycle in ('REVIEWED','ACCEPTED'))
    ) then raise exception 'INVALID_MATCH_TRANSITION' using errcode='22023'; end if;
    update public.technical_signal_profile_matches set lifecycle=p_lifecycle,pre_snooze_lifecycle=null,snoozed_until=null where id=m.id;
  end if;
  perform public.technical_profile_match_write_event(p_actor,m.id,m.profile_id,m.signal_id,p_actor,'LIFECYCLE_CHANGED',prev,p_lifecycle,jsonb_build_object('snoozedUntil',p_snoozed_until));
  return jsonb_build_object('match_id',m.id,'profile_id',m.profile_id,'signal_id',m.signal_id,'lifecycle',p_lifecycle,'changed',true);
end$$;

create or replace function public.unsnooze_technical_signal_profile_match(p_actor uuid,p_match_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.technical_signal_profile_matches;restored public.technical_profile_match_lifecycle;
begin
  select * into m from public.technical_signal_profile_matches where owner_id=p_actor and id=p_match_id for update;
  if m.id is null then raise exception 'PROFILE_MATCH_NOT_FOUND' using errcode='P0002'; end if;
  if m.lifecycle<>'SNOOZED' then raise exception 'MATCH_NOT_SNOOZED' using errcode='22023'; end if;
  restored:=coalesce(m.pre_snooze_lifecycle,'REVIEWED'::public.technical_profile_match_lifecycle);
  update public.technical_signal_profile_matches set lifecycle=restored,pre_snooze_lifecycle=null,snoozed_until=null where id=m.id;
  perform public.technical_profile_match_write_event(p_actor,m.id,m.profile_id,m.signal_id,p_actor,'LIFECYCLE_CHANGED','SNOOZED',restored,jsonb_build_object('reason','ANALYST_UNSNOOZE'));
  return jsonb_build_object('match_id',m.id,'profile_id',m.profile_id,'signal_id',m.signal_id,'lifecycle',restored,'changed',true);
end$$;

-- Entity normalization improves match quality but never gates visibility. Re-evaluate the affected signal after a resolution changes.
create or replace function public.technical_profile_recheck_after_resolution()
returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
  select signal_id into sid from public.technical_signal_entity_assertions where owner_id=new.owner_id and id=new.assertion_id;
  if sid is not null then
    begin perform public.evaluate_technical_signal_profile_matches(new.owner_id,sid); exception when others then null; end;
  end if;
  return new;
end$$;
revoke all on function public.technical_profile_recheck_after_resolution() from public,anon,authenticated;
drop trigger if exists technical_profile_recheck_resolution on public.technical_entity_assertion_resolutions;
create trigger technical_profile_recheck_resolution after insert or update of status,entity_id,basis on public.technical_entity_assertion_resolutions for each row execute function public.technical_profile_recheck_after_resolution();

revoke all on function public.technical_global_priority_for_score(integer) from public,anon,authenticated;
revoke all on function public.technical_profile_relevance_for_score(integer) from public,anon,authenticated;
revoke all on function public.technical_profile_location_role_matches(public.intel_profile_semantic_role,public.technical_signal_entity_role) from public,anon,authenticated;
revoke all on function public.evaluate_technical_signal_global_priority(uuid,uuid) from public,anon,authenticated;
revoke all on function public.technical_signal_profile_match_snapshot(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.technical_profile_match_write_event(uuid,uuid,uuid,uuid,uuid,public.technical_profile_match_event_action,public.technical_profile_match_lifecycle,public.technical_profile_match_lifecycle,jsonb) from public,anon,authenticated;
revoke all on function public.evaluate_technical_signal_profile_match(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.evaluate_technical_signal_profile_matches(uuid,uuid) from public,anon,authenticated;
revoke all on function public.evaluate_technical_profile(uuid,uuid) from public,anon,authenticated;
revoke all on function public.evaluate_technical_signal_intelligence_batch(uuid,uuid[]) from public,anon,authenticated;
revoke all on function public.set_technical_signal_profile_match_lifecycle(uuid,uuid,public.technical_profile_match_lifecycle,timestamptz) from public,anon,authenticated;
revoke all on function public.unsnooze_technical_signal_profile_match(uuid,uuid) from public,anon,authenticated;

grant execute on function public.evaluate_technical_signal_intelligence_batch(uuid,uuid[]) to service_role;
grant execute on function public.evaluate_technical_profile(uuid,uuid) to service_role;
grant execute on function public.set_technical_signal_profile_match_lifecycle(uuid,uuid,public.technical_profile_match_lifecycle,timestamptz) to service_role;
grant execute on function public.unsnooze_technical_signal_profile_match(uuid,uuid) to service_role;

commit;
