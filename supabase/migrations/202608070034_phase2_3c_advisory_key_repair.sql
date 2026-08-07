-- Phase 2.3C live-acceptance repair.
-- Migration 032 is immutable and has already been applied in operator environments.
-- Replace only the canonical-key validator to fix regex concatenation precedence for
-- TECHNICAL_ADVISORY and report-shaped Technical Signal types.

create or replace function public.technical_signal_validate_canonical_key(
  t public.technical_signal_type,
  k text,
  ss text,
  sr text
) returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  it public.indicator_type;
  v text;
  n text;
  source_pattern text;
begin
  if k is null or k <> trim(k) or char_length(k) > 700 then
    raise exception 'INVALID_CANONICAL_KEY' using errcode = '22023';
  end if;

  if t = 'VULNERABILITY_CHANGE' then
    if k !~ '^cve:CVE-[0-9]{4}-[0-9]{4,}$' then
      raise exception 'INVALID_CANONICAL_KEY' using errcode = '22023';
    end if;
  elsif t = 'ACTIVE_EXPLOITATION' then
    if k !~ '^cve:CVE-[0-9]{4}-[0-9]{4,}$'
       and k !~ '^report:[a-z0-9][a-z0-9._-]*:[^[:cntrl:]]+$' then
      raise exception 'INVALID_CANONICAL_KEY' using errcode = '22023';
    end if;
  elsif t = 'IOC_OBSERVATION' then
    if k !~ '^indicator:(IP|CIDR|DOMAIN|URL|HASH|EMAIL):.+' then
      raise exception 'INVALID_CANONICAL_KEY' using errcode = '22023';
    end if;
    it := split_part(k, ':', 2)::public.indicator_type;
    v := substring(k from char_length('indicator:' || it::text || ':') + 1);
    n := public.intel_profile_validate_indicator(v, it);
    if k <> 'indicator:' || it::text || ':' || n then
      raise exception 'INVALID_CANONICAL_KEY' using errcode = '22023';
    end if;
  elsif t = 'TTP_UPDATE' then
    if k !~ '^attack:T[0-9]{4}(\.[0-9]{3})?$' then
      raise exception 'INVALID_CANONICAL_KEY' using errcode = '22023';
    end if;
  else
    source_pattern := (case when t = 'TECHNICAL_ADVISORY' then '^advisory:' else '^report:' end)
      || '[a-z0-9][a-z0-9._-]*:[^[:cntrl:]]+$';
    if k !~ source_pattern then
      raise exception 'INVALID_CANONICAL_KEY' using errcode = '22023';
    end if;
  end if;

  if k ~ '^(report|advisory):'
     and k <> split_part(k, ':', 1) || ':' || lower(trim(ss)) || ':' || trim(sr) then
    raise exception 'INVALID_CANONICAL_KEY' using errcode = '22023';
  end if;
end
$$;

-- Preserve the Phase 2.3B helper boundary explicitly.
revoke all on function public.technical_signal_validate_canonical_key(
  public.technical_signal_type,
  text,
  text,
  text
) from public, anon, authenticated, service_role;

-- Non-mutating executable regression assertions for the exact live failure class.
do $$
begin
  perform public.technical_signal_validate_canonical_key(
    'TECHNICAL_ADVISORY',
    'advisory:test-synthetic:advisory-001',
    'test-synthetic',
    'advisory-001'
  );
  perform public.technical_signal_validate_canonical_key(
    'TECHNICAL_REPORT',
    'report:test-synthetic:report-001',
    'test-synthetic',
    'report-001'
  );

  begin
    perform public.technical_signal_validate_canonical_key(
      'TECHNICAL_ADVISORY',
      'advisory:test-synthetic:advisory-001',
      'different-source',
      'advisory-001'
    );
    raise exception 'SOURCE_DEFINED_KEY_MISMATCH_ACCEPTED';
  exception
    when invalid_parameter_value then null;
  end;
end
$$;
