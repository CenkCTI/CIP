# Phase 2.3B — Canonical Technical Signal Backbone

Phase 2.3B adds a provider-independent Technical Signal backbone only. A Technical Signal is a normalized, source-backed technical development such as a CVE change, advisory, IOC observation, malware/campaign/infrastructure activity change, ATT&CK content update, provider alert, or technical report.

## Model boundaries

A Technical Signal is not an Investigation Indicator, Evidence, analyst assessment, attribution judgement, profile match, alert, priority decision, or intelligence report. Phase 2.3B records normalized state and provenance for later TechINT phases; it does not collect external sources, populate Global View, match profiles, score priority, alert, discover, or generate AI briefs.

## Signal, Observation, Revision

- `technical_signals` is the current canonical projection per owner, signal type, and deterministic canonical key.
- `technical_signal_observations` is immutable source provenance: source family/system, record/revision identity, source timestamps, bounded normalized snapshot, source URL, deterministic observation key, and disposition.
- `technical_signal_revisions` is immutable canonical-state history. Revisions are created only when canonical content changes at a newer effective time or during retraction/reactivation/supersession.
- `technical_signal_entity_assertions` stores source-backed context extracted from one observation. It is not final entity resolution and does not create CİTEM Indicators, CVEs, Threat Actors, Malware, Campaigns, Infrastructure, ATT&CK records, Evidence, Notes, or Timeline Events.

## Canonical identity and keys

TypeScript helpers under `src/lib/techint/signals/` create deterministic keys such as `cve:CVE-2026-1234`, `indicator:IP:198.51.100.10`, `attack:T1059`, `report:<source-system>:<source-record-key>`, and `advisory:<vendor-or-source>:<source-record-key>`. Keys exclude mutable titles and summaries, do not use random UUIDs as external identity, preserve URL path/query case, and avoid alias resolution reserved for Phase 2.3D. Database uniqueness remains authoritative.

## Idempotency and dispositions

The trusted workflow computes deterministic source fingerprints and owner-scoped observation keys. Exact retries return the existing observation with `duplicate_observation = true` and create no duplicate observation, revision, or entity assertions.

New observations are classified deterministically:

- `CURRENT`: first valid observation or newer changed canonical content.
- `SUPPORTING`: a different source observation supports the same current canonical snapshot.
- `STALE`: an older effective observation is stored but cannot move current state or timestamps backwards.
- `CONFLICTING`: equal effective timestamp with different canonical content is preserved without nondeterministic overwrite.

## Revision and change detection

Canonical snapshot fingerprints are stable SHA-256 hashes over bounded canonical content. Provenance timestamps alone do not create false revisions. Revision numbers are monotonic per signal, immutable, and survive archival. Retractions create `RETRACTED` revisions. A newer `ACTIVE` state after retraction creates `REACTIVATED` while preserving retraction history. Supersession integrity is represented in schema; no merge or deduplication UI is implemented.

## Entity assertions

Entity assertions preserve owner, signal, source observation, entity kind, display value, conservative normalized value, semantic role, assertion basis, optional confidence, indicator subtype, and optional existing entity snapshots. Phase 2.3B recording accepts only `PROVIDER_ASSERTED` and `SYSTEM_EXTRACTED`; `AI_SUGGESTED` and `ANALYST_CONFIRMED` are reserved. Conservative normalization covers CVE IDs, ATT&CK IDs, existing indicator rules, whitespace, and safe case normalization.

## Trusted recording workflow

`record_technical_signal` is a service-role-only RPC. The server-only trusted client imports `server-only`, validates with strict Zod schemas, and exposes only `recordTechnicalSignal`. The database revalidates owner, enums, strings, confidence, timestamps, JSON bounds, source identity, source URL syntax without network access, fingerprinting, observation disposition, revision creation, projection updates, and entity assertions transactionally.

## Ownership, RLS, ACL, and immutability

All new records are owner-scoped. Authenticated users have owner-scoped `SELECT` only. Authenticated clients cannot directly insert, update, delete, or execute the trusted RPC. Append-only observation, revision, and entity assertion tables reject update/delete with database triggers even for direct mutation attempts outside the trusted workflow. Composite owner foreign keys prevent cross-owner references.

## JSON and payload bounds

Canonical facts and source snapshots are capped at approximately 64 KB. Entity assertion arrays are capped at 50 items and strings are bounded. The workflow rejects credential-bearing source URLs and does not fetch URLs or validate hosts. It must not persist raw provider bodies, authentication headers, API keys, cookies, tokens, prompts, unbounded HTML, binary data, malware samples, or uploaded file contents.

## Explicit exclusions and later phases

Phase 2.3B intentionally excludes ThreatFox/RSS/KEV/EPSS/NVD/vendor/URLhaus/MalwareBazaar/ATT&CK/OTX mapping, external collection, cron/scheduling, Global View population, profile matching, InvestINT matching, relevance scoring, priority scoring, alerts, discovery, AI calls, daily briefs, and automatic Investigation records. Live acceptance requires an authorized operator to apply migration 032 and run synthetic records only.
