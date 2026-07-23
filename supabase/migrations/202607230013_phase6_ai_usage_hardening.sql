-- Phase 6 live hardening after migration 012 was applied.
-- Keep metadata-only logging; do not store prompts, source text, model output, URLs, tokens, or secrets.

drop policy if exists "Project owners can insert their AI usage metadata" on public.ai_usage_events;
drop policy if exists "Project owners can update their reserved AI usage metadata" on public.ai_usage_events;

create index if not exists ai_usage_events_user_all_attempts_idx
  on public.ai_usage_events(user_id, created_at desc, input_chars);

create or replace function public.reserve_ai_usage_event(
  p_project_id uuid,
  p_workflow text,
  p_input_chars integer,
  p_window_minutes integer,
  p_max_requests integer,
  p_max_input_chars integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_event uuid;
  v_min_window integer := 60;
  v_max_requests integer := 10;
  v_max_input_chars integer := 200000;
  v_effective_window integer;
  v_effective_requests integer;
  v_effective_chars integer;
  v_start timestamptz;
  v_count integer;
  v_chars integer;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_workflow not in ('summarize_research','extract_indicators','extract_entities','suggest_mitre_mapping','generate_report_draft','translate_document') then raise exception 'invalid workflow'; end if;
  if p_input_chars < 0 or p_input_chars > v_max_input_chars then raise exception 'invalid input size'; end if;
  if not exists (select 1 from public.projects p where p.id = p_project_id and p.owner_id = v_user) then raise exception 'project not found'; end if;

  v_effective_window := greatest(coalesce(p_window_minutes, v_min_window), v_min_window);
  v_effective_requests := least(coalesce(p_max_requests, v_max_requests), v_max_requests);
  v_effective_chars := least(coalesce(p_max_input_chars, v_max_input_chars), v_max_input_chars);
  v_start := now() - make_interval(mins => v_effective_window);

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select count(*), coalesce(sum(input_chars), 0)
    into v_count, v_chars
    from public.ai_usage_events
   where user_id = v_user
     and created_at >= v_start;

  if v_count >= v_effective_requests or v_chars + p_input_chars > v_effective_chars then raise exception 'rate limit exceeded'; end if;

  insert into public.ai_usage_events(project_id,user_id,workflow,input_chars,status)
  values (p_project_id,v_user,p_workflow,p_input_chars,'RESERVED')
  returning id into v_event;
  return v_event;
end $$;

revoke all on function public.reserve_ai_usage_event(uuid,text,integer,integer,integer,integer) from public, anon;
grant execute on function public.reserve_ai_usage_event(uuid,text,integer,integer,integer,integer) to authenticated;
