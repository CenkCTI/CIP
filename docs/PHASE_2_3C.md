# Phase 2.3C — Technical Source Pack and Collection Operations

## Purpose and trust boundary
Phase 2.3C adds the provider-independent collection layer between fixed server-owned technical sources and the Phase 2.3B Technical Signal trusted workflow. External records are source-backed assertions, not CİTEM analyst assessments, profile matches, alerts, Evidence, Indicators, CVE analytical entities, or Investigation mutations.

The only persistence path for mapped technical developments is:

`fixed source → adapter → validated mapped signal → record_technical_signal`

Adapters do not write Technical Signal tables directly. Credential resolution, when required, happens inside the trusted server-only orchestration boundary and credentials are never placed in browser payloads, source cursors, audit details, run issues, or Technical Signal provenance.

## Relationship to IOC Inbox
The original Phase 2.3C foundation reused hardened design patterns from Phase 2.2C—fixed adapter registries, bounded transport, exact leases, provider-bound cursors, sanitized errors, scheduler deadlines, and server-only credentials—while CISA KEV and NVD recorded directly into Technical Signals.

The Phase 2.3C completion adds a narrowly scoped ThreatFox bridge. It reuses the existing owner-local ThreatFox provider connection and encrypted credential repository; it does **not** create a second ThreatFox credential store, change IOC Inbox triage state, accept IOC candidates, or automatically create Indicators. The same hardened ThreatFox client/mapping primitives are reused and mapped independently into `IOC_OBSERVATION` Technical Signals through `record_technical_signal`.

## Database model
Migration `202608060033_phase2_3c_technical_source_collection.sql` adds owner-scoped source connections, collection runs, bounded issues, source audit history, exact lease semantics, provider-bound cursors, scheduler state, RLS/ACL, and service-role-only lifecycle RPCs.

Migration `202608070034_phase2_3c_advisory_key_repair.sql` is an additive live-acceptance repair. It leaves migration 032 immutable and replaces only `technical_signal_validate_canonical_key` so advisory/report-shaped canonical keys are validated with the intended regex precedence. The migration preserves the helper ACL boundary and includes non-mutating advisory/report regression assertions.

Migration `202608080036_phase2_3c_source_pack_completion.sql` is additive and extends only the Technical Source enum plus source-specific settings/cursor validation for the sources actually delivered by the completion work: `FIRST_EPSS`, `THREATFOX`, and `MALWAREBAZAAR`. Migrations 033–035 are not rewritten.

## Exact run and lease semantics
A claim generates a random 32-byte token. The database stores only its SHA-256 hash and returns plaintext only to the narrow server-only orchestrator. Completion and failure require the exact run and token. One `RUNNING` row is allowed per connection. Wrong, stale, expired, or cross-owner operations fail closed.

The authoritative connection cursor advances only after successful completion and only when it still equals the run's claimed cursor. Failed runs never advance it. A run may have persisted some Technical Signals before a later page or record fails; the run is marked `FAILED`, the cursor remains unchanged, and replay is safe because Phase 2.3B signal/observation recording is idempotent.

## Original Phase 2.3C source pack
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

## Phase 2.3C completion source pack
### FIRST EPSS
Official fixed endpoint:

`https://api.first.org/data/v1/epss`

The adapter uses the public FIRST API with fixed-host HTTPS GET, `limit=2000`, `offset=0`, descending EPSS sort, a configurable bounded minimum EPSS threshold (default `0.1`), a 4 MiB response cap, and conditional `If-Modified-Since` replay using the provider's `Last-Modified` header. The cursor contains only version and bounded `lastModified` metadata.

EPSS and percentile are source-backed probability/ranking metrics. They are **not** CİTEM analyst confidence, CVSS, severity, business risk, or Global Priority. The signal therefore keeps `confidence=null` and `severity=UNKNOWN`.

The implementation intentionally maps EPSS as a source-defined `PROVIDER_ALERT` with canonical key `report:first-epss:<CVE-ID>` and a provider-asserted CVE entity assertion. It does **not** use NVD's `VULNERABILITY_CHANGE` / `cve:<CVE-ID>` canonical projection because EPSS facts are provider-specific and would otherwise collide with NVD's canonical CVE snapshot for the same owner/type/key. Phase 2.3E may consume EPSS facts when computing relevance/priority.

### ThreatFox → TechINT
ThreatFox collection reuses the existing hardened provider implementation under `src/lib/ioc-connectors/providers/threatfox/` and the existing encrypted credential repository. The TechINT orchestrator resolves the existing owner-local ThreatFox credential only on the server. No duplicate credential table, plaintext persistence, browser credential, or cursor credential is introduced.

