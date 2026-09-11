-- CİTEM Intelligence Production Stage 1: Direction
-- Final Stage 1 model: Investigation remains the existing projects root.
-- Direction metadata stays on projects; analyst working objects that need status,
-- ordering, provenance, or later Collection handoff are first-class rows.

-- Lifecycle for supporting intelligence questions is intentionally not a task state.
do $$ begin
  create type public.investigation_question_status as enum (
    'OPEN', 'PARTIALLY_ANSWERED', 'ANSWERED', 'DROPPED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.investigation_gap_status as enum (
    'OPEN', 'PARTIALLY_RESOLVED', 'RESOLVED', 'DEFERRED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.working_knowledge_state as enum (
    'ACTIVE', 'SUPERSEDED', 'WITHDRAWN'
  );
exception when duplicate_object then null; end $$;

alter table public.projects
  add column if not exists purpose text,
  add column if not exists intended_consumer text,
  add column if not exists decision_context text,
  add column if not exists expected_product_type text,
  add column if not exists due_at timestamptz,
  add column if not exists scope_geography text[] not null default '{}'::text[],
  add column if not exists scope_sectors text[] not null default '{}'::text[],
  add column if not exists scope_activity_types text[] not null default '{}'::text[],
  add column if not exists scope_actors text[] not null default '{}'::text[],
  add column if not exists scope_technologies text[] not null default '{}'::text[],
  add column if not exists scope_time_start date,
  add column if not exists scope_time_end date,
  add column if not exists out_of_scope text;

alter table public.projects
  drop constraint if exists projects_scope_date_order_check,
  add constraint projects_scope_date_order_check
    check (
      scope_time_start is null
      or scope_time_end is null
      or scope_time_end >= scope_time_start
    ),
  drop constraint if exists projects_direction_list_bounds_check,
  add constraint projects_direction_list_bounds_check
    check (
      cardinality(scope_geography) <= 20
      and cardinality(scope_sectors) <= 20
      and cardinality(scope_activity_types) <= 20
      and cardinality(scope_actors) <= 20
      and cardinality(scope_technologies) <= 20
    ),
  drop constraint if exists projects_direction_text_bounds_check,
  add constraint projects_direction_text_bounds_check
    check (
      (purpose is null or char_length(purpose) <= 2000)
      and (intended_consumer is null or char_length(intended_consumer) <= 500)
      and (decision_context is null or char_length(decision_context) <= 4000)
      and (expected_product_type is null or char_length(expected_product_type) <= 160)
      and (out_of_scope is null or char_length(out_of_scope) <= 2000)
    );

create index if not exists projects_owner_due_at_idx
  on public.projects(owner_id, due_at asc nulls last)
  where due_at is not null;

create table public.investigation_questions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  question text not null check (char_length(trim(question)) between 5 and 1000),
  status public.investigation_question_status not null default 'OPEN',
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, id)
);

create index investigation_questions_project_order_idx
  on public.investigation_questions(project_id, sort_order, created_at, id);
create index investigation_questions_project_status_idx
  on public.investigation_questions(project_id, status, updated_at desc);
create trigger investigation_questions_set_updated_at
  before update on public.investigation_questions
  for each row execute function public.set_updated_at();

create table public.investigation_information_gaps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  description text not null check (char_length(trim(description)) between 5 and 1000),
  status public.investigation_gap_status not null default 'OPEN',
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, id),
  check (status = 'RESOLVED' or resolved_at is null)
);

create index investigation_gaps_project_order_idx
  on public.investigation_information_gaps(project_id, sort_order, created_at, id);
create index investigation_gaps_project_status_idx
  on public.investigation_information_gaps(project_id, status, updated_at desc);
create trigger investigation_information_gaps_set_updated_at
  before update on public.investigation_information_gaps
  for each row execute function public.set_updated_at();

create table public.investigation_working_knowledge (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  statement text not null check (char_length(trim(statement)) between 1 and 2000),
  state public.working_knowledge_state not null default 'ACTIVE',
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, id)
);

create index investigation_working_knowledge_project_order_idx
  on public.investigation_working_knowledge(project_id, state, sort_order, created_at, id);
create trigger investigation_working_knowledge_set_updated_at
  before update on public.investigation_working_knowledge
  for each row execute function public.set_updated_at();

