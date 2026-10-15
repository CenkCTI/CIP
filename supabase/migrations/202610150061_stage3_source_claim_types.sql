-- CITEM Stage 3 — Source Claim type taxonomy hardening
-- Forward migration for environments where migration 060 may already have
-- been applied with the earlier claim-kind taxonomy.

drop function if exists public.create_source_claim_from_annotation(
  uuid,
  uuid,
  text,
  public.source_claim_kind,
  public.source_claim_stance,
  text,
  public.source_annotation_mapping_origin
);

drop type if exists public.source_claim_kind_v2;
create type public.source_claim_kind_v2 as enum (
  'TARGETING',
  'OPERATIONAL_PURPOSE',
  'OPERATIONAL_OUTCOME',
  'INFRASTRUCTURE',
  'GEOPOLITICAL_CONTEXT',
  'CAPABILITY',
  'SOURCE_ASSESSMENT',
  'OTHER'
);

alter table public.source_claims
  alter column claim_kind drop default;

alter table public.source_claims
  alter column claim_kind
  type public.source_claim_kind_v2
  using (
    case claim_kind::text
      when 'TARGETING' then 'TARGETING'
      when 'OPERATIONAL_PURPOSE' then 'OPERATIONAL_PURPOSE'
      when 'OPERATIONAL_OUTCOME' then 'OPERATIONAL_OUTCOME'
      when 'INFRASTRUCTURE' then 'INFRASTRUCTURE'
      when 'GEOPOLITICAL_CONTEXT' then 'GEOPOLITICAL_CONTEXT'
      when 'CAPABILITY' then 'CAPABILITY'
      when 'SOURCE_ASSESSMENT' then 'SOURCE_ASSESSMENT'
      when 'OTHER' then 'OTHER'
      when 'INTENT_OBJECTIVE' then 'OPERATIONAL_PURPOSE'
      when 'IMPACT' then 'OPERATIONAL_OUTCOME'
      else 'OTHER'
    end
  )::public.source_claim_kind_v2;

drop type public.source_claim_kind;
alter type public.source_claim_kind_v2 rename to source_claim_kind;

alter table public.source_claims
  alter column claim_kind set default 'OTHER'::public.source_claim_kind;

create or replace function public.create_source_claim_from_annotation(
  p_project_id uuid,
  p_source_annotation_id uuid,
  p_claim_summary text,
  p_claim_kind public.source_claim_kind,
  p_stance public.source_claim_stance,
  p_source_qualifier text,
  p_mapping_origin public.source_annotation_mapping_origin
)
returns table(source_claim_id uuid, assertion_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_claim uuid;
  v_assertion uuid;
  v_qualifier text := nullif(trim(p_source_qualifier),'');
begin
  if v_user is null or not public.project_is_owned(p_project_id) then
    raise exception 'PROJECT_NOT_OWNED';
  end if;
  if char_length(trim(coalesce(p_claim_summary,''))) < 1
     or char_length(trim(p_claim_summary)) > 10000 then
    raise exception 'INVALID_SOURCE_CLAIM_SUMMARY';
  end if;
  if p_claim_kind::text not in (
    'TARGETING',
    'OPERATIONAL_PURPOSE',
    'OPERATIONAL_OUTCOME',
    'INFRASTRUCTURE',
    'GEOPOLITICAL_CONTEXT',
    'CAPABILITY',
    'SOURCE_ASSESSMENT',
    'OTHER'
  ) then
    raise exception 'INVALID_SOURCE_CLAIM_TYPE';
  end if;
  if v_qualifier is not null and char_length(v_qualifier) > 1000 then
    raise exception 'INVALID_SOURCE_QUALIFIER';
  end if;
  if not exists(
    select 1
    from public.source_annotations a
    where a.project_id=p_project_id
      and a.id=p_source_annotation_id
  ) then
    raise exception 'SOURCE_ANNOTATION_NOT_FOUND';
  end if;

  insert into public.source_claims(
    project_id,claim_summary,claim_kind,created_by
  ) values (
    p_project_id,trim(p_claim_summary),p_claim_kind,v_user
  )
  returning id into v_claim;

  insert into public.source_claim_assertions(
    project_id,source_claim_id,source_annotation_id,stance,source_qualifier,
    mapping_origin,assertion_action,created_by
  ) values (
    p_project_id,v_claim,p_source_annotation_id,p_stance,v_qualifier,
    p_mapping_origin,'CREATED',v_user
  )
  returning id into v_assertion;

  return query select v_claim,v_assertion;
end
$$;

revoke all on function public.create_source_claim_from_annotation(
  uuid,
  uuid,
  text,
  public.source_claim_kind,
  public.source_claim_stance,
  text,
  public.source_annotation_mapping_origin
) from public;

grant execute on function public.create_source_claim_from_annotation(
  uuid,
  uuid,
  text,
  public.source_claim_kind,
  public.source_claim_stance,
  text,
  public.source_annotation_mapping_origin
) to authenticated;

comment on type public.source_claim_kind is
  'Stage 3 Source Claim type taxonomy: targeting, operational purpose/outcome, infrastructure, geopolitical context, capability, source assessment, or other.';
