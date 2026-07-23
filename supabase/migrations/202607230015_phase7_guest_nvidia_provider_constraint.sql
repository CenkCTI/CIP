alter table public.guest_ai_usage_events
  drop constraint if exists guest_ai_usage_events_provider_check;

alter table public.guest_ai_usage_events
  add constraint guest_ai_usage_events_provider_check
  check (provider in ('openai','openrouter','groq','nvidia_nim'));
