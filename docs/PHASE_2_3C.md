# Phase 2.3C — Technical Source Pack and Collection Operations

## Purpose and trust boundary
Phase 2.3C adds the provider-independent collection layer between fixed server-owned technical sources and the Phase 2.3B Technical Signal trusted workflow. External records are source-backed assertions, not CİTEM analyst assessments, profile matches, alerts, Evidence, Indicators, CVE analytical entities, or Investigation mutations.

The only persistence path for mapped technical developments is:

`fixed source → adapter → validated mapped signal → record_technical_signal`

Adapters have no database client and never write Technical Signal tables directly.

## Relationship to the IOC Inbox
The implementation reuses hardened design patterns from Phase 2.2C—fixed adapter registries, bounded transport, exact leases, provider-bound cursors, sanitized errors, scheduler deadlines, and server-only credentials—but it does not use IOC candidates, IOC Inbox triage state, candidate acceptance, ThreatFox, or OTX. CISA KEV and NVD records are recorded directly as Technical Signals and are never routed through the IOC Inbox.

## Database model
Migration `202608060033_phase2_3c_technical_source_collection.sql` adds:

- `technical_source_connections`: one owner-local persistent connection per fixed source, bounded settings and versioned cursor, lifecycle, schedule, and success/failure watermarks.
- `technical_collection_runs`: immutable run history with one active run per connection, exact trigger, bounded counters, sanitized errors, claimed/proposed cursor, and a SHA-256 lease-token hash.
- `technical_collection_run_issues`: capped, append-only safe issue summaries; no source bodies, stacks, credentials, SQL, or full IOC sets.
- `technical_source_audit_events`: append-only transactional lifecycle and settings history.

Authenticated analysts receive owner-scoped safe-column reads only. Cursor bodies, claimed cursors, proposed cursors, and lease hashes are not browser-readable. All mutations and run lifecycle RPCs are executable only by `service_role`; server actions authenticate the user and supply the actor ID from the session.

### Live-acceptance repair migration 034
Migration `202608070034_phase2_3c_advisory_key_repair.sql` is an additive repair discovered during operator live acceptance after migration 033 had already been applied. Migration 032 remains immutable. The repair replaces only `technical_signal_validate_canonical_key` to correct regex concatenation precedence for `TECHNICAL_ADVISORY` and report-shaped canonical keys, preserves the helper ACL boundary, and executes non-mutating advisory/report regression assertions during migration application.

## Exact run and lease semantics
A claim generates a random 32-byte token. The database stores only its SHA-256 hash and returns plaintext only to the narrow server-only orchestrator. Completion and failure require the exact run and token. One `RUNNING` row is allowed per connection. Wrong, stale, expired, or cross-owner operations fail closed.

The authoritative connection cursor advances only after successful completion and only when it still equals the run's claimed cursor. Failed runs never advance it. A run may have persisted some Technical Signals before a later page or record fails; the run is marked `FAILED`, the cursor remains unchanged, and replay is safe because Phase 2.3B signal/observation recording is idempotent.

When trusted signal persistence fails, the run issue may retain only the bounded source record key and controlled error code/message. Raw provider payloads, SQL errors, stack traces, and database details remain suppressed.

## Source pack
### TEST_SYNTHETIC
`TECHINT_TEST_SOURCE_ENABLED=true` exposes a local, deterministic, credential-free source labelled **TEST / SYNTHETIC**. It performs no network requests. The first two sequences replay identical observations; a later sequence changes one vulnerability snapshot to exercise revision semantics. All rows travel through the production collection orchestrator and `record_technical_signal`.

Live acceptance exposed that the synthetic `TECHNICAL_ADVISORY` record was rejected while the vulnerability, active-exploitation, and ATT&CK-shaped records succeeded. The root cause was the Phase 2.3B database canonical-key validator, not the synthetic fixture. Migration 034 repairs that database boundary without editing migration 032.

### CISA KEV
Fixed endpoint:

`https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json`

The adapter performs fixed-host HTTPS GET only, disables redirects, caps the body at 12 MiB and the catalog at 5,000 records, and persists no raw catalog. Each valid entry maps to `ACTIVE_EXPLOITATION` with canonical key `cve:<CVE-ID>`, `UNKNOWN` severity, null confidence, catalog-release effective time, and source-backed CVE/vendor/product assertions. KEV status is not converted into CVSS, business risk, Global Priority, or analyst confidence.

Operator live acceptance recorded a successful 1,661-record initial collection followed by a successful zero-record conditional collection, confirming idempotent/conditional behavior for the tested catalog state.

### NVD CVE API 2.0
Fixed endpoint:

`https://services.nvd.nist.gov/rest/json/cves/2.0`

The adapter uses official `lastModStartDate`, `lastModEndDate`, `startIndex`, and `resultsPerPage` parameters. Initial lookback defaults to 24 hours and is capped at 7 days. Successful cursors use a five-minute overlap and never request more than the official 120-day date range. A run is capped at 2,000 records; each page is capped at 8 MiB. `NVD_API_KEY` is optional, server-only, never stored, never rendered, and never logged.

