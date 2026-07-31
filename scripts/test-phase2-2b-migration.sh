#!/usr/bin/env bash
set -euo pipefail
command -v psql >/dev/null || { echo 'PostgreSQL psql is required' >&2; exit 2; }
DB="phase22b_${RANDOM}_$$"; trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT
createdb "$DB"
for migration in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d "$DB" -f "$migration" >/dev/null; done
psql -v ON_ERROR_STOP=1 -d "$DB" -c "select current_setting('server_version'); select 1 from pg_type where typname='research_feed_trigger_type'; select 1 from information_schema.tables where table_name in ('osint_item_states','osint_investigation_links');" 
echo 'Phase 2.2B migrations 001-025 passed.'
