#!/usr/bin/env bash
set -euo pipefail

command -v psql >/dev/null || { echo 'PostgreSQL 16+ psql is required'; exit 2; }
command -v createdb >/dev/null || { echo 'PostgreSQL createdb/dropdb are required'; exit 2; }
major=$(psql --version | sed -E 's/.* ([0-9]+).*/\1/')
(( major >= 16 )) || { echo 'PostgreSQL 16+ is required'; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="citem_direction_stage1_$$"
PRE_SQL=$(mktemp)
chmod 0644 "$PRE_SQL"

if [[ "$(id -un)" == "root" ]] && command -v runuser >/dev/null; then
  PSQL=(runuser -u postgres -- psql)
  CREATEDB=(runuser -u postgres -- createdb)
  DROPDB=(runuser -u postgres -- dropdb)
else
  PSQL=(psql)
  CREATEDB=(createdb)
  DROPDB=(dropdb)
fi
trap 'rm -f "$PRE_SQL"; "${DROPDB[@]}" --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

"${CREATEDB[@]}" "$DB"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
do $$begin create role authenticated;exception when duplicate_object then null;end$$;
do $$begin create role service_role bypassrls;exception when duplicate_object then null;end$$;
do $$begin create role anon;exception when duplicate_object then null;end$$;
create schema extensions;
create extension pgcrypto with schema extensions;
create schema auth;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt()returns jsonb language sql stable as $$select '{}'::jsonb$$;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
create function storage.foldername(name text)returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
create function storage.filename(name text)returns text language sql immutable as $$select(string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)]$$;
SQL

find "$ROOT/supabase/migrations" -maxdepth 1 -name '*.sql' ! -name '202609110053_investigation_direction_stage1.sql' | sort | while read -r migration; do
  printf "\\i '%s'\n" "$migration"
done > "$PRE_SQL"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$PRE_SQL" >/dev/null

"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
insert into auth.users(id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');

insert into public.projects(id,owner_id,name,research_type,priority)
values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Direction owner one','CTI','MEDIUM'),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Direction owner two','CTI','MEDIUM');

insert into public.sources(id,project_id,title,source_type,created_by)
values
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Owner one source','TECHNICAL_REPORT','10000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Owner two source','TECHNICAL_REPORT','10000000-0000-4000-8000-000000000002');
SQL

"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/202609110053_investigation_direction_stage1.sql" >/dev/null

"${PSQL[@]}" -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
update public.projects
set purpose='Evaluate warning value',
    intended_consumer='Operational CTI lead',
    decision_context='Support monitoring priorities',
    expected_product_type='Operational Threat Assessment',
    due_at='2026-09-20T12:00:00+02:00',
    scope_geography=array['Poland'],
    scope_sectors=array['Energy'],
    scope_time_start='2026-01-01',
    scope_time_end='2026-12-31'
where id='20000000-0000-4000-8000-000000000001';

do $$
declare
  q uuid;
  g uuid;
  k uuid;
begin
  insert into public.investigation_questions(project_id,question,created_by)
  values('20000000-0000-4000-8000-000000000001','When did precursor activity begin?','10000000-0000-4000-8000-000000000001')
  returning id into q;

  insert into public.investigation_information_gaps(project_id,description,created_by)
  values('20000000-0000-4000-8000-000000000001','Initial access date is unknown.','10000000-0000-4000-8000-000000000001')
  returning id into g;

  insert into public.investigation_working_knowledge(project_id,statement,created_by)
  values('20000000-0000-4000-8000-000000000001','CERT reporting exists for the incident.','10000000-0000-4000-8000-000000000001')
  returning id into k;

  insert into public.investigation_working_knowledge_support(project_id,knowledge_id,source_id,created_by)
  values('20000000-0000-4000-8000-000000000001',k,'30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');

  begin
    insert into public.investigation_working_knowledge_support(project_id,knowledge_id,source_id,created_by)
    values('20000000-0000-4000-8000-000000000001',k,'30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001');
    raise exception 'cross-Investigation provenance link was accepted';
  exception when foreign_key_violation then
    null;
  end;

  begin
    update public.projects
    set scope_time_start='2026-12-31', scope_time_end='2026-01-01'
    where id='20000000-0000-4000-8000-000000000001';
    raise exception 'inverted scope date range was accepted';
  exception when check_violation then
    null;
  end;
end $$;

-- The Supabase environment grants table access to authenticated by default.
-- The isolated acceptance database grants it explicitly so the test can exercise RLS itself.
grant usage on schema public to authenticated;
grant select,insert,update,delete on public.projects to authenticated;
grant select,insert,update,delete on public.investigation_questions to authenticated;
grant select,insert,update,delete on public.investigation_information_gaps to authenticated;
grant select,insert,update,delete on public.investigation_working_knowledge to authenticated;
grant select,insert,update,delete on public.investigation_working_knowledge_support to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);

do $$
begin
  if (select count(*) from public.investigation_questions where project_id='20000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'owner could not read own Direction question';
  end if;

  insert into public.investigation_questions(project_id,question,created_by)
  values('20000000-0000-4000-8000-000000000001','Does the activity recur across incidents?','10000000-0000-4000-8000-000000000001');
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);

do $$
begin
  if (select count(*) from public.investigation_questions where project_id='20000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'RLS exposed another owner''s Direction questions';
  end if;

  begin
    insert into public.investigation_information_gaps(project_id,description,created_by)
    values('20000000-0000-4000-8000-000000000001','Unauthorized gap attempt.','10000000-0000-4000-8000-000000000002');
    raise exception 'RLS accepted cross-owner Direction insert';
  exception when insufficient_privilege then
    null;
  end;
end $$;
reset role;
SQL

echo 'Investigation Direction Stage 1 migration acceptance passed.'