The bridge uses the existing ThreatFox `get_iocs` read-only request and provider normalization. A strict TechINT cursor stores only a bounded decimal `maxProviderId`; records at or below that high-water mark are not remapped. Valid DOMAIN/IP/URL observations map to `IOC_OBSERVATION` with canonical Indicator identity. Provider-specific port, threat type, malware family, confidence, tags, timestamps, and metadata remain in the immutable source observation snapshot and provider assertions. The canonical signal facts contain only provider-independent Indicator identity so another provider can support the same IOC without overwriting canonical facts with provider-specific context.

ThreatFox provider confidence is not promoted to CİTEM signal/analyst confidence. The IOC Inbox remains unchanged.

### MalwareBazaar metadata only
Official fixed endpoint:

`https://mb-api.abuse.ch/api/v1/`

The source uses only the documented read-only `get_recent` metadata query with selector `100`. `MALWAREBAZAAR_AUTH_KEY` is a required server-only environment variable and is sent only in the `Auth-Key` header. The request body is a fixed bounded `application/x-www-form-urlencoded` body containing only `query=get_recent&selector=100`. Redirects are disabled, timeout is 15 seconds, JSON content type is required, and the response is capped at 8 MiB.

The adapter has no `get_file`, sample-download, archive-download, execution, unpacking, sandboxing, or YARA-on-downloaded-sample path. It maps bounded recent metadata to `MALWARE_ACTIVITY` using source-defined `report:malwarebazaar:<sha256>` identity, hash Indicator assertions, and source-backed malware-family/tag assertions. Malware family/signature strings remain provider assertions; Phase 2.3D owns alias reconciliation.

The cursor stores only the latest provider `first_seen` timestamp. The boundary row is replayed (`>=` watermark) so same-timestamp records are not missed; Phase 2.3B observation idempotency makes that replay safe.

## Fixed advisory-feed parser foundation
Strict RSS, Atom, and JSON Feed parsers exist for future code-owned feeds. XML DTDs and entities are rejected; user URLs, HTML scraping, redirect following, and mutable-title identity are forbidden. Stable GUID/item ID or a fixed-source item URL is required. Exact CVE patterns may create `SYSTEM_EXTRACTED` CVE assertions only.

No new live arbitrary or vendor advisory feed is registered by the completion work. Existing user-configured OSINT RSS/Atom/JSON Feed ingestion remains a separate hardened subsystem and is not automatically promoted into TechINT.

## Deferred source blockers
### URLhaus
The current official Community API documentation requires an Auth-Key and exposes authenticated dataset exports with the credential embedded in the export URL. CİTEM will not put a secret in a source URL, cursor, audit record, provenance URL, or browser-visible value. The separate detailed read-only bulk-query contract was not sufficiently verifiable without account context during this delivery. URLhaus therefore remains unregistered rather than weakening credential handling or inventing an endpoint.

### MITRE ATT&CK STIX/TAXII
Official ATT&CK STIX 2.1 and TAXII 2.1 availability is verified. The full ATT&CK bundle is intentionally not downloaded by simply raising the global response-size boundary. A safe initial-baseline plus incremental TAXII contract must define bounded pagination, collection identity, replay/watermark semantics, and initial object coverage without exceeding the 2,500-signal run ceiling. Until that contract is implemented and tested, `MITRE_ATTACK` is not added to the Technical Source enum/registry.

### Vendor advisory feeds
No HTML scraping or guessed vendor endpoint is accepted. A vendor feed is eligible only if it is official, machine-readable, fixed-host/path, bounded, and has stable record identity.

## Existing CİTEM CVE records
Analyst-owned CİTEM `cves` rows are not converted back into external-source-like Technical Signals. The trust flow remains one-directional: external Technical Signal → CVE assertion. Phase 2.3E may match those assertions against owned CVE analytical entities.

## Transport restrictions
- HTTPS only and adapter-owned host/path allowlists
- generic Technical Source transport remains fixed GET JSON; it is not turned into an arbitrary HTTP client
- narrowly scoped MalwareBazaar POST transport permits only one hard-coded host/path/query and sends the Auth-Key only as a header
- redirects disabled
- generic transport timeout 15 seconds; fixed NVD adapter explicitly uses a bounded 30-second timeout because of observed official API latency
- bounded content length and decoded body
- JSON content-type validation
- conditional ETag/Last-Modified support only in source cursors
- no arbitrary hostname, path, method, body field, query secret, proxy, DNS target, WHOIS, socket, HTML scrape, or browser-configured endpoint
- no raw body or secret logging

