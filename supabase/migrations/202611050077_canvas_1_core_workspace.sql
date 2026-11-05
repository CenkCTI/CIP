-- CANVAS-1: Investigation-owned, empty-by-default analytical workspaces.
-- Canvas content is presentation/working material, never authoritative CTI evidence.
create table public.analysis_canvases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 120),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id)
);
create index analysis_canvases_project_idx on public.analysis_canvases(project_id, updated_at desc);

create table public.analysis_canvas_items (
  id uuid primary key,
  project_id uuid not null,
  canvas_id uuid not null,
  kind text not null check (kind = 'NOTE'),
  content text not null check (char_length(content) <= 8000),
  x double precision not null check (x between -1000000 and 1000000),
  y double precision not null check (y between -1000000 and 1000000),
  width double precision not null check (width between 180 and 1200),
  height double precision not null check (height between 120 and 900),
  z_index integer not null default 0 check (z_index between 0 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, canvas_id) references public.analysis_canvases(project_id, id) on delete cascade,
  unique (project_id, canvas_id, id)
);
create index analysis_canvas_items_canvas_idx on public.analysis_canvas_items(project_id, canvas_id, z_index, id);

-- Transaction receipts make retries idempotent after an uncertain network response.
create table public.analysis_canvas_mutations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  canvas_id uuid not null,
  request_id uuid not null,
  base_revision bigint not null check (base_revision >= 0),
  result_revision bigint not null check (result_revision > base_revision),
  input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (project_id, canvas_id) references public.analysis_canvases(project_id, id) on delete cascade,
  unique (canvas_id, request_id)
);
create index analysis_canvas_mutations_project_idx on public.analysis_canvas_mutations(project_id, canvas_id, result_revision);

alter table public.analysis_canvases enable row level security;
alter table public.analysis_canvas_items enable row level security;
alter table public.analysis_canvas_mutations enable row level security;

create policy analysis_canvases_select on public.analysis_canvases for select to authenticated
  using (created_by = auth.uid() and public.project_is_owned(project_id));
create policy analysis_canvases_insert on public.analysis_canvases for insert to authenticated
  with check (created_by = auth.uid() and public.project_is_owned(project_id));
create policy analysis_canvases_update on public.analysis_canvases for update to authenticated
  using (created_by = auth.uid() and public.project_is_owned(project_id))
  with check (created_by = auth.uid() and public.project_is_owned(project_id));
create policy analysis_canvases_delete on public.analysis_canvases for delete to authenticated
  using (created_by = auth.uid() and public.project_is_owned(project_id));
create policy analysis_canvas_items_select on public.analysis_canvas_items for select to authenticated
  using (public.project_is_owned(project_id) and exists (
    select 1 from public.analysis_canvases b where b.project_id = analysis_canvas_items.project_id
      and b.id = analysis_canvas_items.canvas_id and b.created_by = auth.uid()
  ));
create policy analysis_canvas_mutations_select on public.analysis_canvas_mutations for select to authenticated
  using (created_by = auth.uid() and public.project_is_owned(project_id));

-- Explicit grants prevent browser-side writes that bypass revision checks.
revoke all on public.analysis_canvases, public.analysis_canvas_items, public.analysis_canvas_mutations
  from public, anon, authenticated;
grant select, insert, delete on public.analysis_canvases to authenticated;
grant update(name) on public.analysis_canvases to authenticated;
grant select on public.analysis_canvas_items to authenticated;
grant select on public.analysis_canvas_mutations to authenticated;

-- One RPC = one atomic board snapshot. Definer is deliberately restricted and
-- independently verifies auth.uid(), Investigation ownership, and board ownership.
create function public.save_analysis_canvas_v1(
  p_project_id uuid,
  p_canvas_id uuid,
  p_base_revision bigint,
  p_request_id uuid,
  p_items jsonb
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_revision bigint;
  v_existing public.analysis_canvas_mutations%rowtype;
  v_hash text;
  v_new_revision bigint;
begin
  if v_uid is null or p_request_id is null or p_base_revision is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select b.revision into v_revision
  from public.analysis_canvases b
  join public.projects p on p.id = b.project_id
  where b.project_id = p_project_id and b.id = p_canvas_id
    and b.created_by = v_uid and p.owner_id = v_uid
  for update of b;
  if not found then
    raise exception 'Canvas not found' using errcode = '42501';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'Invalid item set' using errcode = '22023';
  end if;
  v_hash := encode(sha256(convert_to(p_items::text, 'UTF8')), 'hex');
  select * into v_existing from public.analysis_canvas_mutations
    where canvas_id = p_canvas_id and request_id = p_request_id;
  if found then
    if v_existing.base_revision = p_base_revision and v_existing.input_sha256 = v_hash then
      return v_existing.result_revision;
    end if;
    raise exception 'Request ID already used' using errcode = '22023';
  end if;

  if p_base_revision <> v_revision then
    raise exception 'EDIT_CONFLICT' using errcode = '40001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as item(id uuid, kind text, content text,
      x double precision, y double precision, width double precision, height double precision, z_index integer)
    group by item.id having item.id is null or count(*) > 1
  ) then
    raise exception 'Duplicate or missing item IDs' using errcode = '22023';
  end if;

  delete from public.analysis_canvas_items where project_id = p_project_id and canvas_id = p_canvas_id;
  insert into public.analysis_canvas_items (id, project_id, canvas_id, kind, content, x, y, width, height, z_index)
    select item.id, p_project_id, p_canvas_id, item.kind, item.content, item.x, item.y,
      item.width, item.height, item.z_index
    from jsonb_to_recordset(p_items) as item(id uuid, kind text, content text,
      x double precision, y double precision, width double precision, height double precision, z_index integer);
  update public.analysis_canvases set revision = revision + 1, updated_at = now()
    where id = p_canvas_id and project_id = p_project_id returning revision into v_new_revision;
  insert into public.analysis_canvas_mutations
    (project_id, canvas_id, request_id, base_revision, result_revision, input_sha256, created_by)
    values (p_project_id, p_canvas_id, p_request_id, p_base_revision, v_new_revision, v_hash, v_uid);
  return v_new_revision;
end
$$;
revoke all on function public.save_analysis_canvas_v1(uuid,uuid,bigint,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.save_analysis_canvas_v1(uuid,uuid,bigint,uuid,jsonb) to authenticated;

comment on table public.analysis_canvases is 'Canvas-1 independent Investigation presentation workspaces; no authoritative CTI content';
comment on table public.analysis_canvas_items is 'Canvas-1 working notes and layout, replaced atomically via authorized revision RPC';
