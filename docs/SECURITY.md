# Security Notes

The app relies on Supabase Auth, owner-scoped project queries, RLS, storage path scoping, validated uploads, authorized exports, and duplicate-safe CTI relationship tables.

Phase 6 adds a prompt-injection boundary: source notes, evidence, tasks, timeline items, CTI descriptions, and pasted text are untrusted data. The model has no tools or write path. Generation routes are read-only except metadata-only usage reservation/completion. Approval routes re-authenticate, re-check project ownership, validate submitted AI text as untrusted input, and save through whitelisted tables/actions.

`ai_usage_events` stores no prompts, raw outputs, source content, secrets, API keys, signed URLs, storage paths, or full errors. Incident response: disable AI with `AI_ENABLED=false`, rotate Supabase credentials if exposed, review `ai_usage_events`, and remove unsafe provider endpoints.

Phase 6 live hardening: AI indicator approvals send allowlisted primitive fields only; translation approvals re-fetch Note/Evidence source text server-side before protected-token checks; migration 013 removes direct AI usage metadata write policies and counts all attempts in the rolling limit window.
