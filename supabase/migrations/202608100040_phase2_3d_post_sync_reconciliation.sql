-- Phase 2.3D post-sync reconciliation hardening.
-- New source assertions must not be starved behind historical analyst-review rows.

begin;

create or replace function public.reconcile_technical_entity_assertions(p_actor uuid,p_limit integer default 200) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  x record;
  r public.technical_entity_assertion_resolutions;
  e public.technical_entities;
  a public.technical_entity_aliases;
  k text;
  n text;
  created_result jsonb;
  eid uuid;
  processed int:=0;
  unseen_count int:=0;
  resolved_count int:=0;
  review_count int:=0;
  created_count int:=0;
  basis public.technical_entity_resolution_basis;
begin
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor) or p_limit not between 1 and 500 then
    raise exception 'INVALID_RECONCILE_REQUEST' using errcode='22023';
  end if;

  for x in
    select s.*, (q.id is null) as was_unseen
    from public.technical_signal_entity_assertions s
    left join public.technical_entity_assertion_resolutions q
      on q.owner_id=s.owner_id and q.assertion_id=s.id
    where s.owner_id=p_actor and (q.id is null or q.status='NEEDS_REVIEW')
    order by (q.id is null) desc, s.created_at, s.id
    limit p_limit
  loop
    processed:=processed+1;
    if x.was_unseen then unseen_count:=unseen_count+1; end if;
    eid:=null;
    a:=null;
    basis:=null;

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
      exception when invalid_parameter_value then
        eid:=null;
        basis:=null;
      end;
    else
      n:=public.technical_entity_normalize_lookup(x.normalized_value);
      select al.* into a
      from public.technical_entity_aliases al
      join public.technical_entities en on en.owner_id=al.owner_id and en.id=al.entity_id and en.status='ACTIVE'
      where al.owner_id=p_actor
        and al.entity_kind=x.entity_kind
        and al.normalized_value=n
        and al.status='ACTIVE';
      if a.id is not null then
        eid:=a.entity_id;
        basis:=case when a.basis='AUTHORITATIVE_SOURCE'
          then 'AUTHORITATIVE_ALIAS'::public.technical_entity_resolution_basis
          else 'CONFIRMED_ALIAS'::public.technical_entity_resolution_basis end;
      end if;
    end if;

    select * into r
    from public.technical_entity_assertion_resolutions
    where owner_id=p_actor and assertion_id=x.id;

    if eid is not null then
      if r.id is null or r.status<>'RESOLVED' or r.entity_id is distinct from eid or r.basis is distinct from basis then
        insert into public.technical_entity_assertion_resolutions(owner_id,assertion_id,entity_kind,entity_id,alias_id,status,basis,decided_by,resolved_at)
        values(p_actor,x.id,x.entity_kind,eid,case when basis in('CONFIRMED_ALIAS','AUTHORITATIVE_ALIAS') then a.id else null end,'RESOLVED',basis,p_actor,now())
        on conflict(owner_id,assertion_id) do update set
          entity_kind=excluded.entity_kind,
          entity_id=excluded.entity_id,
          alias_id=excluded.alias_id,
          status='RESOLVED',
          basis=excluded.basis,
          decided_by=p_actor,
          resolved_at=now();
        perform public.technical_entity_write_audit(
          p_actor,
          eid,
          case when basis in('CONFIRMED_ALIAS','AUTHORITATIVE_ALIAS') then a.id else null end,
          x.id,
          p_actor,
          'ASSERTION_AUTO_RESOLVED',
          jsonb_build_object('basis',basis)
        );
      end if;
      resolved_count:=resolved_count+1;
    else
      if r.id is null then
        insert into public.technical_entity_assertion_resolutions(owner_id,assertion_id,entity_kind,status,decided_by)
        values(p_actor,x.id,x.entity_kind,'NEEDS_REVIEW',p_actor);
      elsif r.status='NEEDS_REVIEW' then
        update public.technical_entity_assertion_resolutions
        set entity_id=null,alias_id=null,basis=null,resolved_at=null
        where owner_id=p_actor and assertion_id=x.id;
      end if;
      review_count:=review_count+1;
    end if;
  end loop;

  return jsonb_build_object(
    'processed',processed,
    'unseen_processed',unseen_count,
    'resolved',resolved_count,
    'needs_review',review_count,
    'entities_created',created_count
  );
end$$;

revoke all on function public.reconcile_technical_entity_assertions(uuid,integer) from public,anon,authenticated;
grant execute on function public.reconcile_technical_entity_assertions(uuid,integer) to service_role;

do $$
begin
  if has_function_privilege('authenticated','public.reconcile_technical_entity_assertions(uuid,integer)','EXECUTE') then
    raise exception 'ENTITY_RECONCILE_ACL_REGRESSION';
  end if;
  if not has_function_privilege('service_role','public.reconcile_technical_entity_assertions(uuid,integer)','EXECUTE') then
    raise exception 'ENTITY_SERVICE_ROLE_ACL_REGRESSION';
  end if;
end$$;

commit;
