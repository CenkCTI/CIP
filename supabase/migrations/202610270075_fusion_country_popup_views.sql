-- Fusion popup V2: nonmaterialized, RLS-invoker projections over canonical country
-- links and private Evidence; no duplicated records or stored derivative findings.
create view public.fusion_country_link_items with (security_invoker=true) as
select l.project_id, c.country_iso2, l.id, l.target_type, l.target_id,
       l.relation_type, l.rationale, l.created_at, l.updated_at,
       b.title, b.summary, b.origin_kind, b.source_ids, b.annotation_ids,
       b.gap_ids, b.requirement_ids, b.record_created_at
from public.investigation_country_links l
join public.investigation_countries c on c.project_id=l.project_id
 and c.id=l.investigation_country_id
join lateral (
 select i.title, i.summary, i.origin_kind, i.source_ids, i.annotation_ids,
        i.gap_ids, i.requirement_ids, i.created_at as record_created_at
 from public.fusion_inventory_items i
 where i.project_id=l.project_id and i.record_id=l.target_id
   and i.record_type=l.target_type
) b on true;
grant select on public.fusion_country_link_items to authenticated;
comment on view public.fusion_country_link_items is
 'RLS-invoker per-investigation country relation and canonical title; no inferred attribution.';

create view public.fusion_country_attachment_items with (security_invoker=true) as
select a.project_id, coalesce(country.country_iso2,note_country.country_iso2) as country_iso2,
       a.id,a.evidence_id,a.country_note_id,a.investigation_country_id,a.description,a.created_at,
       e.title as evidence_title, e.original_file_name,e.file_size,e.mime_type,e.type as evidence_type
from public.fusion_attachment_links a
join public.evidence e on e.project_id=a.project_id and e.id=a.evidence_id
left join public.investigation_countries country on
   country.id=a.investigation_country_id and country.project_id=a.project_id
left join public.investigation_country_notes n on
   n.id=a.country_note_id and n.project_id=a.project_id
left join public.investigation_countries note_country on
   note_country.id=n.investigation_country_id and note_country.project_id=a.project_id;
grant select on public.fusion_country_attachment_items to authenticated;
comment on view public.fusion_country_attachment_items is
 'Private Evidence associations to countries and country notes with owner RLS preserved.';

create index if not exists investigation_country_links_search_idx
 on public.investigation_country_links(project_id,investigation_country_id,target_type,relation_type,created_at desc);
create index if not exists investigation_country_notes_country_title_idx
 on public.investigation_country_notes(project_id,investigation_country_id,title);
