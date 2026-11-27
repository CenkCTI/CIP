-- One append-only review stream per canonical annotation. Version 084 is reserved by PR #96.
create table public.annotation_credibility_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  annotation_id uuid not null,
  source_id uuid not null,
  asset_id uuid not null,
  credibility smallint not null check (credibility between 2 and 6),
  rationale text not null check (char_length(btrim(rationale)) between 10 and 4000),
  method_version text not null check (method_version = 'ADMIRALTY_ANNOTATION_V1'),
  reviewed_by uuid not null,
  reviewed_at timestamptz not null default clock_timestamp(),
  revision integer not null check (revision > 0),
  supersedes_id uuid,
  provenance text not null check (provenance ~ '^[0-9a-f]{64}$'),
  request_id uuid not null,
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  unique (project_id, annotation_id, revision),
  unique (project_id, annotation_id, id),
  unique (project_id, request_id),
  foreign key (project_id, annotation_id, supersedes_id)
    references public.annotation_credibility_reviews(project_id, annotation_id, id),
  check ((revision = 1) = (supersedes_id is null))
);

alter table public.annotation_credibility_reviews enable row level security;
revoke all on public.annotation_credibility_reviews from public, anon, authenticated;
grant select on public.annotation_credibility_reviews to authenticated;
create policy annotation_credibility_owner on public.annotation_credibility_reviews
  for select to authenticated using (public.project_is_owned(project_id));
create trigger protect_annotation_review_history before update or delete on public.annotation_credibility_reviews
  for each row execute function public.protect_assertion_credibility_review_history();

-- The assessment covers the saved passage and comment. Colors, gap links and
-- unrelated Source edits do not modify this token. Content and URLs stay in
-- the original records; only the digest is copied into history.
create view public.annotation_credibility_subject_v1 with (security_invoker = true) as
select a.project_id, a.id as annotation_id, a.source_id, a.asset_id, s.title as source_title,
  case
    when s.archived_at is not null then 'ARCHIVED'
    when asset.state <> 'READY' then 'UNAVAILABLE'
    when a.annotation_type = 'REGION' and nullif(btrim(a.comment), '') is null
      and nullif(btrim(a.selected_text), '') is null then 'NO_INFORMATION'
    when a.annotation_type in ('HIGHLIGHT','UNDERLINE')
      and nullif(btrim(a.selected_text), '') is null and not exists (
        select 1 from public.source_annotation_fragments f
        where f.project_id = a.project_id and f.annotation_id = a.id
          and nullif(btrim(f.selected_text), '') is not null
      ) then 'NO_INFORMATION'
    else 'ACTIVE'
  end as subject_status,
  encode(sha256(convert_to(jsonb_build_array(
    a.id, a.source_id, a.asset_id, a.annotation_type, a.selected_text, a.comment,
    a.page_number, a.rects, a.geometry_version, a.anchor_kind,
    asset.sha256, asset.state, asset.derived_from_asset_id,
    s.title, s.publisher, s.source_type, s.url, extract(epoch from s.published_at),
    s.evidence_id, s.external_key, s.origin_kind,
    (select jsonb_agg(jsonb_build_array(f.page_number, f.anchor_kind, f.quads,
       f.selected_text, f.page_width, f.page_height, f.page_rotation) order by f.page_number, f.id)
     from public.source_annotation_fragments f
     where f.project_id = a.project_id and f.annotation_id = a.id)
  )::text, 'UTF8')), 'hex') as provenance
from public.source_annotations a
join public.sources s on s.project_id = a.project_id and s.id = a.source_id
join public.source_assets asset on asset.project_id = a.project_id
  and asset.id = a.asset_id and asset.source_id = a.source_id;

create view public.collection_source_quality_v1 with (security_invoker = true) as
select s.project_id, s.id as source_id, s.archived_at, r.rating,
  r.source_updated_at is distinct from s.updated_at and r.rating is not null as reliability_stale
from public.sources s
left join lateral (
  select rating, source_updated_at from public.source_reliability_reviews r
  where r.project_id = s.project_id and r.source_id = s.id order by revision desc limit 1
) r on true;

create view public.collection_assertion_quality_v1 with (security_invoker = true) as
select x.project_id, x.id as assertion_id, r.id as review_id,
  r.id is not null and (
    r.assertion_updated_at is distinct from x.updated_at or r.claim_updated_at is distinct from c.updated_at
    or r.annotation_updated_at is distinct from a.updated_at or r.source_updated_at is distinct from s.updated_at
  ) as stale
from public.source_claim_assertions x
join public.source_claims c on c.project_id = x.project_id and c.id = x.source_claim_id
join public.source_annotations a on a.project_id = x.project_id and a.id = x.source_annotation_id
join public.sources s on s.project_id = a.project_id and s.id = a.source_id
left join lateral (
  select id, assertion_updated_at, claim_updated_at, annotation_updated_at, source_updated_at
  from public.assertion_credibility_reviews r where r.project_id = x.project_id
    and r.source_claim_assertion_id = x.id order by revision desc limit 1
) r on true
where s.archived_at is null;

create view public.annotation_credibility_current_v1 with (security_invoker = true) as
select a.project_id, a.annotation_id, a.source_id, a.source_title, a.subject_status, a.provenance,
  q.rating as source_reliability, q.reliability_stale as source_reliability_stale,
  r.id as review_id, r.credibility, r.rationale, r.revision, r.method_version, r.reviewed_at,
  r.id is not null and (r.provenance is distinct from a.provenance or a.subject_status <> 'ACTIVE') as stale
