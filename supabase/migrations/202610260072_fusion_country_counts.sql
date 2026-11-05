-- Read-only aggregated country counts. No arbitrary row cap and no join multiplication.
create view public.fusion_country_counts with (security_invoker=true) as
select c.project_id,c.id as investigation_country_id,c.country_iso2,
 (select count(*)::integer from public.investigation_country_links l
   where l.project_id=c.project_id and l.investigation_country_id=c.id) as links,
 (select count(*)::integer from public.investigation_country_notes n
   where n.project_id=c.project_id and n.investigation_country_id=c.id) as notes,
 (select count(*)::integer from public.fusion_attachment_links a
   where a.project_id=c.project_id and (a.investigation_country_id=c.id
     or a.country_note_id in (select n.id from public.investigation_country_notes n
          where n.project_id=c.project_id and n.investigation_country_id=c.id))) as attachments
from public.investigation_countries c;
grant select on public.fusion_country_counts to authenticated;
comment on view public.fusion_country_counts is 'Counts of explicit analyst country associations in each owned investigation, not threat risk.';
