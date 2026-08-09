-- Phase 2.3D hardening — narrow, auditable AI-verified current-group resolution.
-- Migration 037 is already deployed by the operator and remains immutable.

alter type public.technical_entity_resolution_basis add value if not exists 'AI_VERIFIED';
alter type public.technical_entity_audit_action add value if not exists 'ASSERTION_AI_AUTO_RESOLVED';

begin;

create or replace function public.ai_resolve_technical_entity_assertion(
  p_actor uuid,
  p_assertion_id uuid,
  p_entity_id uuid,
  p_provider text,
  p_model text,
  p_safety_checks jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  x public.technical_signal_entity_assertions;
  e public.technical_entities;
  r public.technical_entity_assertion_resolutions;
  audit_details jsonb;
begin
  if p_actor is null
     or not exists(select 1 from auth.users where id=p_actor)
     or p_assertion_id is null
     or p_entity_id is null
     or p_provider is null
     or char_length(trim(p_provider)) not between 1 and 120
     or p_model is null
     or char_length(trim(p_model)) not between 1 and 240
     or p_safety_checks is null
     or jsonb_typeof(p_safety_checks) <> 'object'
     or pg_column_size(p_safety_checks) > 2048 then
    raise exception 'INVALID_AI_RESOLUTION_REQUEST' using errcode='22023';
  end if;

  select * into x
  from public.technical_signal_entity_assertions
  where owner_id=p_actor and id=p_assertion_id;
  if x.id is null then raise exception 'ASSERTION_NOT_FOUND' using errcode='P0002'; end if;

  if x.entity_kind not in ('VENDOR','MALWARE','PRODUCT') then
    raise exception 'AI_AUTO_KIND_NOT_ALLOWED' using errcode='22023';
  end if;

  if public.technical_entity_normalize_lookup(x.normalized_value) in (
    'multiple products','various products','unknown','other','multiple versions','multiple devices','all versions'
  ) then
    raise exception 'GENERIC_ENTITY_LABEL' using errcode='22023';
  end if;

  select * into e
  from public.technical_entities
  where owner_id=p_actor and id=p_entity_id and status='ACTIVE';
  if e.id is null then raise exception 'ENTITY_NOT_FOUND' using errcode='P0002'; end if;
  if e.entity_kind <> x.entity_kind then raise exception 'ENTITY_KIND_MISMATCH' using errcode='22023'; end if;

  select * into r
  from public.technical_entity_assertion_resolutions
  where owner_id=p_actor and assertion_id=x.id
  for update;

  if r.id is not null and r.status <> 'NEEDS_REVIEW' then
    raise exception 'ASSERTION_NOT_REVIEWABLE' using errcode='22023';
  end if;

  insert into public.technical_entity_assertion_resolutions(
    owner_id,assertion_id,entity_kind,entity_id,alias_id,status,basis,decided_by,resolved_at
  ) values(
    p_actor,x.id,x.entity_kind,e.id,null,'RESOLVED','AI_VERIFIED',p_actor,now()
  )
  on conflict(owner_id,assertion_id) do update
    set entity_kind=excluded.entity_kind,
        entity_id=excluded.entity_id,
        alias_id=null,
        status='RESOLVED',
        basis='AI_VERIFIED',
        decided_by=p_actor,
        resolved_at=now()
  where public.technical_entity_assertion_resolutions.status='NEEDS_REVIEW'
  returning * into r;

  if r.id is null then raise exception 'ASSERTION_NOT_REVIEWABLE' using errcode='22023'; end if;

  audit_details:=jsonb_build_object(
    'provider',trim(p_provider),
    'model',trim(p_model),
    'confidence','HIGH',
    'decision','MATCH_EXISTING',
    'autoResolution',true,
    'safetyChecks',p_safety_checks
  );

  perform public.technical_entity_write_audit(
    p_actor,e.id,null,x.id,p_actor,'ASSERTION_AI_AUTO_RESOLVED',audit_details
  );

  return r.id;
end$$;

revoke all on function public.ai_resolve_technical_entity_assertion(uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ai_resolve_technical_entity_assertion(uuid,uuid,uuid,text,text,jsonb) to service_role;

commit;
