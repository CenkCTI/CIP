#!/usr/bin/env bash
set -euo pipefail
command -v psql >/dev/null || { echo 'PostgreSQL 16+ psql is required'; exit 2; }
major=$(psql --version | sed -E 's/.* ([0-9]+).*/\1/'); ((major>=16)) || { echo 'PostgreSQL 16+ is required'; exit 2; }
DB_NAME="citem_phase2_1f_${$}"; sql_file=$(mktemp)
cleanup(){ rm -f "$sql_file"; dropdb --if-exists "$DB_NAME" >/dev/null 2>&1 || true; }; trap cleanup EXIT
createdb "$DB_NAME"
psql -v ON_ERROR_STOP=1 -d "$DB_NAME" <<'SQL'
do $$ begin create role authenticated; exception when duplicate_object then null; end $$; do $$ begin create role anon; exception when duplicate_object then null; end $$; create extension pgcrypto; create schema auth;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$; create function storage.filename(name text) returns text language sql immutable as $$ select (string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)] $$;
SQL
{
 echo "BEGIN;"
 for migration in supabase/migrations/*.sql; do printf "\\i '%s/%s'\n" "$PWD" "$migration"; done
 cat <<'SQL'
do $$ declare u1 uuid:=gen_random_uuid();u2 uuid:=gen_random_uuid();p1 uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();r uuid;i1 uuid;i2 uuid;ref uuid;v1 record;v2 record;n integer; begin
 if (select count(*) from pg_class where oid in ('public.report_versions'::regclass,'public.report_references'::regclass,'public.report_version_references'::regclass) and relrowsecurity)<>3 then raise exception 'RLS missing';end if;
 if (select count(*) from pg_policies where tablename in ('report_versions','report_references','report_version_references'))<>5 then raise exception 'policy count mismatch';end if;
 insert into auth.users values(u1,'{}'),(u2,'{}');perform set_config('request.jwt.claim.sub',u1::text,true);
 insert into projects(id,owner_id,name,research_type) values(p1,u1,'One','CTI'),(p2,u2,'Two','CTI');
 insert into reports(project_id,title) values(p1,'Assessment') returning id into r;
 begin update reports set current_version_number=9 where id=r;raise exception 'direct counter update accepted';exception when insufficient_privilege then null;end;
 begin update reports set published_at=now() where id=r;raise exception 'direct publication timestamp accepted';exception when insufficient_privilege then null;end;
 perform update_report_product_metadata(p1,r,'OTHER','ARCHIVED');perform update_report_product_metadata(p1,r,'OTHER','APPROVED');
 if (select lifecycle_status from reports where id=r)<>'DRAFT' then raise exception 'unpublished restore did not preserve pre-archive state';end if;
 insert into indicators(project_id,value,type) values(p1,'198.51.100.1','IP') returning id into i1; insert into indicators(project_id,value,type) values(p2,'198.51.100.2','IP') returning id into i2;
 insert into report_references(project_id,report_id,reference_type,indicator_id,created_by) values(p1,r,'INDICATOR',i1,u1) returning id into ref;
 if (select label from report_references where id=ref)<>'198.51.100.1' then raise exception 'label not server-derived';end if;
 begin insert into report_references(project_id,report_id,reference_type,campaign_id,created_by) values(p1,r,'INDICATOR',i1,u1);raise exception 'type mismatch accepted';exception when check_violation or foreign_key_violation then null;end;
 begin insert into report_references(project_id,report_id,reference_type,indicator_id,created_by) values(p1,r,'INDICATOR',i1,u1);raise exception 'duplicate accepted';exception when unique_violation then null;end;
 begin insert into report_references(project_id,report_id,reference_type,indicator_id,created_by) values(p1,r,'INDICATOR',i2,u1);raise exception 'cross Investigation accepted';exception when foreign_key_violation then null;end;
 v1:=create_report_version(p1,r,'Initial','Executive','Judgment','MEDIUM','Gaps','Recommendations');
 if v1.version_number<>1 or (select count(*) from report_version_references where report_version_id=v1.id)<>1 then raise exception 'atomic snapshot failed';end if;
 perform set_config('citem.report_rpc','off',true);
 begin update reports set authoritative_version_id=v1.id where id=r;raise exception 'direct authoritative update accepted';exception when insufficient_privilege then null;end;
 begin update report_versions set version_status='PUBLISHED' where id=v1.id;raise exception 'direct publication accepted';exception when insufficient_privilege then null;end;
 begin update report_version_references set label_snapshot='changed' where report_version_id=v1.id;raise exception 'snapshot mutation accepted';exception when object_not_in_prerequisite_state then null;end;
 v1:=publish_report_version(p1,r,v1.id); if v1.version_status<>'PUBLISHED' or (select authoritative_version_id from reports where id=r)<>v1.id then raise exception 'publish failed';end if;
 perform update_report_product_metadata(p1,r,'OTHER','ARCHIVED');perform update_report_product_metadata(p1,r,'OTHER','DRAFT');
 if (select lifecycle_status from reports where id=r)<>'PUBLISHED' then raise exception 'published Report restored to editable state';end if;
 begin delete from report_versions where id=v1.id;raise exception 'published delete accepted';exception when object_not_in_prerequisite_state then null;end;
 v2:=create_report_version(p1,r,'Second','Executive 2','Judgment 2','HIGH','Gaps 2','Recommendations 2'); v2:=publish_report_version(p1,r,v2.id);
 if (select version_status from report_versions where id=v1.id)<>'SUPERSEDED' or v2.version_status<>'PUBLISHED' then raise exception 'supersession failed';end if;
 begin update reports set authoritative_version_id=v1.id where id=r;set constraints reports_authoritative_published immediate;raise exception 'superseded authority accepted';exception when check_violation then null;end;
 select current_version_number into n from reports where id=r; update reports set lifecycle_status='ARCHIVED' where id=r;
 begin perform create_report_version(p1,r,'Fail','Executive','Judgment','LOW','Gaps','Recommendations');raise exception 'archived version accepted';exception when insufficient_privilege then null;end;
 if (select current_version_number from reports where id=r)<>n then raise exception 'failed transaction incremented counter';end if;
end $$;
rollback;
SQL
} > "$sql_file"
psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -f "$sql_file" >/dev/null
echo 'Phase 2.1F PostgreSQL 16 transaction and behavioral assertions passed (not live Supabase validation).'
