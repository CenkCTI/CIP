-- 076: analyst-controlled organization links. Canonical source-to-annotation
-- provenance stays read-only; these are explicitly MANUAL assignments.
create table public.fusion_record_assignments (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 record_type text not null check (record_type in ('SOURCE','SOURCE_ASSET','SOURCE_NOTE','ANNOTATION','SOURCE_CLAIM','ATTRIBUTION_CLAIM','ACTOR','CAMPAIGN','INDICATOR','MALWARE','CVE','MITRE','TIMELINE_EVENT','RESEARCH_NOTE','EVIDENCE','COUNTRY_NOTE','INFORMATION_GAP','COLLECTION_REQUIREMENT')),
 record_id uuid not null,
 assignment_kind text not null check (assignment_kind in ('SOURCE','GAP','REQUIREMENT')),
 assigned_id uuid not null,
 rationale text check (rationale is null or char_length(rationale)<=4000),
 created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(project_id,record_type,record_id,assignment_kind,assigned_id)
);
create index fusion_record_assignments_item_idx on public.fusion_record_assignments(project_id,record_type,record_id);
create index fusion_record_assignments_target_idx on public.fusion_record_assignments(project_id,assignment_kind,assigned_id);
create trigger fusion_record_assignments_updated before update on public.fusion_record_assignments
 for each row execute function public.set_updated_at();

-- RLS and invoker trigger validate both ends against the same investigation.
-- No service-role path is introduced.
create function public.fusion_validate_record_assignment()
returns trigger language plpgsql security invoker set search_path='' as $$
declare record_exists boolean; destination_exists boolean;
begin
 if not public.project_is_owned(new.project_id) or new.created_by is distinct from auth.uid() then
  raise exception 'Not authorized' using errcode='42501';
 end if;
 if tg_op='UPDATE' and (
  new.project_id is distinct from old.project_id
  or new.record_type is distinct from old.record_type or new.record_id is distinct from old.record_id
  or new.assignment_kind is distinct from old.assignment_kind or new.assigned_id is distinct from old.assigned_id
  or new.created_by is distinct from old.created_by
 ) then raise exception 'Assignment identity is immutable' using errcode='42501'; end if;
 select exists(
  select 1 from public.fusion_inventory_base r
  where r.project_id=new.project_id and r.record_type=new.record_type and r.record_id=new.record_id
 ) into record_exists;
 if not record_exists then raise exception 'Record not found in investigation' using errcode='23503'; end if;
 case new.assignment_kind
  when 'SOURCE' then
   select exists(select 1 from public.sources s where s.project_id=new.project_id and s.id=new.assigned_id) into destination_exists;
   if new.record_type='SOURCE' and new.record_id=new.assigned_id then
    raise exception 'Source cannot be assigned to itself' using errcode='23514';
   end if;
  when 'GAP' then
   select exists(select 1 from public.investigation_information_gaps g where g.project_id=new.project_id and g.id=new.assigned_id) into destination_exists;
  when 'REQUIREMENT' then
   select exists(select 1 from public.collection_requirements r where r.project_id=new.project_id and r.id=new.assigned_id) into destination_exists;
  else raise exception 'Unsupported assignment type' using errcode='23514';
 end case;
 if not destination_exists then raise exception 'Assignment target not found in investigation' using errcode='23503'; end if;
 return new;
end $$;
revoke all on function public.fusion_validate_record_assignment() from public,anon,authenticated;
create trigger fusion_record_assignment_validate before insert or update on public.fusion_record_assignments
 for each row execute function public.fusion_validate_record_assignment();

-- Ensure polymorphic links do not outlive the source/record they reference.
create function public.fusion_cleanup_record_assignments()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from public.fusion_record_assignments a where a.project_id=old.project_id
   and ((a.record_type=tg_argv[0] and a.record_id=old.id)
     or (a.assignment_kind=tg_argv[0] and a.assigned_id=old.id));
 return old;
