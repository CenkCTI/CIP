# Phase 2.3C — Technical Source Pack and Collection Operations

## Purpose and trust boundary
Phase 2.3C adds the provider-independent collection layer between fixed server-owned technical sources and the Phase 2.3B Technical Signal trusted workflow. External records are source-backed assertions, not CİTEM analyst assessments, profile matches, alerts, Evidence, Indicators, CVE analytical entities, or Investigation mutations.

The only persistence path for mapped technical developments is:

`fixed source → adapter → validated mapped signal → record_technical_signal`

Adapters have no database client and never write Technical Signal tables directly.

## Relationship to the IOC Inbox
The implementation reuses hardened design patterns from Phase 2.2C—fixed adapter registries, bounded transport, exact leases, provider-bound cursors, sanitized errors, scheduler deadlines, and server-only credentials—but it does not use IOC candidates, IOC Inbox triage state, candidate acceptance, ThreatFox, or OTX. CISA KEV and NVD records are recorded directly as Technical Signals and are never routed through the IOC Inbox.

## Database model
Migration `202608060033_phase2_3c_technical_source_collection.sql` adds owner-scoped source connections, collection runs, bounded issues, source audit history, exact lease semantics, provider-bound cursors, scheduler state, RLS/ACL, and service-role-only lifecycle RPCs.

Migration `202608070034_phase2_3c_advisory_key_repair.sql` is an additive live-acceptance repair. It leaves migration 032 immutable and replaces only `technical_signal_validate_canonical_key` so advisory/report-shaped canonical keys are validated with the intended regex precedence. The migration preserves the helper ACL boundary and includes non-mutating advisory/report regression assertions.

## Exact run and lease semantics
A claim generates a random 32-byte token. The database stores only its SHA-256 hash and returns plaintext only to the narrow server-only orchestrator. Completion and failure require the exact run and token. One `RUNNING` row is allowed per connection. Wrong, stale, expired, or cross-owner operations fail closed.

The authoritative connection cursor advances only after successful completion and only when it still equals the run's claimed cursor. Failed runs never advance it. A run may have persisted some Technical Signals before a later page or record fails; the run is marked `FAILED`, the cursor remains unchanged, and replay is safe because Phase 2.3B signal/observation recording is idempotent.

## Source pack
### TEST_SYNTHETIC
`TECHINT_TEST_SOURCE_ENABLED=true` exposes a local, deterministic, credential-free source labelled **TEST / SYNTHETIC**. It performs no network requests. The first two sequences replay identical observations; a later sequence changes one vulnerability snapshot to exercise revision semantics. All rows travel through the production collection orchestrator and `record_technical_signal`.

Live acceptance exposed a Phase 2.3B database canonical-key bug for the synthetic advisory record `advisory:test-synthetic:advisory-001`; migration 034 repairs that validator without editing migration 032.

### CISA KEV
Fixed endpoint:

`https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json`

The adapter performs fixed-host HTTPS GET only, disables redirects, caps the body at 12 MiB and the catalog at 5,000 records, and persists no raw catalog. Each valid entry maps to `ACTIVE_EXPLOITATION` with canonical key `cve:<CVE-ID>`, `UNKNOWN` severity, null confidence, catalog-release effective time, and source-backed CVE/vendor/product assertions. KEV status is not converted into CVSS, business risk, Global Priority, or analyst confidence.

Live acceptance successfully created 1,661 KEV signals on the first run and later completed a no-change run with zero mapped/created records.

### NVD CVE API 2.0
Fixed endpoint:

`https://services.nvd.nist.gov/rest/json/cves/2.0`

The adapter uses official `lastModStartDate`, `lastModEndDate`, `startIndex`, and `resultsPerPage` parameters. Initial lookback defaults to 24 hours and is capped at 7 days. Successful cursors use a five-minute overlap and never request more than the official 120-day date range. A run remains capped at 20 successful pages, 20 total HTTP attempts, and 2,000 records. `NVD_API_KEY` is optional, server-only, never stored, never rendered, and never logged.

