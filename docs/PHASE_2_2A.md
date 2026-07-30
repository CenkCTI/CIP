# Phase 2.2A — Research Sources and Secure Feed Ingestion

## Trust boundary and lifecycle
Research feeds are Investigation-scoped external collection inputs. Their normalized items are untrusted research material: ingestion never creates Evidence, analytical Sources, indicators, entities, attribution judgments, or graph relationships. Creation and editing never perform network I/O; only **Fetch now** invokes collection. A feed can be enabled, paused, or archived independently of its `NEVER_FETCHED`, `HEALTHY`, `DEGRADED`, or `ERROR` health. Pausing preserves health, items, and runs. Changing only metadata preserves fetch state; changing the URL resets conditional headers, final-URL assumptions, detected type, and health while retaining history.

## Secure server-only collection
`src/lib/research-feeds` is server-only. The action accepts only strict Investigation/feed UUIDs and loads the owned stored URL. URL validation uses the platform URL parser, permits HTTP(S) on ports 80/443, rejects credentials, fragments, injection characters, internal/single-label and metadata hosts, and preserves meaningful query parameters. UI list URLs redact query values.

Every initial and redirect destination is resolved. `ipaddr.js` rejects every non-unicast/private, loopback, link-local, mapped-private, documentation, multicast, and reserved answer; mixed answers fail closed. An Undici Agent pins its lookup callback to the selected validated address while retaining the hostname for Host/SNI, preventing a second independent DNS resolution. Redirects are manual, independently validated and pinned, limited to three, loop-detected, and cannot downgrade HTTPS to HTTP.

Limits are a 3-second connection timeout, 5-second headers timeout, 10-second total timeout, 5 MiB decompressed streaming-body maximum, 500 parsed items, one two-minute feed lease, and a 60-second cooldown. Only a fixed User-Agent, bounded Accept, and validated ETag/Last-Modified headers are sent—never cookies or authorization. Accepted responses are supported XML media types (or narrowly sniffed XML `text/plain`), 200, and 304. Raw bodies, headers, exceptions, credentials, and secret-bearing full URLs are not logged or persisted.

## XML, normalization, and deduplication
The maintained `fast-xml-parser` handles RSS 2.0 and Atom 1.0 after rejecting DOCTYPE, ENTITY, XInclude, malformed XML, depth over 40, or more than 100,000 XML tags. Parsing is bounded to 500 entries. HTML fields become bounded plain text; scripts, styles, objects, and markup are discarded. Relative item links resolve against the validated final feed URL but are never fetched. Dates fail to null and unusable items are skipped.

Canonical items have server-generated SHA-256 URL and deterministic normalized-content fingerprints. Uniqueness is Investigation-scoped and transactional in PostgreSQL. URL matches precede content matches, supporting cross-feed reuse and historical content fingerprints. Conflicting URL/content matches are never merged automatically. Feed observations update counts and first/last-seen provenance.

## Transactions, health, and safe failures
A short SECURITY DEFINER claim RPC verifies the authenticated owner, enabled/archive/cooldown state, recovers expired leases, creates a RUNNING row, and releases the database transaction before networking. Complete/fail RPCs lock the owned records, atomically finalize canonical items, fingerprints, observations, run counters, health, and lease release. A second active claim receives a controlled result. Success/304 resets failures and makes health HEALTHY; failures 1–2 are DEGRADED and 3+ ERROR. Stable safe codes are documented in `errors.ts`; only bounded controlled messages reach storage/UI.

All five tables use owner-scoped RLS through the parent Investigation, composite foreign keys prevent cross-Investigation references, and workflow RPCs conceal foreign-record existence. Migration 023 is additive; apply migrations 001–023 in filename order. No additional environment variables are required beyond the existing Supabase configuration. Production egress must permit public HTTP/HTTPS and the runtime must support Node DNS and Undici.

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
