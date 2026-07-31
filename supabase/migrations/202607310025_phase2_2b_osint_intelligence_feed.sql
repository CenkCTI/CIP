-- Phase 2.2B: owner-scoped global OSINT, scheduled collection, triage and explicit Investigation links.
-- This additive migration intentionally retains nullable project_id as legacy provenance.
begin;
create type public.research_feed_trigger_type as enum ('MANUAL','SCHEDULED');

alter table public.research_feed_sources add column owner_id uuid references auth.users(id) on delete cascade,
 add column scheduler_enabled boolean not null default true,
 add column fetch_interval_minutes integer not null default 15,
 add column next_scheduled_fetch_at timestamptz,
 add column last_scheduled_fetch_at timestamptz,
 add column scheduling_updated_at timestamptz not null default now();
alter table public.research_feed_fetch_runs add column owner_id uuid references auth.users(id) on delete cascade,
 add column trigger_type public.research_feed_trigger_type not null default 'MANUAL';
alter table public.research_items add column owner_id uuid references auth.users(id) on delete cascade;
alter table public.research_item_fingerprints add column owner_id uuid references auth.users(id) on delete cascade;
alter table public.research_feed_item_observations add column owner_id uuid references auth.users(id) on delete cascade;

update public.research_feed_sources s set owner_id=p.owner_id from public.projects p where p.id=s.project_id;
update public.research_feed_fetch_runs r set owner_id=p.owner_id from public.projects p where p.id=r.project_id;
update public.research_items i set owner_id=p.owner_id from public.projects p where p.id=i.project_id;
update public.research_item_fingerprints f set owner_id=p.owner_id from public.projects p where p.id=f.project_id;
update public.research_feed_item_observations o set owner_id=p.owner_id from public.projects p where p.id=o.project_id;
do $$begin
 if exists(select 1 from public.research_feed_sources where owner_id is null) or exists(select 1 from public.research_feed_fetch_runs where owner_id is null) or exists(select 1 from public.research_items where owner_id is null) or exists(select 1 from public.research_item_fingerprints where owner_id is null) or exists(select 1 from public.research_feed_item_observations where owner_id is null) then raise exception 'PHASE_2_2B_OWNER_BACKFILL_FAILED'; end if;
end$$;

-- Resolve owner-local duplicate components by fingerprint. Recursive connectivity handles URL/content chains.
create temporary table osint_item_survivors on commit drop as
with recursive edges as (
 select distinct a.owner_id,a.research_item_id a,b.research_item_id b
 from public.research_item_fingerprints a join public.research_item_fingerprints b using(owner_id,fingerprint_type,fingerprint_hash)
 where a.research_item_id<>b.research_item_id
), reach(owner_id,item_id,member_id) as (
 select owner_id,a,a from edges union select owner_id,a,b from edges
 union select r.owner_id,r.item_id,e.b from reach r join edges e on e.owner_id=r.owner_id and e.a=r.member_id
), members as (select owner_id,item_id,member_id from reach union select owner_id,id,id from public.research_items), ranked as (
 select m.owner_id,m.member_id,first_value(m.member_id) over(partition by m.owner_id,m.item_id order by i.created_at,i.id) survivor
 from members m join public.research_items i on i.owner_id=m.owner_id and i.id=m.member_id
)
select owner_id,member_id,min(survivor::text)::uuid survivor from ranked group by owner_id,member_id;

update public.research_items s set first_seen_at=x.first_seen,last_seen_at=x.last_seen
from (select m.owner_id,m.survivor,min(i.first_seen_at) first_seen,max(i.last_seen_at) last_seen from osint_item_survivors m join public.research_items i on i.id=m.member_id and i.owner_id=m.owner_id group by m.owner_id,m.survivor)x
where s.id=x.survivor and s.owner_id=x.owner_id;
update public.research_item_fingerprints f set research_item_id=m.survivor from osint_item_survivors m where f.owner_id=m.owner_id and f.research_item_id=m.member_id and m.member_id<>m.survivor;
delete from public.research_item_fingerprints a using public.research_item_fingerprints b where a.owner_id=b.owner_id and a.fingerprint_type=b.fingerprint_type and a.fingerprint_hash=b.fingerprint_hash and a.id>b.id;

-- Combine source/item observations without losing counts; latest run wins deterministically.
create temporary table osint_observation_merge on commit drop as
select o.owner_id,o.feed_source_id,m.survivor research_item_id,min(o.first_seen_at) first_seen_at,max(o.last_seen_at) last_seen_at,sum(o.observation_count)::integer observation_count,(array_agg(o.fetch_run_id order by o.last_seen_at desc,o.id desc))[1] fetch_run_id
from public.research_feed_item_observations o join osint_item_survivors m on m.owner_id=o.owner_id and m.member_id=o.research_item_id group by o.owner_id,o.feed_source_id,m.survivor;
delete from public.research_feed_item_observations;
insert into public.research_feed_item_observations(id,project_id,owner_id,feed_source_id,research_item_id,fetch_run_id,first_seen_at,last_seen_at,observation_count,created_at,updated_at)
select gen_random_uuid(),null,owner_id,feed_source_id,research_item_id,fetch_run_id,first_seen_at,last_seen_at,observation_count,first_seen_at,last_seen_at from osint_observation_merge;
delete from public.research_items i using osint_item_survivors m where i.owner_id=m.owner_id and i.id=m.member_id and m.member_id<>m.survivor;

