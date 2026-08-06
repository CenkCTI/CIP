# Phase 2.3B — Canonical Technical Signal Backbone

A **Technical Signal** is an owner-scoped, normalized, source-backed technical development. It is not Evidence, an Investigation Indicator, an assessment, attribution, match, alert, priority decision, or intelligence report.

## Identity, history, and ordering

`technical_signals` is the current provider-independent projection, uniquely identified by `(owner, signal type, canonical key)`. Canonical keys are type-aware: `cve:CVE-YYYY-NNNN…`, `indicator:<IP|CIDR|DOMAIN|URL|HASH|EMAIL>:<canonical-value>`, `attack:TNNNN[.NNN]`, `report:<source>:<record>`, or `advisory:<source>:<record>`. Source-defined components must match the observation source, malformed supplied keys are rejected, and URL path/query case is preserved.

An immutable **Observation** records one bounded normalized source snapshot and provenance. Its version-1 identity vector contains owner, signal type, canonical key, source family, lowercased/trimmed source system, record key, nullable revision key, and source fingerprint. Database uniqueness is `(owner_id, signal_id, observation_key)`, so one source record can produce distinct signals. A transaction advisory lock plus conflict-safe inserts serializes first creation, exact retries, supporting inputs, and revision allocation.

The two transport fields `signal.effectiveAt` and `observation.effectiveAt` must be byte-for-byte equal. PostgreSQL parses that value once and uses it for observation, projection, revision, and disposition ordering; `receivedAt` is ingestion provenance only. Exact retries return the existing row. Equal canonical content is `SUPPORTING`, older effective time is `STALE`, equal-time changed content is `CONFLICTING`, and newer changed content is `CURRENT`.

An immutable **Revision** stores each current canonical snapshot. Its version-1 fingerprint vector contains lifecycle, trimmed title, summary, severity, nullable confidence, facts, nullable UTC-millisecond publication time, nullable UTC-millisecond observation time, and nullable superseding signal ID. Receipt and source metadata are excluded. Newer `RETRACTED` input records retraction and later `ACTIVE` records `REACTIVATED`; supersession is explicit and never inferred.

TypeScript and PostgreSQL use the same canonical JSON contract: lexicographically sorted object keys, preserved array order, JSON null, UTF-8 input, SHA-256, and lowercase hexadecimal output. Fixed fixtures cover parity, reordered objects, nulls, Unicode, and source normalization.

## Assertions, integrity, and trust

Entity assertions are tied to their exact source observation with composite `(owner, signal, observation)` foreign keys. Optional source-entity type and ID are paired non-authoritative provenance snapshots, not entity resolution. Only `PROVIDER_ASSERTED` and `SYSTEM_EXTRACTED` are accepted. Indicators use existing CİTEM validation; CVE and ATT&CK values use conservative canonical forms. Any invalid assertion rolls back the complete recording statement.

Authenticated users receive owner-scoped RLS `SELECT` only. Direct authenticated mutations and RPC execution are denied; anon has no access. The server-only `record_technical_signal` security-definer RPC is executable only by `service_role`, uses a fixed search path, and returns a controlled result that is validated by Zod. Append-only triggers reject privileged update/delete on observations, revisions, and assertions.

Facts and source snapshots are JSON objects bounded to 64 KiB, assertions are capped at 100, and identifiers/strings/URLs are bounded. Only credential-free HTTP(S) provenance URLs are accepted without network access. Raw bodies, credentials, prompts, binary samples, and uploaded contents are forbidden.

## Explicit exclusions

No provider adapter, source collection, network call, scheduler, Global View population, profile/InvestINT matching, discovery, scoring, alert, Investigation mutation, canonical entity resolution, or AI brief is implemented. Phase 2.3C owns adapters and later phases own taxonomy, matching, analysis, and presentation.

Migration 032 has not been applied live. Live acceptance requires explicit operator authorization and synthetic records only.