After live acceptance showed public NVD rate limiting with the original 100-record page size, the adapter was repaired to request the NVD-optimized 2,000-record page size. A result window greater than the local 2,000-record run bound fails before a second request and never advances the cursor. If a bounded response ever requires another page, requests are spaced by six seconds. This aligns the collector with the NVD public-rate-limit and best-practice guidance while preserving controlled `RATE_LIMITED` handling.

Each valid record maps to `VULNERABILITY_CHANGE` with official `lastModified` effective time. CVSS precedence is v4, v3.1, then v3.0; the result is technical severity, not business risk. Descriptions, references, CWEs, and affected-configuration summaries are deterministically bounded. Phase 2.3C creates only a provider-asserted CVE assertion; vendor/product alias extraction remains Phase 2.3D.

## Fixed advisory-feed parser foundation
Strict RSS, Atom, and JSON Feed parsers exist for future code-owned feeds. XML DTDs and entities are rejected; user URLs, HTML scraping, redirect following, and mutable-title identity are forbidden. Stable GUID/item ID or a fixed-source item URL is required. Exact CVE patterns may create `SYSTEM_EXTRACTED` CVE assertions only.

No `CISA_ADVISORIES` live adapter is registered because an authoritative stable machine-readable endpoint was not verified during this delivery.

## Transport restrictions
- HTTPS only and adapter-owned host/path allowlists
- fixed GET methods and deterministic User-Agent
- redirects disabled
- 15-second timeout
- bounded content length and decoded body
- JSON content-type validation
- conditional ETag/Last-Modified support only in source cursors
- no arbitrary hostname, path, query, header, proxy, DNS target, WHOIS, socket, HTML scrape, or browser-configured endpoint
- no raw body or secret logging

## Scheduler and manual synchronization
The existing `CRON_SECRET` scheduler boundary is reused. `TECHINT_SCHEDULER_ENABLED=true` activates TechINT due claims. `TECHINT_SYNC_BATCH_SIZE` defaults to 5 and is capped at 10; `TECHINT_SYNC_CONCURRENCY` defaults to 2 and is capped at 4. Due claims exclude paused, archived, future, synthetic, and actively leased connections. Failures receive bounded exponential backoff; success resets failure count.

Manual **Sync now** submits only an owned connection UUID. The server resolves owner, source, settings, cursor, endpoint, and lease. A 30-second cooldown and active-run uniqueness prevent accidental duplicate runs.

## UI
`/techint/sources` is a secondary collection-operations route reachable from Global View. The locked primary TechINT navigation remains exactly Global View, Profiles, and InvestINT. The page shows fixed source metadata, status, interval, next/last run, failure count, safe run counters, lifecycle actions, settings, manual synchronization, recent run history, and append-only source audit history. It never renders raw cursor JSON, lease material, API keys, raw source responses, or fake Global View intelligence.

## Bounds and controlled failures
Mapped signals are capped at 2,500 per run and run issues at 100. Controlled codes include source lifecycle/cooldown, invalid settings/cursor, lease mismatch/expiry, timeout/status/content/body/rate-limit failures, invalid responses, page/item/signal limits, signal recording failure, and generic collection failure. Raw database, network, stack, credential, or body details are not returned.

## Explicit exclusions
No OTX, ThreatFox-to-TechINT mapping, URLhaus, MalwareBazaar, VirusTotal, Talos, Shodan, GreyNoise, EPSS, ATT&CK STIX ingestion, MISP, TAXII, arbitrary feed URL, taxonomy reconciliation, alias/entity resolution, profile matching, relevance/global-priority scoring, Global View population, alert, discovery, Investigation mutation, analytical entity creation, Evidence, Note, Timeline Event, Graph edge, report, or AI call is included.

## Deployment and Preview acceptance
Migration 033 has already been applied in the operator test environment during live acceptance. Because the advisory canonical-key defect was discovered after that application, migration 034 must now be applied as the additive repair before repeating the synthetic acceptance sequence.

Current acceptance sequence:

1. Apply migration 034 and reload PostgREST schema.
2. Redeploy the current PR head.
3. With `TECHINT_TEST_SOURCE_ENABLED=true` in the test/Preview environment, run the synthetic source again and confirm all four mappings complete successfully.
4. Run synthetic again after cooldown and confirm duplicate/idempotent behavior; run the later deterministic sequence to confirm the intended changed vulnerability revision.
5. Confirm source/run/audit isolation with a second user and no analytical side effects.
6. Run CISA KEV once; a no-change repeat may legitimately return zero mapped records.
7. Run NVD with the bounded 24-hour lookback. Confirm no rate-limit failure and, if persistence fails, use the safe `sourceRecordKey` issue to identify the exact CVE without exposing raw database details.
8. Disable the synthetic gate after acceptance.
9. Production activation remains a separate explicit operator decision.

Rollback is application rollback plus pausing sources. Collection history and source-backed signals are preserved. Migrations 033 and 034 are additive and are not destructively rolled back in a live database.
