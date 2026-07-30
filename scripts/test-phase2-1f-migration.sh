#!/usr/bin/env bash
set -euo pipefail
command -v psql >/dev/null || { echo 'PostgreSQL 16+ psql is required'; exit 2; }
major=$(psql --version | sed -E 's/.* ([0-9]+).*/\1/'); (( major >= 16 )) || { echo 'PostgreSQL 16+ is required'; exit 2; }
db="citem_phase21f_${RANDOM}_$$"; trap 'dropdb --if-exists "$db" >/dev/null 2>&1 || true' EXIT
createdb "$db"
# Transactional application proves 001-022 compose; the temporary database is always destroyed.
for migration in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 "$db" -f "$migration" >/dev/null; done
psql -v ON_ERROR_STOP=1 "$db" <<'SQL'
begin;
do $$ begin
 if to_regclass('public.report_versions') is null or to_regclass('public.report_version_references') is null then raise exception 'version tables missing'; end if;
 if not exists(select 1 from pg_class where oid='public.report_versions'::regclass and relrowsecurity) then raise exception 'RLS missing'; end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.report_versions'::regclass and tgname='guard_report_versions') then raise exception 'immutability trigger missing'; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.report_version_references'::regclass and conname='report_version_references_exactly_one') then raise exception 'exactly-one constraint missing'; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.reports'::regclass and conname='reports_authoritative_version_fk') then raise exception 'authoritative integrity missing'; end if;
end $$;
rollback;
SQL
echo 'Phase 2.1F migrations 001-022 and structural integrity checks passed on temporary PostgreSQL.'
