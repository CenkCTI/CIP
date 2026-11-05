-- Live, canonical and security-invoker read model. No duplicate persisted source material.
-- Source-to-item associations remain typed and never imply corroboration.
create view public.fusion_inventory_base with (security_invoker=true) as
select t.project_id, 'SOURCE'::text as record_type,t.id as record_id,(title)::text as title,(description)::text as summary,(description)::text as preview_text,t.created_at as created_at,t.updated_at as updated_at,(origin_kind)::text as origin_kind,(id)::uuid as source_id,(NULL::uuid)::uuid as source_annotation_id,(NULL::text)::text as processing_state,(jsonb_build_object('publisher',publisher,'url',url,'sourceType',source_type,'archivedAt',archived_at)) as metadata from public.sources t
union all
select t.project_id, 'SOURCE_ASSET'::text as record_type,t.id as record_id,(original_filename)::text as title,(coalesce(mime_type,''))::text as summary,(''::text)::text as preview_text,t.created_at as created_at,t.created_at as updated_at,('SOURCE_FILE')::text as origin_kind,(source_id)::uuid as source_id,(NULL::uuid)::uuid as source_annotation_id,(NULL::text)::text as processing_state,(jsonb_build_object('mimeType',mime_type,'size',size_bytes,'sha256',sha256,'assetRole',asset_role,'state',state)) as metadata from public.source_assets t
union all
select t.project_id, 'SOURCE_NOTE'::text as record_type,t.id as record_id,(left(body,120))::text as title,(body)::text as summary,(left(body,600))::text as preview_text,t.created_at as created_at,t.updated_at as updated_at,('ANALYST')::text as origin_kind,(source_id)::uuid as source_id,(NULL::uuid)::uuid as source_annotation_id,(NULL::text)::text as processing_state,('{}'::jsonb) as metadata from public.source_notes t
union all
select t.project_id, 'ANNOTATION'::text as record_type,t.id as record_id,(coalesce(nullif(left(selected_text,160),''), 'PDF '||annotation_type::text||' (page '||coalesce(page_number::text,'?')||')'))::text as title,(coalesce(comment,''))::text as summary,(coalesce(selected_text,''))::text as preview_text,t.created_at as created_at,t.updated_at as updated_at,('SOURCE_PASSAGE')::text as origin_kind,(source_id)::uuid as source_id,(id)::uuid as source_annotation_id,(processing_state::text)::text as processing_state,(jsonb_build_object('page',page_number,'annotationType',annotation_type,'anchorKind',anchor_kind,'comment',comment,'selectedText',selected_text)) as metadata from public.source_annotations t
union all
select t.project_id, 'SOURCE_CLAIM'::text as record_type,t.id as record_id,(left(claim_summary,200))::text as title,(claim_summary)::text as summary,(claim_summary)::text as preview_text,t.created_at as created_at,t.updated_at as updated_at,('SOURCE_REPORTED')::text as origin_kind,(NULL::uuid)::uuid as source_id,(NULL::uuid)::uuid as source_annotation_id,(NULL::text)::text as processing_state,(jsonb_build_object('claimKind',claim_kind,'stances',(select coalesce(jsonb_agg(jsonb_build_object('stance',stance,'annotationId',source_annotation_id,'origin',mapping_origin)), '[]'::jsonb) from public.source_claim_assertions a where a.project_id=t.project_id and a.source_claim_id=t.id))) as metadata from public.source_claims t
union all
select t.project_id, 'ATTRIBUTION_CLAIM'::text as record_type,t.id as record_id,(left(claim_summary,200))::text as title,(claim_summary)::text as summary,(claim_summary)::text as preview_text,t.created_at as created_at,t.updated_at as updated_at,(mapping_origin::text)::text as origin_kind,(NULL::uuid)::uuid as source_id,(source_annotation_id)::uuid as source_annotation_id,(NULL::text)::text as processing_state,(jsonb_build_object('claimedActor',claimed_actor_text,'canonicalActorId',canonical_threat_actor_id)) as metadata from public.source_attribution_claims t
union all
select t.project_id, 'RESEARCH_NOTE'::text as record_type,t.id as record_id,(title)::text as title,(left(content,2000))::text as summary,(left(content,600))::text as preview_text,t.created_at as created_at,t.updated_at as updated_at,('ANALYST')::text as origin_kind,(NULL::uuid)::uuid as source_id,(NULL::uuid)::uuid as source_annotation_id,(NULL::text)::text as processing_state,(jsonb_build_object('tags',tags)) as metadata from public.research_notes t
union all
select t.project_id, 'EVIDENCE'::text as record_type,t.id as record_id,(title)::text as title,(description)::text as summary,(left(description,600))::text as preview_text,t.created_at as created_at,t.updated_at as updated_at,('EVIDENCE')::text as origin_kind,(NULL::uuid)::uuid as source_id,(NULL::uuid)::uuid as source_annotation_id,(NULL::text)::text as processing_state,(jsonb_build_object('evidenceType',type,'fileName',original_file_name,'fileSize',file_size,'mimeType',mime_type,'sourceUrl',source_url)) as metadata from public.evidence t
union all
select t.project_id, 'TIMELINE_EVENT'::text as record_type,t.id as record_id,(event_name)::text as title,(description)::text as summary,(left(description,600))::text as preview_text,t.created_at as created_at,t.updated_at as updated_at,('ANALYST')::text as origin_kind,(NULL::uuid)::uuid as source_id,(NULL::uuid)::uuid as source_annotation_id,(NULL::text)::text as processing_state,(jsonb_build_object('eventDate',event_date,'relatedEntityType',related_entity_type)) as metadata from public.timeline_events t
union all
select t.project_id, 'ACTOR'::text as record_type,t.id as record_id,(name)::text as title,(description)::text as summary,(left(description,600))::text as preview_text,t.created_at as created_at,t.updated_at as updated_at,('ANALYST_ENTITY')::text as origin_kind,(NULL::uuid)::uuid as source_id,(NULL::uuid)::uuid as source_annotation_id,(NULL::text)::text as processing_state,(jsonb_build_object('aliases',aliases,'countryLabel',country)) as metadata from public.threat_actors t
union all
select t.project_id, 'CAMPAIGN'::text as record_type,t.id as record_id,(name)::text as title,(description)::text as summary,(left(description,600))::text as preview_text,t.created_at as created_at,t.updated_at as updated_at,('ANALYST_ENTITY')::text as origin_kind,(NULL::uuid)::uuid as source_id,(NULL::uuid)::uuid as source_annotation_id,(NULL::text)::text as processing_state,(jsonb_build_object('startDate',start_date,'endDate',end_date)) as metadata from public.campaigns t
union all
select t.project_id, 'INDICATOR'::text as record_type,t.id as record_id,(value)::text as title,(coalesce(source,''))::text as summary,(''::text)::text as preview_text,t.created_at as created_at,t.updated_at as updated_at,('TECHNICAL_ENTITY')::text as origin_kind,(NULL::uuid)::uuid as source_id,(NULL::uuid)::uuid as source_annotation_id,(NULL::text)::text as processing_state,(jsonb_build_object('type',type,'confidence',confidence)) as metadata from public.indicators t
union all
select t.project_id, 'MALWARE'::text as record_type,t.id as record_id,(name)::text as title,(description)::text as summary,(left(description,600))::text as preview_text,t.created_at as created_at,t.updated_at as updated_at,('TECHNICAL_ENTITY')::text as origin_kind,(NULL::uuid)::uuid as source_id,(NULL::uuid)::uuid as source_annotation_id,(NULL::text)::text as processing_state,(jsonb_build_object('family',family)) as metadata from public.malware t
union all
select t.project_id, 'CVE'::text as record_type,t.id as record_id,(cve_id)::text as title,(description)::text as summary,(left(description,600))::text as preview_text,t.created_at as created_at,t.updated_at as updated_at,('TECHNICAL_ENTITY')::text as origin_kind,(NULL::uuid)::uuid as source_id,(NULL::uuid)::uuid as source_annotation_id,(NULL::text)::text as processing_state,(jsonb_build_object('severity',severity,'exploitStatus',exploit_status)) as metadata from public.cves t
union all
select t.project_id, 'MITRE'::text as record_type,t.id as record_id,(technique_id||' '||technique_name)::text as title,(description)::text as summary,(left(description,600))::text as preview_text,t.created_at as created_at,t.updated_at as updated_at,('TECHNICAL_ENTITY')::text as origin_kind,(NULL::uuid)::uuid as source_id,(NULL::uuid)::uuid as source_annotation_id,(NULL::text)::text as processing_state,(jsonb_build_object('tactic',tactic)) as metadata from public.mitre_techniques t
union all
select t.project_id, 'COUNTRY_NOTE'::text as record_type,t.id as record_id,(title)::text as title,(body)::text as summary,(left(body,600))::text as preview_text,t.created_at as created_at,t.updated_at as updated_at,('ANALYST')::text as origin_kind,(NULL::uuid)::uuid as source_id,(NULL::uuid)::uuid as source_annotation_id,(NULL::text)::text as processing_state,(jsonb_build_object('countryId',investigation_country_id)) as metadata from public.investigation_country_notes t
union all
select t.project_id, 'INFORMATION_GAP'::text as record_type,t.id as record_id,(left(description,180))::text as title,(description)::text as summary,(left(description,600))::text as preview_text,t.created_at as created_at,t.updated_at as updated_at,('DIRECTION')::text as origin_kind,(NULL::uuid)::uuid as source_id,(NULL::uuid)::uuid as source_annotation_id,(NULL::text)::text as processing_state,(jsonb_build_object('status',status)) as metadata from public.investigation_information_gaps t
union all
select t.project_id, 'COLLECTION_REQUIREMENT'::text as record_type,t.id as record_id,(left(requirement,180))::text as title,(requirement)::text as summary,(left(requirement,600))::text as preview_text,t.created_at as created_at,t.updated_at as updated_at,('DIRECTION')::text as origin_kind,(NULL::uuid)::uuid as source_id,(NULL::uuid)::uuid as source_annotation_id,(NULL::text)::text as processing_state,(jsonb_build_object('status',status)) as metadata from public.collection_requirements t;

create view public.fusion_inventory_items with (security_invoker=true) as
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
 ) as country_codes
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

grant select on public.fusion_inventory_base,public.fusion_inventory_items to authenticated;
comment on view public.fusion_inventory_items is 'Owner-RLS-respecting union of canonical investigation records. Association arrays are traceable joins, not inferred findings.';
