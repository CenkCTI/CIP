-- Phase 2.3E hardening — re-evaluate affected profile matches only after a
-- resolution INSERT/UPDATE statement is complete, and make profile-driven
-- candidate generation include conservative compound PRODUCT context.

begin;

-- Profile re-evaluation is bounded by the profile time horizon. This index avoids
-- an owner-wide unordered scan when a profile is created or its definition changes.
create index if not exists technical_signals_owner_lifecycle_last_seen_idx
  on public.technical_signals(owner_id,lifecycle,last_seen_at desc,id);

-- Row-level AFTER triggers execute inside the statement that writes a resolution.
-- Batch re-evaluation after the completed statement gives the matcher the final
-- resolution state and avoids one full profile pass per changed row.
drop trigger if exists technical_profile_recheck_resolution on public.technical_entity_assertion_resolutions;

create or replace function public.technical_profile_recheck_resolution_statement()
returns trigger language plpgsql security definer set search_path='' as $$
declare r record;eval_result jsonb;resolution_state jsonb;match_state jsonb;
begin
  for r in
    select distinct a.owner_id,a.signal_id
    from new_resolution_rows n
    join public.technical_signal_entity_assertions a
      on a.owner_id=n.owner_id and a.id=n.assertion_id
  loop
    begin
      eval_result:=public.evaluate_technical_signal_profile_matches(r.owner_id,r.signal_id);
      select coalesce(jsonb_agg(jsonb_build_object(
        'kind',a.entity_kind::text,
        'observed',a.display_value,
        'status',coalesce(ar.status::text,'NONE'),
        'canonical',e.canonical_normalized
      ) order by a.entity_kind::text,a.id),'[]'::jsonb)
      into resolution_state
      from public.technical_signal_entity_assertions a
      left join public.technical_entity_assertion_resolutions ar
        on ar.owner_id=a.owner_id and ar.assertion_id=a.id
      left join public.technical_entities e
        on e.owner_id=ar.owner_id and e.id=ar.entity_id
      where a.owner_id=r.owner_id and a.signal_id=r.signal_id;

      select coalesce(jsonb_agg(jsonb_build_object(
        'profile',m.profile_id,
        'quality',m.match_quality::text,
        'relevance',m.relevance::text,
        'reasons',m.reason_codes,
        'pending',m.pending_identity_count
      ) order by m.profile_id),'[]'::jsonb)
      into match_state
      from public.technical_signal_profile_matches m
      where m.owner_id=r.owner_id and m.signal_id=r.signal_id;

      raise notice 'TECHINT_PROFILE_RECHECK_DIAGNOSTIC signal=% eval=% resolutions=% matches=%',r.signal_id,eval_result,resolution_state,match_state;
    exception when others then
      raise notice 'TECHINT_PROFILE_RECHECK_FAILED signal=% sqlstate=% error=%',r.signal_id,sqlstate,sqlerrm;
      -- Resolution is authoritative. Derived Profile Match projection remains
      -- best-effort and can be recomputed by collection/profile evaluation later.
      null;
    end;
  end loop;
  return null;
end$$;

revoke all on function public.technical_profile_recheck_resolution_statement() from public,anon,authenticated;

drop trigger if exists technical_profile_recheck_resolution_insert on public.technical_entity_assertion_resolutions;
create trigger technical_profile_recheck_resolution_insert
  after insert on public.technical_entity_assertion_resolutions
  referencing new table as new_resolution_rows
  for each statement execute function public.technical_profile_recheck_resolution_statement();

drop trigger if exists technical_profile_recheck_resolution_update on public.technical_entity_assertion_resolutions;
create trigger technical_profile_recheck_resolution_update
  after update on public.technical_entity_assertion_resolutions
  referencing new table as new_resolution_rows
  for each statement execute function public.technical_profile_recheck_resolution_statement();

