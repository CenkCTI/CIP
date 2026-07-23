-- Phase 6 AI usage metadata only. Retention guidance: periodically run
-- delete from public.ai_usage_events where created_at < now() - interval '90 days';
create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  workflow text not null check (workflow in ('summarize_research','extract_indicators','extract_entities','suggest_mitre_mapping','generate_report_draft','translate_document')),
  input_chars integer not null check (input_chars between 0 and 200000),
  output_chars integer check (output_chars is null or output_chars between 0 and 200000),
  status text not null check (status in ('RESERVED','SUCCEEDED','FAILED','CANCELLED')) default 'RESERVED',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists ai_usage_events_project_created_idx on public.ai_usage_events(project_id, created_at desc);
create index if not exists ai_usage_events_user_window_idx on public.ai_usage_events(user_id, created_at desc) where status in ('RESERVED','SUCCEEDED');
alter table public.ai_usage_events enable row level security;
create policy "Project owners can read their AI usage metadata" on public.ai_usage_events for select to authenticated using (user_id = auth.uid() and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy "Project owners can insert their AI usage metadata" on public.ai_usage_events for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy "Project owners can update their reserved AI usage metadata" on public.ai_usage_events for update to authenticated using (user_id = auth.uid() and status = 'RESERVED') with check (user_id = auth.uid() and status in ('SUCCEEDED','FAILED','CANCELLED'));

create or replace function public.reserve_ai_usage_event(p_project_id uuid, p_workflow text, p_input_chars integer, p_window_minutes integer, p_max_requests integer, p_max_input_chars integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_event uuid; v_start timestamptz := now() - make_interval(mins => p_window_minutes); v_count integer; v_chars integer;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.projects p where p.id = p_project_id and p.owner_id = v_user) then raise exception 'project not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select count(*), coalesce(sum(input_chars),0) into v_count, v_chars from public.ai_usage_events where user_id = v_user and created_at >= v_start and status in ('RESERVED','SUCCEEDED');
  if v_count >= p_max_requests or v_chars + p_input_chars > p_max_input_chars then raise exception 'rate limit exceeded'; end if;
  insert into public.ai_usage_events(project_id,user_id,workflow,input_chars,status) values (p_project_id,v_user,p_workflow,p_input_chars,'RESERVED') returning id into v_event;
  return v_event;
end $$;
create or replace function public.complete_ai_usage_event(p_event_id uuid, p_status text, p_output_chars integer default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update public.ai_usage_events set status = p_status, output_chars = p_output_chars, completed_at = now() where id = p_event_id and user_id = v_user and status = 'RESERVED' and p_status in ('SUCCEEDED','FAILED','CANCELLED');
  if not found then raise exception 'usage event not found'; end if;
end $$;
revoke all on function public.reserve_ai_usage_event(uuid,text,integer,integer,integer,integer) from public, anon;
revoke all on function public.complete_ai_usage_event(uuid,text,integer) from public, anon;
grant execute on function public.reserve_ai_usage_event(uuid,text,integer,integer,integer,integer) to authenticated;
grant execute on function public.complete_ai_usage_event(uuid,text,integer) to authenticated;
