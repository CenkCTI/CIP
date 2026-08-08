-- Phase 2.3C completion: extend the fixed Technical Source registry without
-- rewriting the already-applied 033/034/035 migrations.

begin;
alter type public.technical_source_key add value if not exists 'FIRST_EPSS';
alter type public.technical_source_key add value if not exists 'THREATFOX';
alter type public.technical_source_key add value if not exists 'MALWAREBAZAAR';
commit;

begin;

create or replace function public.technical_source_validate_settings(
  p_source public.technical_source_key,
  p_settings jsonb,
  p_interval integer
) returns void language plpgsql immutable set search_path = '' as $$
declare
  lookback integer;
  epss numeric;
begin
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' or pg_column_size(p_settings) > 16384 then
    raise exception 'INVALID_SOURCE_SETTINGS' using errcode = '22023';
  end if;

  if p_source = 'TEST_SYNTHETIC' then
    if p_settings <> '{}'::jsonb or p_interval <> 0 then
      raise exception 'INVALID_SOURCE_SETTINGS' using errcode = '22023';
    end if;
  elsif p_source = 'CISA_KEV' then
    if p_settings <> '{}'::jsonb or p_interval not between 60 and 1440 then
      raise exception 'INVALID_SOURCE_SETTINGS' using errcode = '22023';
    end if;
  elsif p_source = 'NVD_CVE' then
    if p_interval not between 60 and 1440
       or p_settings - 'initialLookbackHours' <> '{}'::jsonb
       or (p_settings ? 'initialLookbackHours' and jsonb_typeof(p_settings->'initialLookbackHours') <> 'number') then
      raise exception 'INVALID_SOURCE_SETTINGS' using errcode = '22023';
    end if;
    lookback := coalesce((p_settings->>'initialLookbackHours')::integer, 24);
    if lookback not between 1 and 168 then
      raise exception 'INVALID_SOURCE_SETTINGS' using errcode = '22023';
    end if;
  elsif p_source = 'FIRST_EPSS' then
    if p_interval not between 60 and 1440
       or p_settings - 'minimumEpss' <> '{}'::jsonb
       or (p_settings ? 'minimumEpss' and jsonb_typeof(p_settings->'minimumEpss') <> 'number') then
      raise exception 'INVALID_SOURCE_SETTINGS' using errcode = '22023';
    end if;
    epss := coalesce((p_settings->>'minimumEpss')::numeric, 0.1);
    if epss < 0 or epss > 1 then
      raise exception 'INVALID_SOURCE_SETTINGS' using errcode = '22023';
    end if;
  elsif p_source = 'THREATFOX' then
    if p_interval not between 60 and 1440
       or p_settings - 'lookbackDays' <> '{}'::jsonb
       or (p_settings ? 'lookbackDays' and jsonb_typeof(p_settings->'lookbackDays') <> 'number') then
      raise exception 'INVALID_SOURCE_SETTINGS' using errcode = '22023';
    end if;
    lookback := coalesce((p_settings->>'lookbackDays')::integer, 1);
    if lookback not between 1 and 7 then
      raise exception 'INVALID_SOURCE_SETTINGS' using errcode = '22023';
    end if;
  elsif p_source = 'MALWAREBAZAAR' then
    if p_settings <> '{}'::jsonb or p_interval not between 60 and 1440 then
      raise exception 'INVALID_SOURCE_SETTINGS' using errcode = '22023';
    end if;
  else
    raise exception 'INVALID_SOURCE_SETTINGS' using errcode = '22023';
  end if;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_SOURCE_SETTINGS' using errcode = '22023';
end $$;

create or replace function public.technical_source_validate_cursor(
  p_source public.technical_source_key,
  p_cursor jsonb
) returns void language plpgsql immutable set search_path = '' as $$
declare
  version integer;
  cursor_epss numeric;
  cursor_lookback integer;
