-- Phase 2.3D hardening — allow a narrowly gated AI workflow to bootstrap
-- a canonical identity only when no safe existing match is available.
-- Migration 037 remains immutable; migration 038 remains the AI link provenance layer.

alter type public.technical_entity_origin add value if not exists 'AI_VERIFIED';
alter type public.technical_entity_audit_action add value if not exists 'ENTITY_AI_AUTO_CREATED';

begin;

create or replace function public.ai_create_technical_entity_from_assertion(
  p_actor uuid,
  p_assertion_id uuid,
  p_canonical_name text,
  p_provider text,
  p_model text,
  p_safety_checks jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  x public.technical_signal_entity_assertions;
  current_resolution public.technical_entity_assertion_resolutions;
  e public.technical_entities;
  resolution_id uuid;
  source_norm text;
  canonical_norm text;
  source_compact text;
  canonical_compact text;
  audit_details jsonb;
begin
  if p_actor is null
     or not exists(select 1 from auth.users where id=p_actor)
     or p_assertion_id is null
     or p_canonical_name is null
     or char_length(trim(p_canonical_name)) not between 1 and 500
     or p_provider is null
     or char_length(trim(p_provider)) not between 1 and 120
     or p_model is null
     or char_length(trim(p_model)) not between 1 and 240
     or p_safety_checks is null
     or jsonb_typeof(p_safety_checks) <> 'object'
     or pg_column_size(p_safety_checks) > 2048 then
    raise exception 'INVALID_AI_CREATE_REQUEST' using errcode='22023';
  end if;

  select * into x
  from public.technical_signal_entity_assertions
  where owner_id=p_actor and id=p_assertion_id;
  if x.id is null then raise exception 'ASSERTION_NOT_FOUND' using errcode='P0002'; end if;

  if x.entity_kind not in ('VENDOR','MALWARE','PRODUCT') then
    raise exception 'AI_AUTO_KIND_NOT_ALLOWED' using errcode='22023';
  end if;

  source_norm:=public.technical_entity_normalize_lookup(x.normalized_value);
  canonical_norm:=public.technical_entity_normalize_lookup(p_canonical_name);

  if source_norm in ('multiple products','various products','unknown','other','multiple versions','multiple devices','all versions')
     or canonical_norm in ('multiple products','various products','unknown','other','multiple versions','multiple devices','all versions') then
    raise exception 'GENERIC_ENTITY_LABEL' using errcode='22023';
  end if;

  source_compact:=regexp_replace(source_norm,'[^a-z0-9]+','','g');
  canonical_compact:=regexp_replace(canonical_norm,'[^a-z0-9]+','','g');
  if canonical_norm<>source_norm
     and (char_length(source_compact)<3 or source_compact<>canonical_compact) then
    raise exception 'AI_CREATE_NAME_MISMATCH' using errcode='22023';
  end if;

  if x.entity_kind='PRODUCT'
     and coalesce((p_safety_checks->>'contextVerified')::boolean,false) is not true then
    raise exception 'AI_PRODUCT_CONTEXT_REQUIRED' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_actor::text||E'\x1f'||x.entity_kind::text||E'\x1f'||coalesce(nullif(source_compact,''),source_norm),0)
  );

  -- Autonomous bootstrap must never create an exact or compact-equivalent duplicate.
  if exists(
    select 1
    from public.technical_entities existing
    where existing.owner_id=p_actor
      and existing.entity_kind=x.entity_kind
      and existing.status='ACTIVE'
      and (
        existing.canonical_normalized=canonical_norm
        or (
          char_length(source_compact)>=3
          and regexp_replace(existing.canonical_normalized,'[^a-z0-9]+','','g')=source_compact
        )
      )
  ) then
    raise exception 'AI_CREATE_EXISTING_ENTITY_CONFLICT' using errcode='23505';
  end if;

  select * into current_resolution
  from public.technical_entity_assertion_resolutions
  where owner_id=p_actor and assertion_id=x.id
  for update;
  if current_resolution.id is not null and current_resolution.status<>'NEEDS_REVIEW' then
    raise exception 'ASSERTION_NOT_REVIEWABLE' using errcode='22023';
  end if;

  insert into public.technical_entities(
    owner_id,entity_kind,canonical_name,canonical_normalized,deterministic_key,indicator_type,
    origin,status,created_by,updated_by
  ) values(
    p_actor,x.entity_kind,trim(p_canonical_name),canonical_norm,null,null,
    'AI_VERIFIED','ACTIVE',p_actor,p_actor
  ) returning * into e;

  audit_details:=jsonb_build_object(
    'provider',trim(p_provider),
    'model',trim(p_model),
    'confidence','HIGH',
    'decision','CREATE_NEW',
    'autoCreation',true,
    'sourceLabel',x.display_value,
    'safetyChecks',p_safety_checks
  );
  perform public.technical_entity_write_audit(
    p_actor,e.id,null,x.id,p_actor,'ENTITY_AI_AUTO_CREATED',audit_details
  );

  resolution_id:=public.ai_resolve_technical_entity_assertion(
    p_actor,x.id,e.id,trim(p_provider),trim(p_model),p_safety_checks
  );

  return jsonb_build_object(
    'entity_id',e.id,
    'resolution_id',resolution_id,
    'created',true
  );
end$$;

revoke all on function public.ai_create_technical_entity_from_assertion(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ai_create_technical_entity_from_assertion(uuid,uuid,text,text,text,jsonb) to service_role;

commit;
