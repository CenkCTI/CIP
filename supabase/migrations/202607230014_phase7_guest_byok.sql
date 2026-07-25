create table if not exists public.guest_ai_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  ip_hash text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED','EXPIRED')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create table if not exists public.guest_ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  guest_session_id uuid not null references public.guest_ai_sessions(id) on delete cascade,
  provider text not null check (provider in ('openai','openrouter','groq')),
  model_label text not null check (char_length(model_label) between 1 and 120 and model_label ~ '^[A-Za-z0-9._:/+-]+$'),
  workflow text not null check (workflow in ('summarize_research','extract_indicators','extract_entities','suggest_mitre_mapping','generate_report_draft','translate_document')),
  input_chars integer not null check (input_chars between 1 and 12000),
  output_chars integer check (output_chars between 0 and 100000),
  status text not null default 'RESERVED' check (status in ('RESERVED','SUCCEEDED','FAILED','CANCELLED')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.guest_ai_sessions enable row level security;
alter table public.guest_ai_usage_events enable row level security;
revoke all on public.guest_ai_sessions from public, anon, authenticated;
revoke all on public.guest_ai_usage_events from public, anon, authenticated;
create index if not exists guest_ai_sessions_cleanup_idx on public.guest_ai_sessions(expires_at, status);
create index if not exists guest_ai_sessions_ip_window_idx on public.guest_ai_sessions(ip_hash, created_at) where ip_hash is not null;
create index if not exists guest_ai_usage_events_session_window_idx on public.guest_ai_usage_events(guest_session_id, created_at);
create index if not exists guest_ai_usage_events_status_idx on public.guest_ai_usage_events(status, created_at);
create or replace function public.reserve_guest_ai_usage_event(p_guest_session_id uuid, p_provider text, p_model text, p_workflow text, p_input_chars integer, p_max_requests_hour integer default 5, p_max_requests_day integer default 20, p_max_input_chars integer default 12000)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_event_id uuid; v_hour int; v_day int; v_chars int; v_max_hour int := least(greatest(coalesce(p_max_requests_hour,5),1),10); v_max_day int := least(greatest(coalesce(p_max_requests_day,20),1),40); v_max_chars int := least(greatest(coalesce(p_max_input_chars,12000),1000),12000);
begin
  perform pg_advisory_xact_lock(hashtext(p_guest_session_id::text));
  update public.guest_ai_sessions set last_seen_at = now(), status = case when expires_at <= now() then 'EXPIRED' else status end where id = p_guest_session_id;
  if not exists (select 1 from public.guest_ai_sessions where id=p_guest_session_id and status='ACTIVE' and revoked_at is null and expires_at > now()) then return null; end if;
  if p_input_chars < 1 or p_input_chars > v_max_chars then return null; end if;
  select count(*), coalesce(sum(input_chars),0) into v_hour, v_chars from public.guest_ai_usage_events where guest_session_id=p_guest_session_id and created_at > now() - interval '1 hour';
  select count(*) into v_day from public.guest_ai_usage_events where guest_session_id=p_guest_session_id and created_at > now() - interval '1 day';
  if v_hour >= v_max_hour or v_day >= v_max_day or (v_chars + p_input_chars) > v_max_chars then return null; end if;
  insert into public.guest_ai_usage_events(guest_session_id, provider, model_label, workflow, input_chars) values (p_guest_session_id, p_provider, left(p_model,120), p_workflow, p_input_chars) returning id into v_event_id;
  return v_event_id;
end; $$;
create or replace function public.complete_guest_ai_usage_event(p_event_id uuid, p_status text, p_output_chars integer default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.guest_ai_usage_events set status = p_status, output_chars = p_output_chars, completed_at = now() where id=p_event_id and status='RESERVED' and p_status in ('SUCCEEDED','FAILED','CANCELLED');
end; $$;
create or replace function public.cleanup_expired_guest_ai_sessions(p_dry_run boolean default true)
returns table(expired_count integer, deleted_usage_count integer) language plpgsql security definer set search_path = '' as $$
begin
  select count(*)::int, coalesce((select count(*)::int from public.guest_ai_usage_events e join public.guest_ai_sessions s on s.id=e.guest_session_id where s.expires_at <= now() or s.status <> 'ACTIVE'),0) into expired_count, deleted_usage_count from public.guest_ai_sessions where expires_at <= now() or status <> 'ACTIVE';
  if not p_dry_run then delete from public.guest_ai_sessions where expires_at <= now() or status <> 'ACTIVE'; end if;
  return next;
end; $$;
revoke all on function public.reserve_guest_ai_usage_event(uuid,text,text,text,integer,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.complete_guest_ai_usage_event(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.cleanup_expired_guest_ai_sessions(boolean) from public, anon, authenticated;
