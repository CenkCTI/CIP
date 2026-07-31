#!/usr/bin/env bash
set -euo pipefail
command -v psql >/dev/null||{ echo 'PostgreSQL 16+ psql is required';exit 2;}; major=$(psql --version|sed -E 's/.* ([0-9]+).*/\1/');((major>=16))||exit 2
DB="citem_phase2_2b1_$$";tmp=$(mktemp);trap 'rm -f "$tmp";dropdb --if-exists "$DB" >/dev/null 2>&1||true' EXIT;createdb "$DB"
psql -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
do $$begin create role authenticated;exception when duplicate_object then null;end$$;do $$begin create role service_role;exception when duplicate_object then null;end$$;do $$begin create role anon;exception when duplicate_object then null;end$$;create schema extensions;create extension pgcrypto with schema extensions;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt()returns jsonb language sql stable as $$select '{}'::jsonb$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);create function storage.foldername(name text)returns text[] language sql immutable as $$select string_to_array(name,'/')$$;create function storage.filename(name text)returns text language sql immutable as $$select(string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)]$$;
SQL
find supabase/migrations -maxdepth 1 -name '*.sql'|sort|head -24|while read -r m;do printf "\\i '%s/%s'\n" "$PWD" "$m";done >"$tmp";psql -v ON_ERROR_STOP=1 -d "$DB" -f "$tmp" >/dev/null
psql -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
insert into auth.users(id) values
 ('10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002');
insert into projects(id,owner_id,name,research_type) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Owner one','CTI'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Owner two','CTI');
SQL
psql -v ON_ERROR_STOP=1 -d "$DB" -f supabase/migrations/202607310025_phase2_2b_osint_intelligence_feed.sql >/dev/null
psql -v ON_ERROR_STOP=1 -d "$DB" -f supabase/migrations/202607310026_phase2_2b1_json_feed_support.sql >/dev/null
psql -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
-- Project-scoped JSON_FEED completion with a realistic normalized item.
do $$
declare f research_feed_sources; c record; payload jsonb := jsonb_build_array(jsonb_build_object(
 'external_id','json-project-1','title','Project JSON item','canonical_url','https://items.example/project-json',
 'summary_text','summary','content_text','body','author_name','Analyst','published_at','2026-07-31T12:00:00Z',
 'source_updated_at','2026-07-31T12:05:00Z','language','en','categories',jsonb_build_array('osint'),
 'url_hash',repeat('1',64),'content_hash',repeat('2',64)));
begin
 f:=create_research_feed('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Project JSON','','https://feeds.example/project.json',repeat('a',64),true);
 select * into c from claim_research_feed_fetch(f.created_by,f.project_id,f.id);
 begin perform complete_research_feed_fetch(f.created_by,f.project_id,f.id,c.run_id,gen_random_uuid(),c.request_url_hash,'SUCCEEDED','JSON_FEED',c.configured_url,200,100,null,null,payload);raise exception 'wrong lease accepted';exception when others then if sqlerrm='wrong lease accepted'then raise;end if;end;
 begin perform complete_research_feed_fetch(f.created_by,f.project_id,f.id,gen_random_uuid(),c.lease_token,c.request_url_hash,'SUCCEEDED','JSON_FEED',c.configured_url,200,100,null,null,payload);raise exception 'wrong run accepted';exception when others then if sqlerrm='wrong run accepted'then raise;end if;end;
 begin perform complete_research_feed_fetch(f.created_by,f.project_id,f.id,c.run_id,c.lease_token,repeat('f',64),'SUCCEEDED','JSON_FEED',c.configured_url,200,100,null,null,payload);raise exception 'wrong hash accepted';exception when others then if sqlerrm='wrong hash accepted'then raise;end if;end;
 begin perform complete_research_feed_fetch('10000000-0000-4000-8000-000000000002',f.project_id,f.id,c.run_id,c.lease_token,c.request_url_hash,'SUCCEEDED','JSON_FEED',c.configured_url,200,100,null,null,payload);raise exception 'wrong owner accepted';exception when others then if sqlerrm='wrong owner accepted'then raise;end if;end;
 perform complete_research_feed_fetch(f.created_by,f.project_id,f.id,c.run_id,c.lease_token,c.request_url_hash,'SUCCEEDED','JSON_FEED',c.configured_url,200,100,'"etag"','Thu, 31 Jul 2026 12:00:00 GMT',payload);
 if (select detected_feed_type from research_feed_sources where id=f.id)<>'JSON_FEED' or (select fetch_lease_run_id from research_feed_sources where id=f.id)is not null then raise exception 'project JSON completion/lease failed';end if;
 if not exists(select 1 from research_items where project_id=f.project_id and title='Project JSON item') or not exists(select 1 from research_item_fingerprints where project_id=f.project_id and fingerprint_hash=repeat('2',64)) or not exists(select 1 from research_feed_item_observations where project_id=f.project_id and feed_source_id=f.id) then raise exception 'project JSON persistence failed';end if;
end$$;

-- RSS, Atom, and HTTP 304 project regressions.
do $$declare f research_feed_sources;c record;t research_feed_type;begin
 foreach t in array array['RSS'::research_feed_type,'ATOM'::research_feed_type] loop
  f:=create_research_feed('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',t::text,'','https://feeds.example/'||lower(t::text),encode(digest(t::text,'sha256'),'hex'),true);
  select * into c from claim_research_feed_fetch(f.created_by,f.project_id,f.id);
  perform complete_research_feed_fetch(f.created_by,f.project_id,f.id,c.run_id,c.lease_token,c.request_url_hash,'SUCCEEDED',t,c.configured_url,200,0,null,null,'[]');
 end loop;
 f:=create_research_feed('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Not modified','','https://feeds.example/304',repeat('3',64),true);select * into c from claim_research_feed_fetch(f.created_by,f.project_id,f.id);perform complete_research_feed_fetch(f.created_by,f.project_id,f.id,c.run_id,c.lease_token,c.request_url_hash,'NOT_MODIFIED','UNKNOWN',c.configured_url,304,0,null,null,'[]');