end $$;
revoke all on function public.fusion_cleanup_record_assignments() from public,anon,authenticated;
do $$
declare record_table text; record_kind text;
begin
 for record_table,record_kind in
 select * from (values
  ('sources','SOURCE'),('source_assets','SOURCE_ASSET'),('source_notes','SOURCE_NOTE'),
  ('source_annotations','ANNOTATION'),('source_claims','SOURCE_CLAIM'),
  ('source_attribution_claims','ATTRIBUTION_CLAIM'),('threat_actors','ACTOR'),
  ('campaigns','CAMPAIGN'),('indicators','INDICATOR'),('malware','MALWARE'),
  ('cves','CVE'),('mitre_techniques','MITRE'),('timeline_events','TIMELINE_EVENT'),
  ('research_notes','RESEARCH_NOTE'),('evidence','EVIDENCE'),
  ('investigation_country_notes','COUNTRY_NOTE'),
  ('investigation_information_gaps','GAP'),('collection_requirements','REQUIREMENT')
 ) as refs(t,k) loop
  execute format('create trigger fusion_assignments_cleanup_after_delete after delete on public.%I for each row execute function public.fusion_cleanup_record_assignments(%L)',record_table,record_kind);
 end loop;
end $$;
-- Gap and requirement are also Inventory records.
create trigger fusion_assignments_cleanup_gap_record after delete on public.investigation_information_gaps
 for each row execute function public.fusion_cleanup_record_assignments('INFORMATION_GAP');
create trigger fusion_assignments_cleanup_requirement_record after delete on public.collection_requirements
 for each row execute function public.fusion_cleanup_record_assignments('COLLECTION_REQUIREMENT');

alter table public.fusion_record_assignments enable row level security;
grant select,insert,update,delete on public.fusion_record_assignments to authenticated;
create policy fusion_record_assignments_select on public.fusion_record_assignments
 for select to authenticated using (public.project_is_owned(project_id));
create policy fusion_record_assignments_insert on public.fusion_record_assignments
 for insert to authenticated with check (public.project_is_owned(project_id) and created_by=auth.uid());
create policy fusion_record_assignments_update on public.fusion_record_assignments
 for update to authenticated using (public.project_is_owned(project_id) and created_by=auth.uid())
 with check (public.project_is_owned(project_id) and created_by=auth.uid());
create policy fusion_record_assignments_delete on public.fusion_record_assignments
 for delete to authenticated using (public.project_is_owned(project_id));
comment on table public.fusion_record_assignments is
 'Explicit analyst organizational assignments. Never treated as source-derived corroboration or original provenance.';

-- Append new typed MANUAL columns without replacing or rewriting the provenance arrays.
create or replace view public.fusion_inventory_items with (security_invoker=true) as
select b.*, x.annotation_ids, s.source_ids,
 array(select distinct g.gap_id from public.source_gap_links g
   where g.project_id=b.project_id and g.source_id=any(s.source_ids)
   union select distinct ag.gap_id from public.source_annotation_gap_links ag
   where ag.project_id=b.project_id and ag.annotation_id=any(x.annotation_ids)
 ) as gap_ids,
 array(select distinct r.requirement_id from public.source_requirement_links r
   where r.project_id=b.project_id and r.source_id=any(s.source_ids)
   union select distinct ar.requirement_id from public.source_annotation_requirement_links ar
   where ar.project_id=b.project_id and ar.annotation_id=any(x.annotation_ids)
 ) as requirement_ids,
 array(select distinct c.country_iso2 from public.investigation_country_links l
  join public.investigation_countries c on c.project_id=l.project_id and c.id=l.investigation_country_id
  where l.project_id=b.project_id and l.target_type=b.record_type and l.target_id=b.record_id
  union select distinct c.country_iso2 from public.investigation_country_notes n
  join public.investigation_countries c on c.project_id=n.project_id and c.id=n.investigation_country_id
  where b.record_type='COUNTRY_NOTE' and b.record_id=n.id and b.project_id=n.project_id
 ) as country_codes,
 array(select a.assigned_id from public.fusion_record_assignments a
  where a.project_id=b.project_id and a.record_type=b.record_type and a.record_id=b.record_id and a.assignment_kind='SOURCE') as assigned_source_ids,
 array(select a.assigned_id from public.fusion_record_assignments a
  where a.project_id=b.project_id and a.record_type=b.record_type and a.record_id=b.record_id and a.assignment_kind='GAP') as assigned_gap_ids,
 array(select a.assigned_id from public.fusion_record_assignments a
  where a.project_id=b.project_id and a.record_type=b.record_type and a.record_id=b.record_id and a.assignment_kind='REQUIREMENT') as assigned_requirement_ids