## Scheduler and manual synchronization
The existing `CRON_SECRET` scheduler boundary is reused. `TECHINT_SCHEDULER_ENABLED=true` activates TechINT due claims. `TECHINT_SYNC_BATCH_SIZE` defaults to 5 and is capped at 10; `TECHINT_SYNC_CONCURRENCY` defaults to 2 and is capped at 4. Due claims exclude paused, archived, future, synthetic, and actively leased connections. Failures receive bounded exponential backoff; success resets failure count.

Manual **Sync now** submits only an owned connection UUID. The server resolves owner, source, settings, cursor, endpoint, credential (when required), and lease. A 30-second cooldown and active-run uniqueness prevent accidental duplicate runs.

## UI
`/techint/sources` is a secondary collection-operations route reachable from Global View. The locked primary TechINT navigation remains exactly Global View, Profiles, and InvestINT. The page shows fixed source metadata, source family, credential requirement (never value), status, interval, next/last run, failure count, safe run counters, lifecycle actions, metadata-driven settings, manual synchronization, recent run history, and append-only source audit history. It never renders raw cursor JSON, lease material, API keys, raw source responses, or fake Global View intelligence.

## Bounds and controlled failures
Mapped signals are capped at 2,500 per run and run issues at 100. Controlled codes include source lifecycle/cooldown, invalid settings/cursor, lease mismatch/expiry, timeout/status/content/body/rate-limit failures, invalid responses, page/item/signal limits, signal recording failure, and generic collection failure. Raw database, network, stack, credential, or body details are not returned. `SIGNAL_RECORDING_FAILED` may retain only the bounded source record key for operator diagnosis.

## Explicit exclusions
No OTX merge, URLhaus implementation, ATT&CK ingestion, arbitrary feed URL, taxonomy reconciliation, alias/entity resolution, profile matching, relevance/global-priority scoring, Global View population, alert/discovery workflow, Investigation mutation, analytical entity creation, Evidence, Note, Timeline Event, Graph edge, report, malware sample download/execution, or AI call is included.

## Validation and acceptance status
Historical PR #35 acceptance is preserved: CISA KEV demonstrated successful initial/no-change collection; NVD live testing drove bounded page/rate-limit/timeout repairs; synthetic live acceptance exposed and drove migration 034.

The Phase 2.3C completion adds focused unit tests for FIRST EPSS semantics, ThreatFox canonical IOC mapping/port/provenance, MalwareBazaar fixed POST/Auth-Key isolation and metadata-only mapping, registry bounds, and new source settings. It adds a PostgreSQL 16 source-pack harness that applies migrations in sorted order and checks migration 036 enum/settings/cursor contracts, success/failure cursor semantics, authenticated mutation denial, owner isolation, and sensitive lease-column denial. The existing Phase 2.3C harness continues to apply all migrations, so migration 036 is also exercised by the historical collection harness.

No migration 036 application to live/Preview Supabase is claimed by this document. No live FIRST EPSS, ThreatFox TechINT, or MalwareBazaar collection is claimed until the operator explicitly authorizes and performs it.

### Operator acceptance checklist for the completion
1. Review and merge only after CI and code review are green.
2. Apply migration 036 to the intended test/Preview Supabase only with explicit operator authorization.
3. Reload PostgREST schema cache.
4. Redeploy Preview.
5. FIRST EPSS: enable with a bounded threshold, run manual sync, verify provider score/percentile remain source facts with null signal confidence and `UNKNOWN` severity; repeat and verify conditional/idempotent behavior.
6. ThreatFox: confirm the IOC Inbox ThreatFox connection already has an encrypted credential; enable the TechINT bridge; run sync; verify no second credential is created and IOC Inbox triage/acceptance rows are unchanged.
7. MalwareBazaar: configure `MALWAREBAZAAR_AUTH_KEY` server-side; enable source; run sync; verify only metadata/hashes are recorded and no sample/file download occurs.
8. For all three sources, verify a failed run does not advance the authoritative cursor.
9. Verify second-user source/run/signal isolation.
10. Confirm no Indicators, Evidence, analytical Sources, Investigation state, Timeline Events, Campaigns, Threat Actors, Infrastructure Clusters, attribution rows, or Graph relationships are created as side effects.
11. Pause the new sources after acceptance if continuous scheduling is not intended.

Rollback is application rollback plus pausing sources. Collection history and source-backed signals are preserved; migrations 033/034/036 are additive and are not destructively rolled back in a live database.
