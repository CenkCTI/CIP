-- Manual source review state is independent of annotation processing.
do $$ begin
 create type public.source_review_status as enum ('NOT_REVIEWED','IN_PROGRESS','REVIEWED','NEEDS_REVIEW');
exception when duplicate_object then null; end $$;
alter table public.sources
 add column if not exists review_status public.source_review_status not null default 'NOT_REVIEWED',
 add column if not exists reviewed_at timestamptz,
 add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.sources
 add constraint sources_review_completion_consistency check (
  (review_status='REVIEWED' and reviewed_at is not null and reviewed_by is not null)
  or (review_status <> 'REVIEWED' and reviewed_at is null and reviewed_by is null)
 );
comment on column public.sources.review_status is 'Explicit source-level analyst review, never inferred from annotations.';