from public.fusion_inventory_base b
cross join lateral (
 select array(
  select b.source_annotation_id where b.source_annotation_id is not null
  union select ca.source_annotation_id from public.source_claim_assertions ca
   where b.record_type='SOURCE_CLAIM' and ca.project_id=b.project_id and ca.source_claim_id=b.record_id
  union select o.source_annotation_id from public.source_annotation_outputs o
   where o.project_id=b.project_id and (
    (b.record_type='INDICATOR' and o.indicator_id=b.record_id) or
    (b.record_type='MALWARE' and o.malware_id=b.record_id) or
    (b.record_type='CVE' and o.cve_id=b.record_id) or
    (b.record_type='MITRE' and o.mitre_technique_id=b.record_id) or
    (b.record_type='CAMPAIGN' and o.campaign_id=b.record_id) or
    (b.record_type='ACTOR' and o.threat_actor_id=b.record_id) or
    (b.record_type='ATTRIBUTION_CLAIM' and o.attribution_claim_id=b.record_id)
   )
 ) as annotation_ids
) x
cross join lateral (
 select array(
  select b.source_id where b.source_id is not null
  union select a.source_id from public.source_annotations a
   where a.project_id=b.project_id and a.id=any(x.annotation_ids)
 ) as source_ids
) s;


comment on view public.fusion_inventory_items is 'Canonical provenance (source_ids/gap_ids/requirement_ids) is separate from explicit assigned_*_ids. All under invoker-RLS.';
grant select on public.fusion_inventory_items to authenticated;

-- Include Direction records in country relationships (existing Country table reused).
alter table public.investigation_country_links
 drop constraint investigation_country_links_target_type_check;
alter table public.investigation_country_links
 add constraint investigation_country_links_target_type_check check(target_type in (
  'SOURCE','SOURCE_ASSET','SOURCE_NOTE','ANNOTATION','SOURCE_CLAIM','ATTRIBUTION_CLAIM',
  'ACTOR','CAMPAIGN','INDICATOR','MALWARE','CVE','MITRE','TIMELINE_EVENT',
  'RESEARCH_NOTE','EVIDENCE','COUNTRY_NOTE','INFORMATION_GAP','COLLECTION_REQUIREMENT'
 ));
create or replace function public.fusion_validate_country_link()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare target_table text; target_exists boolean;
begin
 if not public.project_is_owned(new.project_id) or new.created_by is distinct from auth.uid() then
  raise exception 'not authorized' using errcode='42501';
 end if;
 if tg_op='UPDATE' and (new.project_id<>old.project_id or new.created_by<>old.created_by) then
  raise exception 'immutable ownership' using errcode='42501';
 end if;
 target_table:=case new.target_type
  when 'SOURCE' then 'sources'
  when 'SOURCE_ASSET' then 'source_assets'
  when 'SOURCE_NOTE' then 'source_notes'
  when 'ANNOTATION' then 'source_annotations'
  when 'SOURCE_CLAIM' then 'source_claims'
  when 'ATTRIBUTION_CLAIM' then 'source_attribution_claims'
  when 'ACTOR' then 'threat_actors'
  when 'CAMPAIGN' then 'campaigns'
  when 'INDICATOR' then 'indicators'
  when 'MALWARE' then 'malware'
  when 'CVE' then 'cves'
  when 'MITRE' then 'mitre_techniques'
  when 'TIMELINE_EVENT' then 'timeline_events'
  when 'RESEARCH_NOTE' then 'research_notes'
  when 'EVIDENCE' then 'evidence'
  when 'COUNTRY_NOTE' then 'investigation_country_notes'
  when 'INFORMATION_GAP' then 'investigation_information_gaps'
  when 'COLLECTION_REQUIREMENT' then 'collection_requirements'
  else null end;
 if target_table is null then raise exception 'unsupported target' using errcode='23514'; end if;
 if not exists(select 1 from public.investigation_countries c
   where c.id=new.investigation_country_id and c.project_id=new.project_id) then
  raise exception 'country not in investigation' using errcode='23503';
 end if;
 if not (select exists(select 1 from pg_catalog.pg_class where oid=('public.'||target_table)::regclass)) then
  raise exception 'invalid target type' using errcode='23514';
 end if;
 execute format('select exists(select 1 from public.%I where project_id=$1 and id=$2)',target_table)
 into target_exists using new.project_id,new.target_id;
 if not target_exists then raise exception 'target not found in investigation' using errcode='23503'; end if;
 return new;
end $$;
create trigger fusion_country_cleanup_gap after delete on public.investigation_information_gaps
 for each row execute function public.fusion_cleanup_country_links('INFORMATION_GAP');
create trigger fusion_country_cleanup_requirement after delete on public.collection_requirements
 for each row execute function public.fusion_cleanup_country_links('COLLECTION_REQUIREMENT');
