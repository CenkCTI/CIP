-- Fusion integration acceptance: isolated PostgreSQL, authentic RLS role under JWT claims.
-- Each exception probe must fail the attempted write. All persisted test fixtures are synthetic.
insert into auth.users(id) values
 ('10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002');
insert into public.projects(id,owner_id,name,research_type,priority) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Fusion Owner A','CTI','HIGH'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Fusion Owner B','CTI','MEDIUM'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Fusion Owner A Second','CTI','LOW');
insert into public.sources(id,project_id,title,source_type,created_by) values
 ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Owner A report','VENDOR_REPORT','10000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Owner B report','VENDOR_REPORT','10000000-0000-4000-8000-000000000002'),
 ('40000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','Owner A other investigation','VENDOR_REPORT','10000000-0000-4000-8000-000000000001');
insert into public.evidence(id,project_id,collected_by,title,type,source_url) values
 ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Owner A evidence','ARTICLE','https://example.org/a');
do $test$
begin
 if (select count(*) from public.fusion_country_reference)<>249 then raise exception 'ISO catalog not 249';end if;
end $test$;
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
insert into public.investigation_countries(id,project_id,country_iso2,created_by) values
 ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','PL','10000000-0000-4000-8000-000000000001');
insert into public.investigation_country_notes(id,project_id,investigation_country_id,title,body,created_by) values
 ('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','Working note','Not an assessed attribution','10000000-0000-4000-8000-000000000001');
insert into public.investigation_country_links(id,project_id,investigation_country_id,target_type,target_id,relation_type,created_by) values
 ('80000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','SOURCE','40000000-0000-4000-8000-000000000001','MENTIONED_IN_SOURCE','10000000-0000-4000-8000-000000000001');
insert into public.fusion_attachment_links(id,project_id,evidence_id,investigation_country_id,created_by) values
 ('90000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
update public.sources set review_status='REVIEWED', reviewed_at=now(), reviewed_by=auth.uid()
 where id='40000000-0000-4000-8000-000000000001';
do $test$
begin
 if (select count(*) from public.fusion_inventory_items where project_id='20000000-0000-4000-8000-000000000001' and record_type='SOURCE' and record_id='40000000-0000-4000-8000-000000000001')<>1 then
  raise exception 'Inventory source duplicate or missing';end if;
 if (select count(*) from public.fusion_inventory_items where project_id='20000000-0000-4000-8000-000000000001' and country_codes @> array['PL']::text[] and record_type='SOURCE')<>1 then
  raise exception 'Country source link not indexed in inventory';end if;
 if not exists(select 1 from public.fusion_country_counts where country_iso2='PL' and links=1 and notes=1 and attachments=1) then
  raise exception 'Country counts incorrect';end if;
 if not exists(select 1 from public.fusion_activity_events where object_table='investigation_country_links' and action='INSERT') then
  raise exception 'Mutation audit missing';end if;
 if (select count(*) from public.evidence where id='50000000-0000-4000-8000-000000000001')<>1 then
  raise exception 'Evidence object lost';end if;
 -- The trigger must reject a valid UUID belonging to another investigation of the same owner.
 begin
  insert into public.investigation_country_links(project_id,investigation_country_id,target_type,target_id,relation_type,created_by)
   values('20000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
   'SOURCE','40000000-0000-4000-8000-000000000003','GENERAL_RELEVANCE',auth.uid());
  raise exception 'FAIL cross-investigation link accepted';
 exception when foreign_key_violation then null;end;
 begin
  insert into public.investigation_country_links(project_id,investigation_country_id,target_type,target_id,relation_type,created_by)
   values('20000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
   'SOURCE','40000000-0000-4000-8000-000000000002','GENERAL_RELEVANCE',auth.uid());
  raise exception 'FAIL foreign-user target accepted';
 exception when foreign_key_violation then null;end;
 begin
  insert into public.fusion_attachment_links(project_id,evidence_id,investigation_country_id,created_by)
   values('20000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000001',
     '60000000-0000-4000-8000-000000000001',auth.uid());
  raise exception 'FAIL cross-investigation attachment accepted';
 exception when foreign_key_violation then null;end;
end $test$;
delete from public.fusion_attachment_links where id='90000000-0000-4000-8000-000000000001';
do $test$
begin
 if (select count(*) from public.evidence where id='50000000-0000-4000-8000-000000000001')<>1 then
  raise exception 'Detach deleted Evidence';end if;
end $test$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $test$
begin
 if exists(select 1 from public.investigation_countries where project_id='20000000-0000-4000-8000-000000000001') then
  raise exception 'Other user reads country';end if;
 if exists(select 1 from public.investigation_country_notes where project_id='20000000-0000-4000-8000-000000000001') then
  raise exception 'Other user reads note';end if;
 if exists(select 1 from public.investigation_country_links where project_id='20000000-0000-4000-8000-000000000001') then
  raise exception 'Other user reads country links';end if;
 if exists(select 1 from public.fusion_activity_events where project_id='20000000-0000-4000-8000-000000000001') then
  raise exception 'Other user reads audit';end if;
 if exists(select 1 from public.fusion_inventory_items where project_id='20000000-0000-4000-8000-000000000001') then
  raise exception 'Security invoker inventory leaked another project';end if;
 if exists(select 1 from public.fusion_country_counts where project_id='20000000-0000-4000-8000-000000000001') then
  raise exception 'Security invoker counts leaked another project';end if;
 begin
  insert into public.investigation_countries(project_id,country_iso2,created_by)
  values('20000000-0000-4000-8000-000000000001','FR',auth.uid());
  raise exception 'FAIL unauthorized country write accepted';
 exception when insufficient_privilege or check_violation then null;end;
end $test$;
reset role;
select 'PASS Fusion PostgreSQL acceptance' as verdict;