from public.annotation_credibility_subject_v1 a
left join public.collection_source_quality_v1 q using (project_id, source_id)
left join lateral (
  select id, credibility, rationale, revision, method_version, reviewed_at, provenance
  from public.annotation_credibility_reviews r where r.project_id = a.project_id
    and r.annotation_id = a.annotation_id order by revision desc limit 1
) r on true;

-- Preserve the canonical Inventory view and add a one-to-one, annotation-only
-- join for exact server-side filtering before pagination.
create view public.fusion_inventory_annotation_quality_v1 with (security_invoker = true) as
select i.*, q.credibility as annotation_credibility, q.stale as annotation_credibility_stale,
  q.reviewed_at as annotation_reviewed_at, q.review_id as annotation_review_id,
  q.subject_status as annotation_subject_status, q.source_reliability as annotation_source_reliability,
  q.source_reliability_stale as annotation_source_reliability_stale
from public.fusion_inventory_items i
left join public.annotation_credibility_current_v1 q on i.record_type = 'ANNOTATION'
  and q.project_id = i.project_id and q.annotation_id = i.record_id;

revoke all on public.annotation_credibility_subject_v1, public.annotation_credibility_current_v1,
  public.collection_source_quality_v1, public.collection_assertion_quality_v1,
  public.fusion_inventory_annotation_quality_v1 from public, anon, authenticated;
grant select on public.annotation_credibility_subject_v1, public.annotation_credibility_current_v1,
  public.collection_source_quality_v1, public.collection_assertion_quality_v1,
  public.fusion_inventory_annotation_quality_v1 to authenticated;

create function public.save_annotation_credibility_review_v1(
  p_project_id uuid, p_annotation_id uuid, p_credibility integer, p_rationale text,
  p_method_version text, p_expected_review_id uuid, p_provenance text, p_request_id uuid
) returns table (review_id uuid, reviewed_at timestamptz, replayed boolean)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  annotation public.source_annotations%rowtype;
  subject public.annotation_credibility_subject_v1%rowtype;
  previous public.annotation_credibility_reviews%rowtype;
  saved public.annotation_credibility_reviews%rowtype;
  input_hash text;
  rationale_text text := regexp_replace(p_rationale, '^[[:space:]]+|[[:space:]]+$', '', 'g');
begin
  if actor is null or not exists (
    select 1 from public.projects p where p.id = p_project_id and p.owner_id = actor
  ) then raise exception 'NOT_FOUND' using errcode = '42501'; end if;

  if p_credibility is null or p_credibility not between 2 and 6
    or rationale_text is null or char_length(rationale_text) not between 10 and 4000
    or p_method_version is distinct from 'ADMIRALTY_ANNOTATION_V1'
    or p_annotation_id is null or p_request_id is null or p_provenance is null
    or p_provenance !~ '^[a-f0-9]{64}$'
  then raise exception 'INVALID_REVIEW' using errcode = '22023'; end if;

  input_hash := encode(sha256(convert_to(jsonb_build_array(actor, p_annotation_id, p_credibility,
    rationale_text, p_method_version, p_expected_review_id, p_provenance)::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':' || p_request_id::text, 0));
  select * into saved from public.annotation_credibility_reviews r
    where r.project_id = p_project_id and r.request_id = p_request_id;
  if found then
    if saved.input_fingerprint <> input_hash then
      raise exception 'REQUEST_ID_REUSED' using errcode = '40001';
    end if;
    return query select saved.id, saved.reviewed_at, true;
    return;
  end if;

  select * into annotation from public.source_annotations a
    where a.project_id = p_project_id and a.id = p_annotation_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = '42501'; end if;
  perform 1 from public.sources s where s.project_id = p_project_id and s.id = annotation.source_id for share;
  perform 1 from public.source_assets a where a.project_id = p_project_id and a.id = annotation.asset_id for share;
  select * into subject from public.annotation_credibility_subject_v1 a
    where a.project_id = p_project_id and a.annotation_id = p_annotation_id;
  if subject.subject_status is distinct from 'ACTIVE' or subject.provenance is distinct from p_provenance
  then raise exception 'ANNOTATION_CHANGED_OR_UNAVAILABLE' using errcode = '40001'; end if;

  select * into previous from public.annotation_credibility_reviews r
    where r.project_id = p_project_id and r.annotation_id = p_annotation_id order by revision desc limit 1;
  if previous.id is distinct from p_expected_review_id then
    raise exception 'REVIEW_CHANGED' using errcode = '40001';
  end if;

  insert into public.annotation_credibility_reviews (project_id, annotation_id, source_id, asset_id,
    credibility, rationale, method_version, reviewed_by, revision, supersedes_id, provenance,
    request_id, input_fingerprint)
  values (p_project_id, annotation.id, annotation.source_id, annotation.asset_id,
    p_credibility, rationale_text, p_method_version, actor, coalesce(previous.revision, 0) + 1,
    previous.id, subject.provenance, p_request_id, input_hash)
  returning * into saved;
  return query select saved.id, saved.reviewed_at, false;
end
$$;

revoke all on function public.save_annotation_credibility_review_v1(uuid, uuid, integer, text, text, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.save_annotation_credibility_review_v1(uuid, uuid, integer, text, text, uuid, text, uuid)
  to authenticated;