do $$begin
 if exists(select 1 from public.research_item_fingerprints f left join public.research_items i on i.id=f.research_item_id and i.owner_id=f.owner_id where i.id is null) then raise exception 'PHASE_2_2B_ORPHAN_FINGERPRINT';end if;
 if exists(select 1 from public.research_feed_item_observations o left join public.research_items i on i.id=o.research_item_id and i.owner_id=o.owner_id where i.id is null) then raise exception 'PHASE_2_2B_ORPHAN_OBSERVATION';end if;
end$$;

alter table public.research_feed_sources alter column owner_id set not null,alter column project_id drop not null,add constraint research_feed_interval_check check(fetch_interval_minutes in(15,30,60,360,1440)),add unique(owner_id,id);
alter table public.research_feed_fetch_runs alter column owner_id set not null,alter column project_id drop not null,add unique(owner_id,id);
alter table public.research_items alter column owner_id set not null,alter column project_id drop not null,add unique(owner_id,id);
alter table public.research_item_fingerprints alter column owner_id set not null,alter column project_id drop not null,add unique(owner_id,fingerprint_type,fingerprint_hash);
alter table public.research_feed_item_observations alter column owner_id set not null,alter column project_id drop not null,add unique(owner_id,feed_source_id,research_item_id);
create index research_items_owner_effective_idx on public.research_items(owner_id,coalesce(published_at,first_seen_at) desc,id desc);
alter table public.research_items add column search_vector tsvector generated always as (to_tsvector('simple',coalesce(title,'')||' '||coalesce(summary_text,'')||' '||coalesce(content_text,''))) stored;
create index research_items_search_idx on public.research_items using gin(search_vector);

create table public.osint_item_states(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,research_item_id uuid not null,read_at timestamptz,saved_at timestamptz,dismissed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,research_item_id),foreign key(owner_id,research_item_id) references public.research_items(owner_id,id) on delete cascade);
create table public.osint_investigation_links(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,research_item_id uuid not null,project_id uuid not null,analyst_note text not null default '' check(char_length(analyst_note)<=2000),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(owner_id,research_item_id,project_id),foreign key(owner_id,research_item_id) references public.research_items(owner_id,id) on delete cascade,foreign key(project_id) references public.projects(id) on delete cascade);
create function public.osint_link_owner_guard() returns trigger language plpgsql set search_path='' as $$begin if not exists(select 1 from public.projects where id=new.project_id and owner_id=new.owner_id) or new.created_by<>new.owner_id then raise exception 'not_found' using errcode='P0002';end if;return new;end$$;
create trigger osint_link_owner_guard before insert or update on public.osint_investigation_links for each row execute function public.osint_link_owner_guard();

-- Atomic due-feed claiming. SKIP LOCKED permits parallel jobs while exact feed leases remain authoritative.
create function public.claim_due_osint_feeds(p_limit integer) returns table(feed_source_id uuid,owner_id uuid,project_id uuid) language plpgsql security definer set search_path='' as $$begin
 if p_limit not between 1 and 20 then raise exception 'INVALID_BATCH_SIZE' using errcode='22023';end if;
 return query with due as (select s.id from public.research_feed_sources s where s.enabled and s.scheduler_enabled and s.archived_at is null and s.next_scheduled_fetch_at<=clock_timestamp() and (s.fetch_lease_expires_at is null or s.fetch_lease_expires_at<=clock_timestamp()) order by s.next_scheduled_fetch_at,s.id for update skip locked limit p_limit),claimed as (update public.research_feed_sources s set next_scheduled_fetch_at=clock_timestamp()+interval '2 minutes',scheduling_updated_at=clock_timestamp() from due where s.id=due.id returning s.id,s.owner_id,s.project_id) select * from claimed;
end$$;
revoke all on function public.claim_due_osint_feeds(integer) from public,anon,authenticated;grant execute on function public.claim_due_osint_feeds(integer) to service_role;

-- Owner policies replace project policies. Workflow tables remain read-only to ordinary clients.
do $$declare t text;p record;begin foreach t in array array['research_feed_sources','research_feed_fetch_runs','research_items','research_item_fingerprints','research_feed_item_observations'] loop for p in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy %I on public.%I',p.policyname,t);end loop;execute format('create policy %I on public.%I for select to authenticated using(auth.uid()=owner_id)',t||'_owner_select',t);end loop;end$$;
alter table public.osint_item_states enable row level security;alter table public.osint_investigation_links enable row level security;
create policy osint_states_owner on public.osint_item_states for all to authenticated using(auth.uid()=owner_id) with check(auth.uid()=owner_id and exists(select 1 from public.research_items i where i.id=research_item_id and i.owner_id=auth.uid()));
create policy osint_links_owner_select on public.osint_investigation_links for select to authenticated using(auth.uid()=owner_id);
revoke all on public.osint_item_states,public.osint_investigation_links from anon;grant select,insert,update,delete on public.osint_item_states to authenticated;grant select on public.osint_investigation_links to authenticated;

update public.research_feed_sources set next_scheduled_fetch_at=case when enabled and archived_at is null then clock_timestamp() else null end;
commit;