-- Rebuild one profile from a bounded candidate set. In addition to exact source,
-- canonical, keyword and existing-match candidates, include the same conservative
-- compound PRODUCT context used by the signal-scoped matcher. This matters when a
-- profile is created AFTER an unresolved signal already exists (for example a
-- profile watches "Splunk Enterprise" while CISA supplied VENDOR=Splunk and
-- PRODUCT=Enterprise). No alias is taught and no source assertion is rewritten.
create or replace function public.evaluate_technical_profile(p_actor uuid,p_profile_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.intel_profiles;r record;result jsonb;checked integer:=0;matched integer:=0;changed integer:=0;
begin
  select * into p from public.intel_profiles where owner_id=p_actor and id=p_profile_id;
  if p.id is null then raise exception 'INTEL_PROFILE_NOT_FOUND' using errcode='P0002'; end if;

  if p.status<>'ACTIVE' then
    for r in
      select signal_id
      from public.technical_signal_profile_matches
      where owner_id=p_actor and profile_id=p_profile_id and is_active
    loop
      result:=public.evaluate_technical_signal_profile_match(p_actor,r.signal_id,p_profile_id);
      checked:=checked+1;
      if coalesce((result->>'changed')::boolean,false) then changed:=changed+1; end if;
    end loop;
    return jsonb_build_object('signals_checked',checked,'matches_active',0,'matches_changed',changed);
  end if;

  for r in
    select distinct q.signal_id from (
      -- Direct exact source-backed identity/context candidates.
      select a.signal_id
      from public.intel_profile_items i
      join public.technical_signal_entity_assertions a
        on a.owner_id=i.owner_id and a.entity_kind::text=i.kind::text
      join public.technical_signals s
        on s.owner_id=a.owner_id and s.id=a.signal_id
      where i.owner_id=p_actor and i.profile_id=p_profile_id and i.state='ACTIVE' and i.kind<>'KEYWORD'
        and s.lifecycle='ACTIVE'
        and s.last_seen_at>=now()-make_interval(days=>p.time_horizon_days)
        and (
          (i.kind='INDICATOR' and a.normalized_value=i.normalized_value)
          or (i.kind<>'INDICATOR' and lower(a.normalized_value)=lower(i.normalized_value))
        )

      union

      -- Canonical identity candidates after Phase 2.3D resolution.
      select a.signal_id
      from public.intel_profile_items i
      join public.technical_signal_entity_assertions a
        on a.owner_id=i.owner_id and a.entity_kind::text=i.kind::text
      join public.technical_entity_assertion_resolutions ar
        on ar.owner_id=a.owner_id and ar.assertion_id=a.id and ar.status='RESOLVED'
      join public.technical_entities e
        on e.owner_id=ar.owner_id and e.id=ar.entity_id and e.status='ACTIVE'
      join public.technical_signals s
        on s.owner_id=a.owner_id and s.id=a.signal_id
      where i.owner_id=p_actor and i.profile_id=p_profile_id and i.state='ACTIVE'
        and s.lifecycle='ACTIVE'
        and s.last_seen_at>=now()-make_interval(days=>p.time_horizon_days)
        and (
          (i.kind='INDICATOR' and e.canonical_normalized=i.normalized_value)
          or (i.kind<>'INDICATOR' and lower(e.canonical_normalized)=lower(i.normalized_value))
        )

      union

      -- Conservative unresolved compound PRODUCT candidate. This is candidate
      -- generation only; evaluate_technical_signal_profile_match remains the
      -- authority for whether the signal actually matches.
      select s.id
      from public.intel_profile_items i
      join public.technical_signals s on s.owner_id=i.owner_id
      join public.technical_signal_entity_assertions pa
        on pa.owner_id=s.owner_id and pa.signal_id=s.id and pa.entity_kind='PRODUCT'
      left join public.technical_entity_assertion_resolutions pr
        on pr.owner_id=pa.owner_id and pr.assertion_id=pa.id
      where i.owner_id=p_actor and i.profile_id=p_profile_id and i.state='ACTIVE' and i.kind='PRODUCT'
        and s.lifecycle='ACTIVE'
        and s.last_seen_at>=now()-make_interval(days=>p.time_horizon_days)
        and (pr.id is null or pr.status='NEEDS_REVIEW')
        and lower(s.title||' '||s.summary) like '%'||lower(i.normalized_value)||'%'
        and exists(
          select 1
          from public.technical_signal_entity_assertions va
          left join public.technical_entity_assertion_resolutions vr
            on vr.owner_id=va.owner_id and vr.assertion_id=va.id
          where va.owner_id=s.owner_id and va.signal_id=s.id and va.entity_kind='VENDOR'
            and (vr.id is null or vr.status<>'DISMISSED')
            and lower(i.normalized_value)=lower(va.normalized_value||' '||pa.normalized_value)
        )

      union

      -- Explicit keyword scope is contextual and bounded by profile time horizon.
      select s.id
      from public.intel_profile_items i
      join public.technical_signals s on s.owner_id=i.owner_id
      where i.owner_id=p_actor and i.profile_id=p_profile_id and i.state='ACTIVE'
        and i.kind='KEYWORD' and char_length(i.normalized_value)>=3
        and s.lifecycle='ACTIVE'
        and s.last_seen_at>=now()-make_interval(days=>p.time_horizon_days)
        and lower(s.title||' '||s.summary) like '%'||lower(i.normalized_value)||'%'

      union

      -- Existing projections must always be revisited so removed/excluded/profile
      -- status changes can deactivate them deterministically.
      select m.signal_id
      from public.technical_signal_profile_matches m
      where m.owner_id=p_actor and m.profile_id=p_profile_id
    ) q
  loop
    result:=public.evaluate_technical_signal_profile_match(p_actor,r.signal_id,p_profile_id);
    checked:=checked+1;
    if coalesce((result->>'matched')::boolean,false) then matched:=matched+1; end if;
    if coalesce((result->>'changed')::boolean,false) then changed:=changed+1; end if;
  end loop;

  return jsonb_build_object('signals_checked',checked,'matches_active',matched,'matches_changed',changed);
end$$;

revoke all on function public.evaluate_technical_profile(uuid,uuid) from public,anon,authenticated;
grant execute on function public.evaluate_technical_profile(uuid,uuid) to service_role;

commit;
