# Phase 2.3B — Canonical Technical Signal Backbone

A **Technical Signal** is an owner-scoped, normalized, source-backed technical development. It is not Evidence, an Investigation Indicator, an assessment, attribution, match, alert, priority decision, or intelligence report.

## Identity, history, and ordering

`technical_signals` is the current provider-independent projection, uniquely identified by `(owner, signal type, canonical key)`. Canonical keys are type-aware: `cve:CVE-YYYY-NNNN…`, `indicator:<IP|CIDR|DOMAIN|URL|HASH|EMAIL>:<canonical-value>`, `attack:TNNNN[.NNN]`, `report:<source>:<record>`, or `advisory:<source>:<record>`. Source-defined components must match the observation source, malformed supplied keys are rejected, and URL path/query case is preserved.

An immutable **Observation** records one bounded normalized source snapshot and provenance. Its version-1 identity vector contains owner, signal type, canonical key, source family, lowercased/trimmed source system, record key, nullable revision key, and source fingerprint. Database uniqueness is `(owner_id, signal_id, observation_key)`, so one source record can produce distinct signals. A transaction advisory lock plus conflict-safe inserts serializes first creation, exact retries, supporting inputs, and revision allocation.

The two transport fields `signal.effectiveAt` and `observation.effectiveAt` must be byte-for-byte equal. PostgreSQL parses that value once. `technical_signals.effective_at` is the newest authoritative effective-time **watermark supporting the current canonical content**; `technical_signal_revisions.effective_at` remains the time that revision's content was first established. A newer `SUPPORTING` observation advances only the signal watermark and seen-at bounds—it creates no revision, changes no canonical content, and does not change the revision number. Consequently, content supported at 12:00 cannot be replaced by changed input effective at 11:00, even if that input is received later. `received_at` is ingestion provenance only and never controls canonical ordering. Exact retries return the existing row. Older effective time is `STALE`, equal-time changed content is `CONFLICTING`, equal content at or after the watermark is `SUPPORTING`, and newer changed content is `CURRENT`.

An immutable **Revision** stores each current canonical snapshot. Its version-1 fingerprint vector contains lifecycle, trimmed title, summary, severity, nullable confidence, facts, nullable UTC-millisecond publication time, nullable UTC-millisecond observation time, and nullable superseding signal ID. Receipt and source metadata are excluded. Newer `RETRACTED` input records retraction and later `ACTIVE` records `REACTIVATED`; supersession is explicit and never inferred.

PostgreSQL is the sole authority for persisted canonical fingerprints, source fingerprints, and observation identities. It calculates them inside the trusted RPC; callers cannot submit or override them. Database tests cover object-key order independence, array order, nulls, Unicode, finite decimals, normalized source systems, canonical timestamps, and provenance exclusions. TypeScript deliberately does not reproduce or claim parity with the database identity algorithm—it validates transport data only.

## Assertions, integrity, and trust

Entity assertions are tied to their exact source observation with composite `(owner, signal, observation)` foreign keys. Optional source-entity type and ID are paired non-authoritative provenance snapshots, not entity resolution. Only `PROVIDER_ASSERTED` and `SYSTEM_EXTRACTED` are accepted. Indicators use existing CİTEM validation; CVE and ATT&CK values use conservative canonical forms. Any invalid assertion rolls back the complete recording statement.

Authenticated users receive owner-scoped RLS `SELECT` only. Direct authenticated mutations and RPC execution are denied; anon has no access. The server-only `record_technical_signal` security-definer RPC is executable only by `service_role`, uses a fixed search path, and returns a controlled result that is validated by Zod. Append-only triggers reject privileged update/delete on observations, revisions, and assertions.

Facts and source snapshots accept only recursively valid JSON-compatible plain values: null, booleans, finite numbers, strings, arrays, and plain objects. Undefined values, bigint, symbols, functions, non-finite numbers, dates, maps, sets, buffers, typed arrays, class instances, accessors, and circular values are rejected with controlled schema failures. JSON objects remain bounded to 64 KiB; assertions are capped at 100, and identifiers/strings/URLs are bounded. Only credential-free HTTP(S) provenance URLs are accepted without network access. Raw bodies, credentials, prompts, binary samples, and uploaded contents are forbidden.

## Explicit exclusions

No provider adapter, source collection, network call, scheduler, Global View population, profile/InvestINT matching, discovery, scoring, alert, Investigation mutation, canonical entity resolution, or AI brief is implemented. Phase 2.3C adapters must call the narrow trusted RPC and must never submit authoritative fingerprints. Later phases own taxonomy, matching, analysis, and presentation.

Migration 032 has not been applied live. Live acceptance requires explicit operator authorization and synthetic records only.
