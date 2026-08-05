#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
M="$ROOT/supabase/migrations/202608050031_phase2_3a_techint_profiles.sql"
test -f "$M"
for needle in "create table public.intel_profiles" "create table public.intel_profile_items" "create table public.intel_profile_audit_events" "enable row level security" "intel_profiles_one_open_investigation_profile" "origin <> 'SUGGESTED'" "kind not in ('COUNTRY','REGION')"; do
  grep -Fq "$needle" "$M"
done
if git diff --name-only -- supabase/migrations | grep -Ev '202608050031_phase2_3a_techint_profiles.sql$' | grep -q .; then
  echo "Unexpected changes to immutable migrations 001-030" >&2
  exit 1
fi
echo "Phase 2.3A migration checks passed. For full SQL execution, run all migrations 001-031 in an isolated PostgreSQL/Supabase test database."