Live acceptance exposed three public-source constraints in sequence: 100-record pages caused too many requests and rate limiting; a 2,000-record response exceeded CİTEM's deliberate 8 MiB untrusted-response bound; a subsequent 500-record request could exceed the generic 15-second transport timeout. The final fixed NVD policy therefore preserves the global transport boundary while specializing only this known source:

- start at `resultsPerPage=250`;
- use a source-specific 30-second request timeout;
- if the same page exceeds 8 MiB or times out, retry the same `startIndex` at 125 records;
- pace every HTTP attempt after the first by 6.5 seconds;
- cap both successful pages and total HTTP attempts at 20;
- cap the run at 2,000 records;
- never advance the authoritative cursor unless the complete bounded window succeeds.

NVD officially documents offset pagination, a default/maximum CVE page size of 2,000, a public rate limit of 5 requests per rolling 30-second window, and recommends sleeping about six seconds between requests. CİTEM intentionally uses a smaller page size because live responses demonstrated that the official maximum is incompatible with the local 8 MiB safety bound and observed public API latency.

Each valid record maps to `VULNERABILITY_CHANGE` with official `lastModified` effective time. CVSS precedence is v4, v3.1, then v3.0; the result is technical severity, not business risk. Descriptions, references, CWEs, and affected-configuration summaries are deterministically bounded. Phase 2.3C creates only a provider-asserted CVE assertion; vendor/product alias extraction remains Phase 2.3D.

## Fixed advisory-feed parser foundation
Strict RSS, Atom, and JSON Feed parsers exist for future code-owned feeds. XML DTDs and entities are rejected; user URLs, HTML scraping, redirect following, and mutable-title identity are forbidden. Stable GUID/item ID or a fixed-source item URL is required. Exact CVE patterns may create `SYSTEM_EXTRACTED` CVE assertions only.

No `CISA_ADVISORIES` live adapter is registered because an authoritative stable machine-readable endpoint was not verified during this delivery.

## Transport restrictions
- HTTPS only and adapter-owned host/path allowlists
- fixed GET methods and deterministic User-Agent
- redirects disabled
- generic transport timeout 15 seconds; fixed NVD adapter explicitly uses a bounded 30-second timeout because of observed official API latency
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
Mapped signals are capped at 2,500 per run and run issues at 100. Controlled codes include source lifecycle/cooldown, invalid settings/cursor, lease mismatch/expiry, timeout/status/content/body/rate-limit failures, invalid responses, page/item/signal limits, signal recording failure, and generic collection failure. Raw database, network, stack, credential, or body details are not returned. `SIGNAL_RECORDING_FAILED` may retain only the bounded source record key for operator diagnosis.

## Explicit exclusions
No OTX, ThreatFox-to-TechINT mapping, URLhaus, MalwareBazaar, VirusTotal, Talos, Shodan, GreyNoise, EPSS, ATT&CK STIX ingestion, MISP, TAXII, arbitrary feed URL, taxonomy reconciliation, alias/entity resolution, profile matching, relevance/global-priority scoring, Global View population, alert, discovery, Investigation mutation, analytical entity creation, Evidence, Note, Timeline Event, Graph edge, report, or AI call is included.

## Deployment and Preview acceptance
Migration 033 has been applied in the operator test environment. Migration 034 is the only additive database repair introduced after live acceptance exposed the advisory-key bug. NVD body-size/rate-limit/timeout repairs are application-code changes and require no additional database migration.

The NVD timeout repair code head `6d21d8d76f55ed1bfd06b75cdcbe6cfbabdc994c` passed GitHub Actions run #150: lint, typecheck, tests, build, all Phase 2.2 migration harnesses, Phase 2.3A, Phase 2.3B, and the Phase 2.3C PostgreSQL 16 harness. The live-repair tests cover 250→125 body-size fallback and a 30-second timeout→125 retry while preserving request pacing. Vercel deployment for that code head also succeeded.

Subsequent documentation-only commits do not alter the validated NVD runtime behavior. Operator acceptance still requires repeating synthetic acceptance after migration 034, repeating NVD collection against the current Preview deployment, final two-user browser isolation, and confirmation that no analytical entities or Investigation state are mutated as a side effect.

Rollback is application rollback plus pausing sources. Collection history and source-backed signals are preserved; migrations 033/034 are additive and are not destructively rolled back in a live database.