begin
  if p_cursor is null or jsonb_typeof(p_cursor) <> 'object' or pg_column_size(p_cursor) > 32768 then
    raise exception 'INVALID_CURSOR' using errcode = '22023';
  end if;
  version := (p_cursor->>'version')::integer;
  if version is distinct from 1 then raise exception 'UNSUPPORTED_CURSOR_VERSION' using errcode = '22023'; end if;

  if p_source = 'TEST_SYNTHETIC' then
    if p_cursor - array['version','sequence'] <> '{}'::jsonb
       or (p_cursor ? 'sequence' and jsonb_typeof(p_cursor->'sequence') <> 'number')
       or coalesce((p_cursor->>'sequence')::integer, 0) < 0 then
      raise exception 'INVALID_CURSOR' using errcode = '22023';
    end if;
  elsif p_source = 'CISA_KEV' then
    if p_cursor - array['version','catalogRelease','etag','lastModified'] <> '{}'::jsonb
       or (p_cursor ? 'catalogRelease' and (jsonb_typeof(p_cursor->'catalogRelease') <> 'string' or char_length(p_cursor->>'catalogRelease') > 200))
       or (p_cursor ? 'etag' and (jsonb_typeof(p_cursor->'etag') <> 'string' or char_length(p_cursor->>'etag') > 500))
       or (p_cursor ? 'lastModified' and (jsonb_typeof(p_cursor->'lastModified') <> 'string' or char_length(p_cursor->>'lastModified') > 200)) then
      raise exception 'INVALID_CURSOR' using errcode = '22023';
    end if;
  elsif p_source = 'NVD_CVE' then
    if p_cursor - array['version','lastModifiedWatermark'] <> '{}'::jsonb
       or (p_cursor ? 'lastModifiedWatermark' and jsonb_typeof(p_cursor->'lastModifiedWatermark') <> 'string') then
      raise exception 'INVALID_CURSOR' using errcode = '22023';
    end if;
    if p_cursor->>'lastModifiedWatermark' is not null then perform (p_cursor->>'lastModifiedWatermark')::timestamptz; end if;
  elsif p_source = 'FIRST_EPSS' then
    if p_cursor - array['version','lastModified','minimumEpss'] <> '{}'::jsonb
       or (p_cursor ? 'lastModified' and (jsonb_typeof(p_cursor->'lastModified') <> 'string' or char_length(p_cursor->>'lastModified') > 200))
       or (p_cursor ? 'minimumEpss' and jsonb_typeof(p_cursor->'minimumEpss') <> 'number') then
      raise exception 'INVALID_CURSOR' using errcode = '22023';
    end if;
    if p_cursor ? 'minimumEpss' then
      cursor_epss := (p_cursor->>'minimumEpss')::numeric;
      if cursor_epss < 0 or cursor_epss > 1 then raise exception 'INVALID_CURSOR' using errcode = '22023'; end if;
    end if;
  elsif p_source = 'THREATFOX' then
    if p_cursor - array['version','maxProviderId','lookbackDays'] <> '{}'::jsonb
       or (p_cursor ? 'maxProviderId' and (jsonb_typeof(p_cursor->'maxProviderId') <> 'string' or (p_cursor->>'maxProviderId') !~ '^(0|[1-9][0-9]{0,39})$'))
       or (p_cursor ? 'lookbackDays' and jsonb_typeof(p_cursor->'lookbackDays') <> 'number') then
      raise exception 'INVALID_CURSOR' using errcode = '22023';
    end if;
    if p_cursor ? 'lookbackDays' then
      cursor_lookback := (p_cursor->>'lookbackDays')::integer;
      if cursor_lookback not between 1 and 7 then raise exception 'INVALID_CURSOR' using errcode = '22023'; end if;
    end if;
  elsif p_source = 'MALWAREBAZAAR' then
    if p_cursor - array['version','lastFirstSeen'] <> '{}'::jsonb
       or (p_cursor ? 'lastFirstSeen' and jsonb_typeof(p_cursor->'lastFirstSeen') <> 'string') then
      raise exception 'INVALID_CURSOR' using errcode = '22023';
    end if;
    if p_cursor->>'lastFirstSeen' is not null then perform (p_cursor->>'lastFirstSeen')::timestamptz; end if;
  else
    raise exception 'INVALID_CURSOR' using errcode = '22023';
  end if;
exception
  when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'INVALID_CURSOR' using errcode = '22023';
end $$;