end$$;

-- Global manual JSON completion and provenance.
do $$declare f research_feed_sources;f2 research_feed_sources;c record;c2 record;payload jsonb:=jsonb_build_array(jsonb_build_object('external_id','global-1','title','Global JSON item','canonical_url','https://items.example/global-json','summary_text','summary','content_text','body','language','en','categories',jsonb_build_array('global'),'url_hash',repeat('4',64),'content_hash',repeat('5',64)));begin
 f:=create_global_research_feed('10000000-0000-4000-8000-000000000001','Global JSON','','https://feeds.example/global.json',repeat('6',64),true,true,15);select * into c from claim_global_research_feed_fetch(f.owner_id,f.id,'MANUAL');if(select trigger_type from research_feed_fetch_runs where id=c.run_id)<>'MANUAL'then raise exception 'manual trigger missing';end if;perform complete_global_research_feed_fetch(c.owner_id,c.feed_source_id,c.run_id,c.lease_token,c.request_url_hash,'SUCCEEDED','JSON_FEED',c.configured_url,200,100,null,null,payload);
 if not exists(select 1 from research_items where owner_id=c.owner_id and project_id is null and title='Global JSON item') or not exists(select 1 from research_feed_item_observations where owner_id=c.owner_id and feed_source_id=c.feed_source_id) or (select fetch_lease_run_id from research_feed_sources where id=c.feed_source_id)is not null then raise exception 'global JSON persistence/lease failed';end if;
 f2:=create_global_research_feed('10000000-0000-4000-8000-000000000002','Owner two JSON','','https://feeds.example/owner-two.json',repeat('9',64),true,false,15);select * into c2 from claim_global_research_feed_fetch(f2.owner_id,f2.id,'MANUAL');perform complete_global_research_feed_fetch(c2.owner_id,c2.feed_source_id,c2.run_id,c2.lease_token,c2.request_url_hash,'SUCCEEDED','JSON_FEED',c2.configured_url,200,100,null,null,payload);if(select count(*) from research_items where title='Global JSON item')<>2 then raise exception 'cross-owner data merged';end if;
end$$;

-- Scheduled completion advances scheduling; oversized completion rejects then exact failure releases the lease.
do $$declare f research_feed_sources;c record;before_at timestamptz;huge jsonb;begin
 f:=create_global_research_feed('10000000-0000-4000-8000-000000000001','Scheduled JSON','','https://feeds.example/scheduled.json',repeat('7',64),true,true,15);update research_feed_sources set next_scheduled_fetch_at=clock_timestamp()-interval '1 minute' where id=f.id returning next_scheduled_fetch_at into before_at;select * into c from claim_due_global_research_feed_fetches(20) where feed_source_id=f.id;if(select trigger_type from research_feed_fetch_runs where id=c.run_id)<>'SCHEDULED'then raise exception 'scheduled trigger missing';end if;perform complete_global_research_feed_fetch(c.owner_id,c.feed_source_id,c.run_id,c.lease_token,c.request_url_hash,'SUCCEEDED','JSON_FEED',c.configured_url,200,0,null,null,'[]');if(select next_scheduled_fetch_at from research_feed_sources where id=f.id)<=before_at then raise exception 'schedule did not advance';end if;
 f:=create_global_research_feed('10000000-0000-4000-8000-000000000001','Oversized','','https://feeds.example/large.json',repeat('8',64),true,false,15);select * into c from claim_global_research_feed_fetch(f.owner_id,f.id,'MANUAL');select jsonb_agg(jsonb_build_object('title',g)) into huge from generate_series(1,501)g;begin perform complete_global_research_feed_fetch(c.owner_id,c.feed_source_id,c.run_id,c.lease_token,c.request_url_hash,'SUCCEEDED','JSON_FEED',c.configured_url,200,1,null,null,huge);raise exception 'oversized accepted';exception when others then if sqlerrm='oversized accepted'then raise;end if;end;perform fail_global_research_feed_fetch(c.owner_id,c.feed_source_id,c.run_id,c.lease_token,c.request_url_hash,'INVALID','safe');if(select fetch_lease_run_id from research_feed_sources where id=f.id)is not null then raise exception 'failure lease not released';end if;
end$$;

-- Enum, ACL, and cross-owner fingerprint isolation assertions.
do $$begin
 begin perform 'ARBITRARY'::research_feed_type;raise exception 'arbitrary accepted';exception when invalid_text_representation then null;end;
 if has_function_privilege('authenticated','public.complete_research_feed_fetch(uuid,uuid,uuid,uuid,uuid,text,public.research_feed_run_status,public.research_feed_type,text,integer,integer,text,text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.complete_global_research_feed_fetch(uuid,uuid,uuid,uuid,text,public.research_feed_run_status,public.research_feed_type,text,integer,integer,text,text,jsonb)','EXECUTE') then raise exception 'authenticated completion grant';end if;
end$$;
SQL
printf 'PostgreSQL %s; migrations 001-026; project/global/scheduled JSON_FEED; RSS, Atom, 304, lease, owner, bounds, ACL and persistence assertions passed.\n' "$(psql -Atqc 'show server_version' -d "$DB")"
