-- CITEM Timeline v2 — Stage 3 processing bridge and precise temporal semantics.
do $$ begin
  create type public.timeline_time_precision as enum (
    'EXACT','DAY','MONTH','YEAR','APPROXIMATE','RANGE'
  );
exception when duplicate_object then null;
end $$;

alter table public.timeline_events
  add column if not exists time_precision public.timeline_time_precision not null default 'EXACT',
  add column if not exists time_label text not null default '';

alter table public.timeline_events
  drop constraint if exists timeline_events_time_label_length,
  add constraint timeline_events_time_label_length check(char_length(time_label)<=240),
  drop constraint if exists timeline_events_approximate_label,
  add constraint timeline_events_approximate_label
    check(time_precision<>'APPROXIMATE' or char_length(trim(time_label))>0),
  drop constraint if exists timeline_events_range_end,
  add constraint timeline_events_range_end
    check(time_precision<>'RANGE' or occurred_end_at is not null);

create table if not exists public.timeline_event_source_annotations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  timeline_event_id uuid not null,
  source_annotation_id uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key(project_id,timeline_event_id)
    references public.timeline_events(project_id,id) on delete cascade,
  foreign key(project_id,source_annotation_id)
    references public.source_annotations(project_id,id) on delete restrict,
  unique(project_id,id),
  unique(project_id,timeline_event_id,source_annotation_id)
);

create index if not exists timeline_event_source_annotations_event_idx
  on public.timeline_event_source_annotations(project_id,timeline_event_id,created_at,id);
create index if not exists timeline_event_source_annotations_annotation_idx
  on public.timeline_event_source_annotations(project_id,source_annotation_id,timeline_event_id);

alter table public.timeline_event_source_annotations enable row level security;

drop policy if exists timeline_event_source_annotations_select_owned on public.timeline_event_source_annotations;
create policy timeline_event_source_annotations_select_owned
  on public.timeline_event_source_annotations for select to authenticated
  using(public.project_is_owned(project_id));

drop policy if exists timeline_event_source_annotations_insert_owned on public.timeline_event_source_annotations;
create policy timeline_event_source_annotations_insert_owned
  on public.timeline_event_source_annotations for insert to authenticated
  with check(public.project_is_owned(project_id) and created_by=auth.uid());

drop policy if exists timeline_event_source_annotations_delete_owned on public.timeline_event_source_annotations;
create policy timeline_event_source_annotations_delete_owned
  on public.timeline_event_source_annotations for delete to authenticated
  using(public.project_is_owned(project_id));
