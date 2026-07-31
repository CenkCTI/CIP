# Phase 2.2A — Research Sources and Secure Feed Ingestion

## Trust boundary and lifecycle
Research feeds are Investigation-scoped external collection inputs. Their normalized items are untrusted research material: ingestion never creates Evidence, analytical Sources, indicators, entities, attribution judgments, or graph relationships. Creation and editing never perform network I/O; only **Fetch now** invokes collection. A feed can be enabled, paused, or archived independently of its `NEVER_FETCHED`, `HEALTHY`, `DEGRADED`, or `ERROR` health. Pausing preserves health, items, and runs. Changing only metadata preserves fetch state; changing the URL resets conditional headers, final-URL assumptions, detected type, and health while retaining history.

## Secure server-only collection
`src/lib/research-feeds` is server-only. The action accepts only strict Investigation/feed UUIDs and loads the owned stored URL. A workflow-specific client reads `SUPABASE_SERVICE_ROLE_KEY` only in server-only code; it is never returned, logged, exposed to Client Components, or reused from BYOK. Authenticated clients have read-only RLS access and cannot execute workflow RPCs. The action authenticates normally, verifies ownership, and passes its server-derived actor ID to trusted RPCs, which independently verify ownership. URL validation uses the platform URL parser, permits HTTP(S) on ports 80/443, rejects credentials, fragments, injection characters, internal/single-label and metadata hosts, and preserves meaningful query parameters. UI list URLs redact query values.

Every initial and redirect destination is resolved. `ipaddr.js` rejects every non-unicast/private, loopback, link-local, mapped-private, documentation, multicast, and reserved answer; mixed answers fail closed. An Undici Agent pins its lookup callback to the selected validated address while retaining the hostname for Host/SNI, preventing a second independent DNS resolution. Redirects are manual, independently validated and pinned, limited to three, loop-detected, and cannot downgrade HTTPS to HTTP.

Limits are a 3-second connection timeout, 5-second headers timeout, one 10-second deadline covering DNS through decompression, 5 MiB compressed and decompressed streaming-body maxima, 500 parsed items, one two-minute feed lease, and a 60-second cooldown. Gzip, deflate, and Brotli pass through bounded streaming transforms; unknown, multiple, corrupt, or bomb encodings fail closed. Every response body and per-request Agent is destroyed/closed on every path. Only a fixed User-Agent, bounded Accept, and validated ETag/Last-Modified headers are sent—never cookies or authorization; validators are stripped on cross-origin redirects. Accepted responses are supported XML media types (or narrowly sniffed XML `text/plain`), 200, and 304. Raw bodies, headers, exceptions, credentials, and secret-bearing full URLs are not logged or persisted.

## XML, normalization, and deduplication
The maintained `fast-xml-parser` handles RSS 2.0, Atom 1.0, JSON Feed 1.1, and JSON Feed version 1 after rejecting DOCTYPE, ENTITY, XInclude, malformed XML, depth over 40, or more than 100,000 XML tags. Parsing is bounded to 500 entries. HTML fields become bounded plain text; scripts, styles, objects, and markup are discarded. Relative item links resolve against the validated final feed URL but are never fetched. Dates fail to null and unusable items are skipped.

Canonical items have server-generated SHA-256 URL and deterministic normalized-content fingerprints. Uniqueness is Investigation-scoped and transactional in PostgreSQL. Ordered transaction advisory locks serialize the Investigation plus URL/content keys before fingerprints are re-read, preventing concurrent duplicate or orphan items. Unchanged observations update last-seen/count only; known-URL content changes retain historical hashes, set `content_changed_at`, and increment `items_changed`. URL matches precede content matches, supporting cross-feed reuse and historical content fingerprints. Conflicting URL/content matches are never merged automatically. Feed observations update counts and first/last-seen provenance.

## Transactions, health, and safe failures
A short SECURITY DEFINER claim RPC verifies the trusted actor owner, enabled/archive/cooldown state, fails an abandoned run with `LEASE_EXPIRED`, creates a RUNNING row, and releases the database transaction before networking. Its opaque token is returned once in an atomic claim snapshot with the configured URL and validators; only its SHA-256 hash is persisted. The token is bound to project, feed, run, configured-URL hash, and expiry; stale callbacks cannot clear a newer lease. Completion payload status, shape, size, hashes, dates, fields, categories, headers, URL, and byte counts are transactionally validated. Complete/fail RPCs lock the owned records, atomically finalize canonical items, fingerprints, observations, run counters, health, and lease release. A second active claim receives a controlled result. Success/304 resets failures and makes health HEALTHY; failures 1–2 are DEGRADED and 3+ ERROR. Stable safe codes are documented in `errors.ts`; only bounded controlled messages reach storage/UI.

Supabase installs `pgcrypto` in the `extensions` schema. Additive migration 024 verifies that placement and provides a strict, immutable, parallel-safe `public.digest(text,text)` compatibility wrapper delegated to `extensions.digest`; only `service_role` may execute the wrapper, allowing the already-live migration 023 RPC definitions to run without manual SQL intervention. Explicit client DTO projections omit configured URLs, validators, actor IDs, lease state, request hashes, token hashes, and internal error codes. All five tables use owner-scoped read RLS through the parent Investigation, composite foreign keys prevent cross-Investigation references, and workflow RPCs conceal foreign-record existence. Direct workflow-field updates are unavailable. Creation takes an Investigation advisory lock to enforce the 100-feed limit. Archive preserves history; Restore is explicit and always paused. Migration 023 is additive; apply migrations 001–024 in filename order. The server requires `SUPABASE_SERVICE_ROLE_KEY`; never prefix it with `NEXT_PUBLIC_`. Production egress must permit public HTTP/HTTPS and the runtime must support Node DNS and Undici.

## Live acceptance checklist
1. Create a new Investigation.
2. Add a user-controlled public HTTPS RSS feed.
3. Verify no fetch occurs automatically.
4. Click Fetch now.
5. Confirm a successful run is recorded.
6. Confirm feed type is detected.
7. Confirm normalized items appear.
8. Fetch the same feed again.
9. Confirm duplicate items are not created.
10. Confirm repeated observations update last-seen values.
11. Confirm ETag or Last-Modified is reused when supplied.
12. Confirm 304 is treated as a successful check.
13. Pause the feed.
14. Confirm Fetch now is blocked.
15. Enable the feed.
16. Edit only the feed name.
17. Confirm fetch state is preserved.
18. Edit the feed URL.
19. Confirm conditional-request state and health reset.
20. Test malformed XML using a controlled public test feed.
21. Confirm a safe error is shown.
22. Confirm no raw response body or stack appears.
23. Enter a loopback/private URL and confirm rejection occurs before any network request.
24. Verify second-user denial.
25. Regression-check Evidence, Attribution and Reports.

Never contact cloud metadata endpoints manually; use fixtures for blocked redirect tests. Live Supabase validation remains required.

## Exclusions
This phase does not provide a Research Inbox, triage, automatic Source/Evidence creation, IOC/entity/AI extraction, relationship proposals, watchlists, alerts/notifications, sharing, organization/authenticated/cookie feeds, scraping, item-link fetching, crawling, cron scheduling, or Phase 2.2B work.


## Live acceptance status
The project owner confirmed the complete Phase 2.2A live Supabase and deployed-application acceptance before PR #24 was merged. Migration 024 and PostgREST reload were validated; this is authoritative and no longer a release blocker.
