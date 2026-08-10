-- Phase 2.3D — owner-scoped canonical TechINT taxonomy and entity resolution.
-- Source-backed Technical Signal assertions remain immutable and are never rewritten.

begin;

do $$ begin create type public.technical_entity_origin as enum ('DETERMINISTIC','ANALYST'); exception when duplicate_object then null; end $$;
do $$ begin create type public.technical_entity_status as enum ('ACTIVE','ARCHIVED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.technical_entity_alias_basis as enum ('ANALYST_CONFIRMED','AUTHORITATIVE_SOURCE'); exception when duplicate_object then null; end $$;
do $$ begin create type public.technical_entity_alias_status as enum ('ACTIVE','REVOKED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.technical_entity_resolution_status as enum ('RESOLVED','NEEDS_REVIEW','DISMISSED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.technical_entity_resolution_basis as enum ('DETERMINISTIC_KEY','CONFIRMED_ALIAS','AUTHORITATIVE_ALIAS','ANALYST_LINK','ANALYST_CREATED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.technical_entity_audit_action as enum ('ENTITY_CREATED','ENTITY_RENAMED','ENTITY_ARCHIVED','ENTITY_RESTORED','ALIAS_CONFIRMED','ALIAS_REVOKED','ASSERTION_AUTO_RESOLVED','ASSERTION_ANALYST_RESOLVED','ASSERTION_DISMISSED','ASSERTION_RESET_TO_REVIEW'); exception when duplicate_object then null; end $$;

create table public.technical_entities(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_kind public.technical_signal_entity_kind not null,
  canonical_name text not null check(char_length(trim(canonical_name)) between 1 and 500),
  canonical_normalized text not null check(char_length(trim(canonical_normalized)) between 1 and 500),
  deterministic_key text null check(deterministic_key is null or char_length(deterministic_key) between 1 and 700),
  indicator_type public.indicator_type null,
  origin public.technical_entity_origin not null,
  status public.technical_entity_status not null default 'ACTIVE',
  created_by uuid null references auth.users(id),
  updated_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  unique(owner_id,id),
  unique(owner_id,id,entity_kind),
  check((entity_kind='INDICATOR')=(indicator_type is not null)),
  check(
    (entity_kind in ('CVE','INDICATOR','ATTACK_TECHNIQUE') and deterministic_key is not null and origin='DETERMINISTIC')
    or
    (entity_kind not in ('CVE','INDICATOR','ATTACK_TECHNIQUE') and deterministic_key is null)
  ),
  check((status='ARCHIVED')=(archived_at is not null))
);
create unique index technical_entities_owner_deterministic_uidx on public.technical_entities(owner_id,deterministic_key) where deterministic_key is not null;
create index technical_entities_owner_kind_status_idx on public.technical_entities(owner_id,entity_kind,status,updated_at desc,id);
create trigger technical_entities_set_updated_at before update on public.technical_entities for each row execute function public.set_updated_at();

-- Enables kind-safe resolution FKs without changing the append-only assertion rows.
create unique index technical_signal_assertions_owner_id_kind_uidx on public.technical_signal_entity_assertions(owner_id,id,entity_kind);
create index technical_signal_assertions_resolution_lookup_idx on public.technical_signal_entity_assertions(owner_id,entity_kind,normalized_value,created_at,id);

create table public.technical_entity_aliases(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null,
  entity_kind public.technical_signal_entity_kind not null,
  display_value text not null check(char_length(trim(display_value)) between 1 and 500),
  normalized_value text not null check(char_length(trim(normalized_value)) between 1 and 500),
  basis public.technical_entity_alias_basis not null,
  status public.technical_entity_alias_status not null default 'ACTIVE',
  source_assertion_id uuid null,
  source_observation_id uuid null,
  source_system text null check(source_system is null or char_length(trim(source_system)) between 1 and 200),
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_by uuid null references auth.users(id),
  revoked_at timestamptz null,
  unique(owner_id,id),
  unique(owner_id,id,entity_id,entity_kind),
  foreign key(owner_id,entity_id,entity_kind) references public.technical_entities(owner_id,id,entity_kind) on delete cascade,
  foreign key(owner_id,source_assertion_id) references public.technical_signal_entity_assertions(owner_id,id),
  foreign key(owner_id,source_observation_id) references public.technical_signal_observations(owner_id,id),
  check((status='REVOKED')=(revoked_at is not null)),
  check((revoked_by is null)=(revoked_at is null)),
  check(
    basis <> 'AUTHORITATIVE_SOURCE'
    or (source_assertion_id is not null and source_observation_id is not null and source_system is not null)
  )
);
create unique index technical_entity_aliases_active_resolution_uidx on public.technical_entity_aliases(owner_id,entity_kind,normalized_value) where status='ACTIVE';
create index technical_entity_aliases_entity_idx on public.technical_entity_aliases(owner_id,entity_id,status,created_at,id);

create table public.technical_entity_assertion_resolutions(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  assertion_id uuid not null,
  entity_kind public.technical_signal_entity_kind not null,
  entity_id uuid null,
  alias_id uuid null,
  status public.technical_entity_resolution_status not null,
  basis public.technical_entity_resolution_basis null,
  decided_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz null,
  unique(owner_id,id),
  unique(owner_id,assertion_id),
  foreign key(owner_id,assertion_id,entity_kind) references public.technical_signal_entity_assertions(owner_id,id,entity_kind) on delete cascade,
  foreign key(owner_id,entity_id,entity_kind) references public.technical_entities(owner_id,id,entity_kind),
  foreign key(owner_id,alias_id,entity_id,entity_kind) references public.technical_entity_aliases(owner_id,id,entity_id,entity_kind),
  check(
    (status='RESOLVED' and entity_id is not null and basis is not null and resolved_at is not null)
    or
    (status in ('NEEDS_REVIEW','DISMISSED') and entity_id is null and alias_id is null and basis is null and resolved_at is null)
  ),
  check(
    (basis in ('CONFIRMED_ALIAS','AUTHORITATIVE_ALIAS') and alias_id is not null)
    or
    (basis not in ('CONFIRMED_ALIAS','AUTHORITATIVE_ALIAS') and alias_id is null)
    or basis is null
  )
);
create index technical_entity_resolutions_status_idx on public.technical_entity_assertion_resolutions(owner_id,status,updated_at,id);
create index technical_entity_resolutions_entity_idx on public.technical_entity_assertion_resolutions(owner_id,entity_id,updated_at desc,id) where entity_id is not null;
create trigger technical_entity_resolutions_set_updated_at before update on public.technical_entity_assertion_resolutions for each row execute function public.set_updated_at();

create table public.technical_entity_audit_events(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid null,
  alias_id uuid null,
  assertion_id uuid null,
  actor_id uuid not null references auth.users(id),
  action public.technical_entity_audit_action not null,
  details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object' and pg_column_size(details)<=4096),
  created_at timestamptz not null default now(),
  foreign key(owner_id,entity_id) references public.technical_entities(owner_id,id),
  foreign key(owner_id,alias_id) references public.technical_entity_aliases(owner_id,id),
  foreign key(owner_id,assertion_id) references public.technical_signal_entity_assertions(owner_id,id)
);
create index technical_entity_audit_owner_entity_idx on public.technical_entity_audit_events(owner_id,entity_id,created_at desc,id);
create index technical_entity_audit_owner_assertion_idx on public.technical_entity_audit_events(owner_id,assertion_id,created_at desc,id);

create trigger technical_entity_audit_append_only before update or delete on public.technical_entity_audit_events for each row execute function public.technical_signal_reject_change();

alter table public.technical_entities enable row level security;
alter table public.technical_entity_aliases enable row level security;
alter table public.technical_entity_assertion_resolutions enable row level security;
alter table public.technical_entity_audit_events enable row level security;

revoke all on public.technical_entities, public.technical_entity_aliases, public.technical_entity_assertion_resolutions, public.technical_entity_audit_events from anon,authenticated;
grant select on public.technical_entities, public.technical_entity_aliases, public.technical_entity_assertion_resolutions, public.technical_entity_audit_events to authenticated;
grant all on public.technical_entities, public.technical_entity_aliases, public.technical_entity_assertion_resolutions, public.technical_entity_audit_events to service_role;

create policy technical_entities_select_own on public.technical_entities for select to authenticated using(auth.uid()=owner_id);
create policy technical_entity_aliases_select_own on public.technical_entity_aliases for select to authenticated using(auth.uid()=owner_id);
create policy technical_entity_resolutions_select_own on public.technical_entity_assertion_resolutions for select to authenticated using(auth.uid()=owner_id);
create policy technical_entity_audit_select_own on public.technical_entity_audit_events for select to authenticated using(auth.uid()=owner_id);

create or replace function public.technical_entity_normalize_lookup(p_value text) returns text
language plpgsql immutable strict set search_path='' as $$
declare n text;
begin
  n:=regexp_replace(lower(trim(p_value)),'[[:space:]]+',' ','g');
  if char_length(n) not between 1 and 500 or n~'[[:cntrl:]]' then raise exception 'INVALID_ENTITY_VALUE' using errcode='22023'; end if;
  return n;
end$$;

create or replace function public.technical_entity_normalized_identity(
  p_kind public.technical_signal_entity_kind,
  p_value text,
  p_indicator_type public.indicator_type default null
) returns text language plpgsql immutable set search_path='' as $$
declare n text;
begin
  if p_kind='CVE' then
    n:=upper(trim(p_value));
    if n~'^CVE[0-9]' then n:=regexp_replace(n,'^CVE([0-9])','CVE-\1'); end if;
    if n!~'^CVE-[0-9]{4}-[0-9]{4,}$' then raise exception 'INVALID_DETERMINISTIC_ENTITY' using errcode='22023'; end if;
    return n;
  elsif p_kind='ATTACK_TECHNIQUE' then
    n:=upper(trim(p_value));
    if n!~'^T[0-9]{4}(\.[0-9]{3})?$' then raise exception 'INVALID_DETERMINISTIC_ENTITY' using errcode='22023'; end if;
    return n;
  elsif p_kind='INDICATOR' then
    if p_indicator_type is null or p_indicator_type not in ('IP','CIDR','DOMAIN','URL','HASH','EMAIL') then raise exception 'INVALID_DETERMINISTIC_ENTITY' using errcode='22023'; end if;
    return public.intel_profile_validate_indicator(p_value,p_indicator_type);
  end if;
  return null;
end$$;

create or replace function public.technical_entity_deterministic_key(
  p_kind public.technical_signal_entity_kind,
  p_value text,
  p_indicator_type public.indicator_type default null
) returns text language plpgsql immutable set search_path='' as $$
declare n text;
begin
  n:=public.technical_entity_normalized_identity(p_kind,p_value,p_indicator_type);
  if n is null then return null; end if;
  if p_kind='CVE' then return 'cve:'||n; end if;
  if p_kind='ATTACK_TECHNIQUE' then return 'attack:'||n; end if;
  return 'indicator:'||p_indicator_type::text||':'||n;
end$$;

create or replace function public.technical_entity_write_audit(
  p_owner uuid,p_entity uuid,p_alias uuid,p_assertion uuid,p_actor uuid,
  p_action public.technical_entity_audit_action,p_details jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path='' as $$
begin
  if p_owner is null or p_actor is null or p_action is null or p_details is null or jsonb_typeof(p_details)<>'object' or pg_column_size(p_details)>4096 then
    raise exception 'INVALID_ENTITY_AUDIT' using errcode='22023';
  end if;
  insert into public.technical_entity_audit_events(owner_id,entity_id,alias_id,assertion_id,actor_id,action,details)
  values(p_owner,p_entity,p_alias,p_assertion,p_actor,p_action,p_details);
end$$;

create or replace function public.create_technical_entity(
  p_actor uuid,
  p_kind public.technical_signal_entity_kind,
  p_canonical_name text,
  p_indicator_type public.indicator_type default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare n text;k text;e public.technical_entities;created boolean:=false;
begin
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor) or p_canonical_name is null then raise exception 'INVALID_ENTITY' using errcode='22023'; end if;
  if p_kind in ('CVE','INDICATOR','ATTACK_TECHNIQUE') then
    n:=public.technical_entity_normalized_identity(p_kind,p_canonical_name,p_indicator_type);
    k:=public.technical_entity_deterministic_key(p_kind,p_canonical_name,p_indicator_type);
    perform pg_advisory_xact_lock(hashtextextended(p_actor::text||E'\x1f'||k,0));
    select * into e from public.technical_entities where owner_id=p_actor and deterministic_key=k;
    if e.id is null then
      insert into public.technical_entities(owner_id,entity_kind,canonical_name,canonical_normalized,deterministic_key,indicator_type,origin,status,created_by,updated_by)
      values(p_actor,p_kind,n,n,k,p_indicator_type,'DETERMINISTIC','ACTIVE',p_actor,p_actor) returning * into e;
      created:=true;
      perform public.technical_entity_write_audit(p_actor,e.id,null,null,p_actor,'ENTITY_CREATED',jsonb_build_object('kind',p_kind,'deterministicKey',k));
    end if;
  else
    n:=public.technical_entity_normalize_lookup(p_canonical_name);
    insert into public.technical_entities(owner_id,entity_kind,canonical_name,canonical_normalized,origin,status,created_by,updated_by)
    values(p_actor,p_kind,trim(p_canonical_name),n,'ANALYST','ACTIVE',p_actor,p_actor) returning * into e;
    created:=true;
    perform public.technical_entity_write_audit(p_actor,e.id,null,null,p_actor,'ENTITY_CREATED',jsonb_build_object('kind',p_kind));
  end if;
  return jsonb_build_object('entity_id',e.id,'created',created,'status',e.status,'deterministic_key',e.deterministic_key);
end$$;

create or replace function public.add_technical_entity_alias(
  p_actor uuid,
  p_entity_id uuid,
  p_display_value text,
  p_source_assertion_id uuid default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.technical_entities;a public.technical_entity_aliases;existing public.technical_entity_aliases;norm text;obs uuid;src text;ak public.technical_signal_entity_kind;
begin
  select * into e from public.technical_entities where owner_id=p_actor and id=p_entity_id and status='ACTIVE' for update;
  if e.id is null then raise exception 'ENTITY_NOT_FOUND' using errcode='P0002'; end if;
  if e.entity_kind in ('CVE','INDICATOR','ATTACK_TECHNIQUE') then raise exception 'DETERMINISTIC_ALIAS_NOT_ALLOWED' using errcode='22023'; end if;
  norm:=public.technical_entity_normalize_lookup(p_display_value);
  if p_source_assertion_id is not null then
    select x.entity_kind,x.source_observation_id,o.source_system into ak,obs,src
    from public.technical_signal_entity_assertions x join public.technical_signal_observations o on o.owner_id=x.owner_id and o.id=x.source_observation_id
    where x.owner_id=p_actor and x.id=p_source_assertion_id;
    if ak is null or ak<>e.entity_kind then raise exception 'ASSERTION_KIND_MISMATCH' using errcode='22023'; end if;
  end if;
  select * into existing from public.technical_entity_aliases where owner_id=p_actor and entity_kind=e.entity_kind and normalized_value=norm and status='ACTIVE' for update;
  if existing.id is not null then
    if existing.entity_id<>e.id then raise exception 'ALIAS_CONFLICT' using errcode='23505'; end if;
    return existing.id;
  end if;
  insert into public.technical_entity_aliases(owner_id,entity_id,entity_kind,display_value,normalized_value,basis,status,source_assertion_id,source_observation_id,source_system,created_by)
  values(p_actor,e.id,e.entity_kind,trim(p_display_value),norm,'ANALYST_CONFIRMED','ACTIVE',p_source_assertion_id,obs,src,p_actor) returning * into a;
  perform public.technical_entity_write_audit(p_actor,e.id,a.id,p_source_assertion_id,p_actor,'ALIAS_CONFIRMED',jsonb_build_object('normalizedValue',norm,'basis','ANALYST_CONFIRMED'));
  return a.id;
end$$;

create or replace function public.link_technical_entity_assertion(
  p_actor uuid,
  p_assertion_id uuid,
  p_entity_id uuid,
  p_remember_alias boolean default false
) returns uuid language plpgsql security definer set search_path='' as $$
declare x public.technical_signal_entity_assertions;e public.technical_entities;r public.technical_entity_assertion_resolutions;aid uuid;
begin
  select * into x from public.technical_signal_entity_assertions where owner_id=p_actor and id=p_assertion_id;
  select * into e from public.technical_entities where owner_id=p_actor and id=p_entity_id and status='ACTIVE';
  if x.id is null or e.id is null then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  if x.entity_kind<>e.entity_kind then raise exception 'ENTITY_KIND_MISMATCH' using errcode='22023'; end if;
  if p_remember_alias then aid:=public.add_technical_entity_alias(p_actor,e.id,x.display_value,x.id); end if;
  insert into public.technical_entity_assertion_resolutions(owner_id,assertion_id,entity_kind,entity_id,status,basis,decided_by,resolved_at)
  values(p_actor,x.id,x.entity_kind,e.id,'RESOLVED','ANALYST_LINK',p_actor,now())
  on conflict(owner_id,assertion_id) do update set entity_kind=excluded.entity_kind,entity_id=excluded.entity_id,alias_id=null,status='RESOLVED',basis='ANALYST_LINK',decided_by=p_actor,resolved_at=now()
  returning * into r;
  perform public.technical_entity_write_audit(p_actor,e.id,aid,x.id,p_actor,'ASSERTION_ANALYST_RESOLVED',jsonb_build_object('rememberAlias',p_remember_alias,'basis','ANALYST_LINK'));
  return r.id;
end$$;

create or replace function public.create_technical_entity_from_assertion(
  p_actor uuid,
  p_assertion_id uuid,
  p_canonical_name text default null,
  p_remember_alias boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare x public.technical_signal_entity_assertions;created_result jsonb;eid uuid;aid uuid;r public.technical_entity_assertion_resolutions;name text;
begin
  select * into x from public.technical_signal_entity_assertions where owner_id=p_actor and id=p_assertion_id;
  if x.id is null then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  name:=coalesce(nullif(trim(p_canonical_name),''),x.display_value);
  created_result:=public.create_technical_entity(p_actor,x.entity_kind,case when x.entity_kind in('CVE','INDICATOR','ATTACK_TECHNIQUE') then x.normalized_value else name end,x.indicator_type);
  eid:=(created_result->>'entity_id')::uuid;
  if p_remember_alias and x.entity_kind not in('CVE','INDICATOR','ATTACK_TECHNIQUE') then aid:=public.add_technical_entity_alias(p_actor,eid,x.display_value,x.id); end if;
  insert into public.technical_entity_assertion_resolutions(owner_id,assertion_id,entity_kind,entity_id,status,basis,decided_by,resolved_at)
  values(p_actor,x.id,x.entity_kind,eid,'RESOLVED','ANALYST_CREATED',p_actor,now())
  on conflict(owner_id,assertion_id) do update set entity_kind=excluded.entity_kind,entity_id=excluded.entity_id,alias_id=null,status='RESOLVED',basis='ANALYST_CREATED',decided_by=p_actor,resolved_at=now()
  returning * into r;
  perform public.technical_entity_write_audit(p_actor,eid,aid,x.id,p_actor,'ASSERTION_ANALYST_RESOLVED',jsonb_build_object('rememberAlias',p_remember_alias,'basis','ANALYST_CREATED'));
  return jsonb_build_object('entity_id',eid,'resolution_id',r.id,'created',coalesce((created_result->>'created')::boolean,false));
end$$;

create or replace function public.dismiss_technical_entity_assertion(p_actor uuid,p_assertion_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare x public.technical_signal_entity_assertions;r public.technical_entity_assertion_resolutions;
begin
  select * into x from public.technical_signal_entity_assertions where owner_id=p_actor and id=p_assertion_id;
  if x.id is null then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  insert into public.technical_entity_assertion_resolutions(owner_id,assertion_id,entity_kind,status,decided_by)
  values(p_actor,x.id,x.entity_kind,'DISMISSED',p_actor)
  on conflict(owner_id,assertion_id) do update set entity_id=null,alias_id=null,status='DISMISSED',basis=null,decided_by=p_actor,resolved_at=null
  returning * into r;
  perform public.technical_entity_write_audit(p_actor,null,null,x.id,p_actor,'ASSERTION_DISMISSED','{}');
  return r.id;
end$$;

create or replace function public.reset_technical_entity_assertion_review(p_actor uuid,p_assertion_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare x public.technical_signal_entity_assertions;r public.technical_entity_assertion_resolutions;
begin
  select * into x from public.technical_signal_entity_assertions where owner_id=p_actor and id=p_assertion_id;
  if x.id is null then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  insert into public.technical_entity_assertion_resolutions(owner_id,assertion_id,entity_kind,status,decided_by)
  values(p_actor,x.id,x.entity_kind,'NEEDS_REVIEW',p_actor)
  on conflict(owner_id,assertion_id) do update set entity_id=null,alias_id=null,status='NEEDS_REVIEW',basis=null,decided_by=p_actor,resolved_at=null
  returning * into r;
  perform public.technical_entity_write_audit(p_actor,null,null,x.id,p_actor,'ASSERTION_RESET_TO_REVIEW','{}');
  return r.id;
end$$;

create or replace function public.revoke_technical_entity_alias(p_actor uuid,p_alias_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.technical_entity_aliases;
begin
  select * into a from public.technical_entity_aliases where owner_id=p_actor and id=p_alias_id for update;
  if a.id is null then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  if a.status='REVOKED' then return a.id; end if;
  insert into public.technical_entity_audit_events(owner_id,entity_id,alias_id,assertion_id,actor_id,action,details)
  select r.owner_id,r.entity_id,a.id,r.assertion_id,p_actor,'ASSERTION_RESET_TO_REVIEW',jsonb_build_object('reason','alias_revoked')
  from public.technical_entity_assertion_resolutions r
  where r.owner_id=p_actor and r.alias_id=a.id and r.status='RESOLVED' and r.basis in('CONFIRMED_ALIAS','AUTHORITATIVE_ALIAS');
  update public.technical_entity_assertion_resolutions set entity_id=null,alias_id=null,status='NEEDS_REVIEW',basis=null,decided_by=p_actor,resolved_at=null
  where owner_id=p_actor and alias_id=a.id and status='RESOLVED' and basis in('CONFIRMED_ALIAS','AUTHORITATIVE_ALIAS');
  update public.technical_entity_aliases set status='REVOKED',revoked_by=p_actor,revoked_at=now() where owner_id=p_actor and id=a.id returning * into a;
  perform public.technical_entity_write_audit(p_actor,a.entity_id,a.id,a.source_assertion_id,p_actor,'ALIAS_REVOKED',jsonb_build_object('normalizedValue',a.normalized_value));
  return a.id;
end$$;

create or replace function public.rename_technical_entity(p_actor uuid,p_entity_id uuid,p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare e public.technical_entities;n text;
begin
  select * into e from public.technical_entities where owner_id=p_actor and id=p_entity_id for update;
  if e.id is null then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  if e.deterministic_key is not null then raise exception 'DETERMINISTIC_ENTITY_IMMUTABLE' using errcode='22023'; end if;
  n:=public.technical_entity_normalize_lookup(p_name);
  update public.technical_entities set canonical_name=trim(p_name),canonical_normalized=n,updated_by=p_actor where owner_id=p_actor and id=e.id;
  perform public.technical_entity_write_audit(p_actor,e.id,null,null,p_actor,'ENTITY_RENAMED',jsonb_build_object('canonicalName',trim(p_name)));
  return e.id;
end$$;

create or replace function public.set_technical_entity_status(p_actor uuid,p_entity_id uuid,p_status public.technical_entity_status) returns uuid
language plpgsql security definer set search_path='' as $$
declare e public.technical_entities;
begin
  select * into e from public.technical_entities where owner_id=p_actor and id=p_entity_id for update;
  if e.id is null then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  update public.technical_entities set status=p_status,archived_at=case when p_status='ARCHIVED' then coalesce(archived_at,now()) else null end,updated_by=p_actor where owner_id=p_actor and id=e.id returning * into e;
  perform public.technical_entity_write_audit(p_actor,e.id,null,null,p_actor,case when p_status='ARCHIVED' then 'ENTITY_ARCHIVED'::public.technical_entity_audit_action else 'ENTITY_RESTORED'::public.technical_entity_audit_action end,'{}');
  return e.id;
end$$;

create or replace function public.reconcile_technical_entity_assertions(p_actor uuid,p_limit integer default 200) returns jsonb
language plpgsql security definer set search_path='' as $$
declare x record;r public.technical_entity_assertion_resolutions;e public.technical_entities;a public.technical_entity_aliases;k text;n text;created_result jsonb;eid uuid;processed int:=0;resolved_count int:=0;review_count int:=0;created_count int:=0;basis public.technical_entity_resolution_basis;
begin
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor) or p_limit not between 1 and 500 then raise exception 'INVALID_RECONCILE_REQUEST' using errcode='22023'; end if;
  for x in
    select s.* from public.technical_signal_entity_assertions s
    left join public.technical_entity_assertion_resolutions q on q.owner_id=s.owner_id and q.assertion_id=s.id
    where s.owner_id=p_actor and (q.id is null or q.status='NEEDS_REVIEW')
    order by s.created_at,s.id limit p_limit
  loop
    processed:=processed+1;
    eid:=null;a:=null;basis:=null;
    if x.entity_kind in('CVE','INDICATOR','ATTACK_TECHNIQUE') then
      begin
        n:=public.technical_entity_normalized_identity(x.entity_kind,x.normalized_value,x.indicator_type);
        k:=public.technical_entity_deterministic_key(x.entity_kind,x.normalized_value,x.indicator_type);
        select * into e from public.technical_entities where owner_id=p_actor and deterministic_key=k;
        if e.id is null then
          created_result:=public.create_technical_entity(p_actor,x.entity_kind,n,x.indicator_type);
          eid:=(created_result->>'entity_id')::uuid;
          if coalesce((created_result->>'created')::boolean,false) then created_count:=created_count+1; end if;
          select * into e from public.technical_entities where owner_id=p_actor and id=eid;
        end if;
        if e.status='ACTIVE' then eid:=e.id;basis:='DETERMINISTIC_KEY'; else eid:=null; end if;
      exception when invalid_parameter_value then eid:=null;basis:=null;
      end;
    else
      n:=public.technical_entity_normalize_lookup(x.normalized_value);
      select al.* into a from public.technical_entity_aliases al join public.technical_entities en on en.owner_id=al.owner_id and en.id=al.entity_id and en.status='ACTIVE'
      where al.owner_id=p_actor and al.entity_kind=x.entity_kind and al.normalized_value=n and al.status='ACTIVE';
      if a.id is not null then eid:=a.entity_id;basis:=case when a.basis='AUTHORITATIVE_SOURCE' then 'AUTHORITATIVE_ALIAS'::public.technical_entity_resolution_basis else 'CONFIRMED_ALIAS'::public.technical_entity_resolution_basis end; end if;
    end if;
    select * into r from public.technical_entity_assertion_resolutions where owner_id=p_actor and assertion_id=x.id;
    if eid is not null then
      if r.id is null or r.status<>'RESOLVED' or r.entity_id is distinct from eid or r.basis is distinct from basis then
        insert into public.technical_entity_assertion_resolutions(owner_id,assertion_id,entity_kind,entity_id,alias_id,status,basis,decided_by,resolved_at)
        values(p_actor,x.id,x.entity_kind,eid,case when basis in('CONFIRMED_ALIAS','AUTHORITATIVE_ALIAS') then a.id else null end,'RESOLVED',basis,p_actor,now())
        on conflict(owner_id,assertion_id) do update set entity_kind=excluded.entity_kind,entity_id=excluded.entity_id,alias_id=excluded.alias_id,status='RESOLVED',basis=excluded.basis,decided_by=p_actor,resolved_at=now();
        perform public.technical_entity_write_audit(p_actor,eid,case when basis in('CONFIRMED_ALIAS','AUTHORITATIVE_ALIAS') then a.id else null end,x.id,p_actor,'ASSERTION_AUTO_RESOLVED',jsonb_build_object('basis',basis));
      end if;
      resolved_count:=resolved_count+1;
    else
      if r.id is null then
        insert into public.technical_entity_assertion_resolutions(owner_id,assertion_id,entity_kind,status,decided_by) values(p_actor,x.id,x.entity_kind,'NEEDS_REVIEW',p_actor);
      elsif r.status='NEEDS_REVIEW' then
        update public.technical_entity_assertion_resolutions set entity_id=null,alias_id=null,basis=null,resolved_at=null where owner_id=p_actor and assertion_id=x.id;
      end if;
      review_count:=review_count+1;
    end if;
  end loop;
  return jsonb_build_object('processed',processed,'resolved',resolved_count,'needs_review',review_count,'entities_created',created_count);
end$$;

-- Browser roles can only read their own rows. All mutation remains service-role only.
revoke all on function public.technical_entity_normalize_lookup(text) from public,anon,authenticated;
revoke all on function public.technical_entity_normalized_identity(public.technical_signal_entity_kind,text,public.indicator_type) from public,anon,authenticated;
revoke all on function public.technical_entity_deterministic_key(public.technical_signal_entity_kind,text,public.indicator_type) from public,anon,authenticated;
revoke all on function public.technical_entity_write_audit(uuid,uuid,uuid,uuid,uuid,public.technical_entity_audit_action,jsonb) from public,anon,authenticated;
revoke all on function public.create_technical_entity(uuid,public.technical_signal_entity_kind,text,public.indicator_type) from public,anon,authenticated;
revoke all on function public.add_technical_entity_alias(uuid,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.link_technical_entity_assertion(uuid,uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.create_technical_entity_from_assertion(uuid,uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.dismiss_technical_entity_assertion(uuid,uuid) from public,anon,authenticated;
revoke all on function public.reset_technical_entity_assertion_review(uuid,uuid) from public,anon,authenticated;
revoke all on function public.revoke_technical_entity_alias(uuid,uuid) from public,anon,authenticated;
revoke all on function public.rename_technical_entity(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.set_technical_entity_status(uuid,uuid,public.technical_entity_status) from public,anon,authenticated;
revoke all on function public.reconcile_technical_entity_assertions(uuid,integer) from public,anon,authenticated;

grant execute on function public.technical_entity_normalize_lookup(text) to service_role;
grant execute on function public.technical_entity_normalized_identity(public.technical_signal_entity_kind,text,public.indicator_type) to service_role;
grant execute on function public.technical_entity_deterministic_key(public.technical_signal_entity_kind,text,public.indicator_type) to service_role;
grant execute on function public.technical_entity_write_audit(uuid,uuid,uuid,uuid,uuid,public.technical_entity_audit_action,jsonb) to service_role;
grant execute on function public.create_technical_entity(uuid,public.technical_signal_entity_kind,text,public.indicator_type) to service_role;
grant execute on function public.add_technical_entity_alias(uuid,uuid,text,uuid) to service_role;
grant execute on function public.link_technical_entity_assertion(uuid,uuid,uuid,boolean) to service_role;
grant execute on function public.create_technical_entity_from_assertion(uuid,uuid,text,boolean) to service_role;
grant execute on function public.dismiss_technical_entity_assertion(uuid,uuid) to service_role;
grant execute on function public.reset_technical_entity_assertion_review(uuid,uuid) to service_role;
grant execute on function public.revoke_technical_entity_alias(uuid,uuid) to service_role;
grant execute on function public.rename_technical_entity(uuid,uuid,text) to service_role;
grant execute on function public.set_technical_entity_status(uuid,uuid,public.technical_entity_status) to service_role;
grant execute on function public.reconcile_technical_entity_assertions(uuid,integer) to service_role;

-- Migration-time ACL and conservative-normalization assertions.
do $$
begin
  if public.technical_entity_normalize_lookup('  Lumma   Stealer  ')<>'lumma stealer' then raise exception 'ENTITY_NORMALIZATION_REGRESSION'; end if;
  if public.technical_entity_normalize_lookup('Lumma-Stealer')=public.technical_entity_normalize_lookup('Lumma Stealer') then raise exception 'PUNCTUATION_WAS_STRIPPED'; end if;
  if public.technical_entity_deterministic_key('CVE','cve-2026-12345',null)<>'cve:CVE-2026-12345' then raise exception 'CVE_KEY_REGRESSION'; end if;
  if public.technical_entity_deterministic_key('ATTACK_TECHNIQUE','t1059.001',null)<>'attack:T1059.001' then raise exception 'ATTACK_KEY_REGRESSION'; end if;
  if has_function_privilege('authenticated','public.reconcile_technical_entity_assertions(uuid,integer)','EXECUTE') then raise exception 'ENTITY_RECONCILE_ACL_REGRESSION'; end if;
  if has_table_privilege('authenticated','public.technical_entities','INSERT') or has_table_privilege('authenticated','public.technical_entity_aliases','UPDATE') then raise exception 'ENTITY_TABLE_ACL_REGRESSION'; end if;
  if not has_function_privilege('service_role','public.reconcile_technical_entity_assertions(uuid,integer)','EXECUTE') then raise exception 'ENTITY_SERVICE_ROLE_ACL_REGRESSION'; end if;
end$$;

commit;
