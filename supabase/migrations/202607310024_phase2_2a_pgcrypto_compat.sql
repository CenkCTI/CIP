-- Phase 2.2A Supabase pgcrypto compatibility.
-- Supabase installs pgcrypto in `extensions`; the feed RPCs deliberately call a locked-down public wrapper.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto' and n.nspname = 'extensions'
  ) then
    raise exception 'pgcrypto_must_be_installed_in_extensions_schema' using errcode = '55000';
  end if;
end
$$;

create or replace function public.digest(data text, algorithm text)
returns bytea
language sql
immutable
strict
parallel safe
security invoker
set search_path = ''
as $$
  select extensions.digest(data, algorithm)
$$;

revoke all on function public.digest(text, text) from public, anon, authenticated;
grant usage on schema extensions to service_role;
grant execute on function extensions.digest(text, text) to service_role;
grant execute on function public.digest(text, text) to service_role;
