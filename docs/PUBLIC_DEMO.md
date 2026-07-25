# Public Demo

`/demo` and `/demo/ai` are no-account public routes. Demo data is a repository-owned deterministic fixture with documentation IP ranges (`198.51.100.0/24`, `203.0.113.0/24`) and `example.*` domains. It never queries production project rows, storage paths, signed URLs, user emails, prompts, outputs, or API keys.

A permanent banner states: **Demo data is synthetic. Changes are not saved.** Mutating project actions are not offered; visitors must create an account to persist real work.

The fixture shows representative dashboard counts, notes, evidence metadata, timeline, tasks, CTI records, a small knowledge graph, and a report preview. Fictional actors, malware, campaigns, CVEs, incidents, and attribution are labelled as synthetic demonstration data, not intelligence.

Guest AI requires a short-lived guest session after Turnstile verification and uses pasted text only. Results can be copied/downloaded by the browser but are not persisted or transferable into a new account in Phase 7.

Guest AI sessions on `/demo/ai` require Cloudflare Turnstile. The browser receives only `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; `TURNSTILE_SECRET_KEY` stays server-side and is used only by `/api/demo/guest/start` to call Cloudflare siteverify. Production fails closed if Turnstile is missing or verification is rejected, expired, timed out, reused, or unreachable.