-- Provenance support is optional. A link means "this material supports the working
-- context item"; it does not promote the statement to verified fact.
create table public.investigation_working_knowledge_support (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  knowledge_id uuid not null,
  source_id uuid,
  evidence_id uuid,
  analyst_note text check (analyst_note is null or char_length(analyst_note) <= 2000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key(project_id, knowledge_id)
    references public.investigation_working_knowledge(project_id, id) on delete cascade,
  foreign key(project_id, source_id)
    references public.sources(project_id, id) on delete restrict,
  foreign key(project_id, evidence_id)
    references public.evidence(project_id, id) on delete restrict,
  check ((source_id is not null)::integer + (evidence_id is not null)::integer = 1)
);

create unique index investigation_working_knowledge_support_source_unique_idx
  on public.investigation_working_knowledge_support(project_id, knowledge_id, source_id)
  where source_id is not null;
create unique index investigation_working_knowledge_support_evidence_unique_idx
  on public.investigation_working_knowledge_support(project_id, knowledge_id, evidence_id)
  where evidence_id is not null;
create index investigation_working_knowledge_support_knowledge_idx
  on public.investigation_working_knowledge_support(project_id, knowledge_id, created_at, id);

alter table public.investigation_questions enable row level security;
alter table public.investigation_information_gaps enable row level security;
alter table public.investigation_working_knowledge enable row level security;
alter table public.investigation_working_knowledge_support enable row level security;

create policy "investigation questions select owned investigation"
  on public.investigation_questions for select to authenticated
  using (public.project_is_owned(project_id));
create policy "investigation questions insert owned investigation"
  on public.investigation_questions for insert to authenticated
  with check (public.project_is_owned(project_id) and created_by = auth.uid());
create policy "investigation questions update owned investigation"
  on public.investigation_questions for update to authenticated
  using (public.project_is_owned(project_id))
  with check (public.project_is_owned(project_id) and created_by = auth.uid());
create policy "investigation questions delete owned investigation"
  on public.investigation_questions for delete to authenticated
  using (public.project_is_owned(project_id));

create policy "investigation gaps select owned investigation"
  on public.investigation_information_gaps for select to authenticated
  using (public.project_is_owned(project_id));
create policy "investigation gaps insert owned investigation"
  on public.investigation_information_gaps for insert to authenticated
  with check (public.project_is_owned(project_id) and created_by = auth.uid());
create policy "investigation gaps update owned investigation"
  on public.investigation_information_gaps for update to authenticated
  using (public.project_is_owned(project_id))
  with check (public.project_is_owned(project_id) and created_by = auth.uid());
create policy "investigation gaps delete owned investigation"
  on public.investigation_information_gaps for delete to authenticated
  using (public.project_is_owned(project_id));

create policy "working knowledge select owned investigation"
  on public.investigation_working_knowledge for select to authenticated
  using (public.project_is_owned(project_id));
create policy "working knowledge insert owned investigation"
  on public.investigation_working_knowledge for insert to authenticated
  with check (public.project_is_owned(project_id) and created_by = auth.uid());
create policy "working knowledge update owned investigation"
  on public.investigation_working_knowledge for update to authenticated
  using (public.project_is_owned(project_id))
  with check (public.project_is_owned(project_id) and created_by = auth.uid());
create policy "working knowledge delete owned investigation"
  on public.investigation_working_knowledge for delete to authenticated
  using (public.project_is_owned(project_id));

create policy "working knowledge support select owned investigation"
  on public.investigation_working_knowledge_support for select to authenticated
  using (public.project_is_owned(project_id));
create policy "working knowledge support insert owned investigation"
  on public.investigation_working_knowledge_support for insert to authenticated
  with check (public.project_is_owned(project_id) and created_by = auth.uid());
create policy "working knowledge support delete owned investigation"
  on public.investigation_working_knowledge_support for delete to authenticated
  using (public.project_is_owned(project_id));

comment on column public.projects.purpose is
  'Why the Investigation exists and what a useful answer should enable.';
comment on column public.projects.intended_consumer is
  'Human-readable intended consumer; not required to be an application user.';
comment on column public.projects.decision_context is
  'Decision or intelligence-use context the Investigation is intended to support.';
comment on column public.projects.expected_product_type is
  'Human-readable expected product; intentionally free text at Direction stage.';
comment on column public.projects.due_at is
  'Optional intelligence deadline. It is not a workflow gate.';
comment on table public.investigation_questions is
  'Supporting intelligence questions. They are analytical questions, not tasks.';
comment on table public.investigation_information_gaps is
  'Unknowns that may later drive Collection requirements; they are not tasks.';
comment on table public.investigation_working_knowledge is
  'Analyst working context. Rows are not automatically treated as facts or Evidence.';
comment on table public.investigation_working_knowledge_support is
  'Optional provenance links for working context; a link is not a verification judgment.';