-- Keep source-specific defaults authoritative in the trusted database workflow.
create or replace function public.enable_technical_source(
  p_actor uuid,
  p_source public.technical_source_key,
  p_settings jsonb default '{}'::jsonb,
  p_interval_minutes integer default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.technical_source_connections; interval_value integer; initial_cursor jsonb;
begin
  if p_actor is null or not exists(select 1 from auth.users where id = p_actor) then
    raise exception 'INVALID_ACTOR' using errcode = '22023';
  end if;
  interval_value := coalesce(p_interval_minutes, case p_source
    when 'TEST_SYNTHETIC' then 0
    when 'CISA_KEV' then 360
    when 'NVD_CVE' then 120
    when 'FIRST_EPSS' then 360
    when 'THREATFOX' then 120
    when 'MALWAREBAZAAR' then 120
    else 120 end);
  perform public.technical_source_validate_settings(p_source, coalesce(p_settings,'{}'::jsonb), interval_value);
  initial_cursor := case p_source
    when 'TEST_SYNTHETIC' then '{"version":1,"sequence":0}'::jsonb
    when 'CISA_KEV' then '{"version":1}'::jsonb
    when 'NVD_CVE' then '{"version":1}'::jsonb
    when 'FIRST_EPSS' then '{"version":1}'::jsonb
    when 'THREATFOX' then '{"version":1}'::jsonb
    when 'MALWAREBAZAAR' then '{"version":1}'::jsonb
    else '{"version":1}'::jsonb end;
  insert into public.technical_source_connections(owner_id, source_key, status, settings, cursor, cursor_version, interval_minutes, next_run_at)
  values (p_actor, p_source, 'ENABLED', coalesce(p_settings,'{}'::jsonb), initial_cursor, 1, interval_value,
    case when p_source = 'TEST_SYNTHETIC' then null else now() end)
  on conflict (owner_id, source_key) do update
    set status = 'ENABLED', settings = excluded.settings, interval_minutes = excluded.interval_minutes,
        next_run_at = case when excluded.source_key = 'TEST_SYNTHETIC' then null else coalesce(public.technical_source_connections.next_run_at, now()) end
  returning * into c;
  perform public.technical_source_audit(p_actor, c.id, c.source_key,
    (case when c.created_at = c.updated_at then 'ENABLED' else 'RESTORED' end)::public.technical_source_audit_action,
    jsonb_build_object('intervalMinutes', c.interval_minutes));
  return c.id;
end $$;

-- CREATE OR REPLACE preserves the ACL established by migration 033; assert that
-- the trusted workflow did not accidentally become callable by browser roles.
do $$
begin
  if has_function_privilege('authenticated','public.enable_technical_source(uuid,public.technical_source_key,jsonb,integer)','EXECUTE')
     or has_function_privilege('authenticated','public.technical_source_validate_settings(public.technical_source_key,jsonb,integer)','EXECUTE')
     or has_function_privilege('authenticated','public.technical_source_validate_cursor(public.technical_source_key,jsonb)','EXECUTE') then
    raise exception 'TECHNICAL_SOURCE_ACL_REGRESSION';
  end if;
  if not has_function_privilege('service_role','public.enable_technical_source(uuid,public.technical_source_key,jsonb,integer)','EXECUTE') then
    raise exception 'TECHNICAL_SOURCE_SERVICE_ROLE_ACL_REGRESSION';
  end if;
end $$;

-- Non-mutating regression assertions for the newly registered source contracts.
do $$
begin
  perform public.technical_source_validate_settings('FIRST_EPSS', '{"minimumEpss":0.1}'::jsonb, 360);
  perform public.technical_source_validate_settings('THREATFOX', '{"lookbackDays":1}'::jsonb, 120);
  perform public.technical_source_validate_settings('MALWAREBAZAAR', '{}'::jsonb, 120);
  perform public.technical_source_validate_cursor('FIRST_EPSS', '{"version":1,"minimumEpss":0.1}'::jsonb);
  perform public.technical_source_validate_cursor('THREATFOX', '{"version":1,"maxProviderId":"123","lookbackDays":1}'::jsonb);
  perform public.technical_source_validate_cursor('MALWAREBAZAAR', '{"version":1,"lastFirstSeen":"2099-01-01T00:00:00Z"}'::jsonb);

  begin
    perform public.technical_source_validate_settings('FIRST_EPSS', '{"minimumEpss":1.1}'::jsonb, 360);
    raise exception 'invalid FIRST_EPSS settings accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.technical_source_validate_settings('THREATFOX', '{"lookbackDays":8}'::jsonb, 120);
    raise exception 'invalid THREATFOX settings accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.technical_source_validate_cursor('FIRST_EPSS', '{"version":1,"minimumEpss":1.1}'::jsonb);
    raise exception 'invalid FIRST_EPSS cursor accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.technical_source_validate_cursor('THREATFOX', '{"version":1,"maxProviderId":"-1","lookbackDays":1}'::jsonb);
    raise exception 'invalid THREATFOX cursor accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.technical_source_validate_cursor('THREATFOX', '{"version":1,"maxProviderId":"123","lookbackDays":8}'::jsonb);
    raise exception 'invalid THREATFOX lookback cursor accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;

commit;
