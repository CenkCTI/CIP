-- CİTEM Intelligence Production Stage 1: Direction
-- Additive extension of the existing Investigation (projects) foundation.
-- The direction layer keeps the intelligence need, decision context, scope,
-- working questions, current knowledge, and information gaps together without
-- introducing workflow gates or automatic analytical judgments.

alter table public.projects
  add column if not exists purpose text,
  add column if not exists intended_consumer text,
  add column if not exists decision_context text,
  add column if not exists expected_product_type text,
  add column if not exists scope_geography text[] not null default '{}'::text[],
  add column if not exists scope_sectors text[] not null default '{}'::text[],
  add column if not exists scope_activity_types text[] not null default '{}'::text[],
  add column if not exists scope_actors text[] not null default '{}'::text[],
  add column if not exists scope_technologies text[] not null default '{}'::text[],
  add column if not exists scope_time_start date,
  add column if not exists scope_time_end date,
  add column if not exists out_of_scope text,
  add column if not exists supporting_questions text[] not null default '{}'::text[],
  add column if not exists current_knowledge text[] not null default '{}'::text[],
  add column if not exists information_gaps text[] not null default '{}'::text[];

alter table public.projects
  drop constraint if exists projects_scope_date_order_check;

alter table public.projects
  add constraint projects_scope_date_order_check
  check (
    scope_time_start is null
    or scope_time_end is null
    or scope_time_end >= scope_time_start
  );

alter table public.projects
  drop constraint if exists projects_direction_list_bounds_check;

alter table public.projects
  add constraint projects_direction_list_bounds_check
  check (
    cardinality(scope_geography) <= 20
    and cardinality(scope_sectors) <= 20
    and cardinality(scope_activity_types) <= 20
    and cardinality(scope_actors) <= 20
    and cardinality(scope_technologies) <= 20
    and cardinality(supporting_questions) <= 24
    and cardinality(current_knowledge) <= 36
    and cardinality(information_gaps) <= 36
  );

comment on column public.projects.purpose is
  'Why the Investigation exists and what a useful answer should enable.';
comment on column public.projects.intended_consumer is
  'Human-readable intended consumer of the Investigation output.';
comment on column public.projects.decision_context is
  'Decision or intelligence-use context the Investigation is intended to support.';
comment on column public.projects.expected_product_type is
  'Human-readable expected intelligence product; intentionally not a rigid enum.';
comment on column public.projects.supporting_questions is
  'Lightweight analyst-authored supporting intelligence questions; not workflow gates.';
comment on column public.projects.current_knowledge is
  'Working knowledge carried into the Investigation direction layer; not automatically promoted to Evidence or fact.';
comment on column public.projects.information_gaps is
  'Analyst-authored information gaps that can later drive collection.';
