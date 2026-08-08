-- Phase 2.3C completion: extend the fixed Technical Source registry without
-- rewriting the already-applied 033/034 collection migrations.

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
declare version integer;
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
    if p_cursor - array['version','lastModified'] <> '{}'::jsonb
       or (p_cursor ? 'lastModified' and (jsonb_typeof(p_cursor->'lastModified') <> 'string' or char_length(p_cursor->>'lastModified') > 200)) then
      raise exception 'INVALID_CURSOR' using errcode = '22023';
    end if;
  elsif p_source = 'THREATFOX' then
    if p_cursor - array['version','maxProviderId'] <> '{}'::jsonb
       or (p_cursor ? 'maxProviderId' and (jsonb_typeof(p_cursor->'maxProviderId') <> 'string' or (p_cursor->>'maxProviderId') !~ '^(0|[1-9][0-9]{0,39})$')) then
      raise exception 'INVALID_CURSOR' using errcode = '22023';
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
  when invalid_text_representation or datetime_field_overflow then
    raise exception 'INVALID_CURSOR' using errcode = '22023';
end $$;

-- Non-mutating regression assertions for the newly registered source contracts.
do $$
begin
  perform public.technical_source_validate_settings('FIRST_EPSS', '{"minimumEpss":0.1}'::jsonb, 360);
  perform public.technical_source_validate_settings('THREATFOX', '{"lookbackDays":1}'::jsonb, 120);
  perform public.technical_source_validate_settings('MALWAREBAZAAR', '{}'::jsonb, 120);
  perform public.technical_source_validate_cursor('FIRST_EPSS', '{"version":1}'::jsonb);
  perform public.technical_source_validate_cursor('THREATFOX', '{"version":1,"maxProviderId":"123"}'::jsonb);
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
    perform public.technical_source_validate_cursor('THREATFOX', '{"version":1,"maxProviderId":"-1"}'::jsonb);
    raise exception 'invalid THREATFOX cursor accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;

commit;
