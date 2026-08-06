# Phase 2.3B — Canonical Technical Signal Backbone

A **Technical Signal** is an owner-scoped, normalized and source-backed technical development. It is not Evidence, an Investigation Indicator, an assessment, attribution, match, alert, priority decision, or intelligence report.

## Architecture and semantics

`technical_signals` is the current provider-independent projection. Its stable identity is `(owner, signal type, canonical key)`. Canonical keys use authoritative immutable identifiers: normalized CVE IDs, validated Indicators, normalized ATT&CK technique IDs, or source-system plus source-record identity for reports/advisories. Mutable titles and summaries are excluded. URL scheme/authority normalization never lowercases path/query components, and no alias/entity-resolution claim is made.

Each immutable **Observation** records one bounded normalized source snapshot and its provenance. Owner-scoped SHA-256 identity includes source system, record key, optional revision key, and source fingerprint. Exact retries return the existing observation without assertions or revisions. A new equal snapshot is `SUPPORTING`; older effective input is `STALE`; equal-time changed content is `CONFLICTING`; newer changed content is `CURRENT`.

Each immutable **Revision** is a bounded canonical snapshot caused by a current observation. Its SHA-256 content fingerprint omits receipt/provenance timestamps, preventing false revisions. Creation is revision 1; newer content creates a monotonic revision. Newer `RETRACTED` input records retraction, and later `ACTIVE` input records `REACTIVATED`. Stale/conflicting/supporting records do not replace current state. Supersession integrity is modeled but never automatic.

**Entity assertions** preserve what a provider asserted or the system deterministically extracted from their exact observation. They retain kind, role, display and conservatively normalized values, confidence and optional source-entity snapshots. Only `PROVIDER_ASSERTED` and `SYSTEM_EXTRACTED` enter through this workflow. Reserved AI/analyst bases cannot. Assertions do not create or resolve CİTEM entities.

## Trust, ownership, and payload safety

Authenticated users receive owner-scoped RLS `SELECT` only. All direct authenticated mutations are denied. The narrow `record_technical_signal` security-definer RPC is executable only by `service_role`, revalidates all security-sensitive data, and transactionally creates the signal, observation, optional revision, and assertions. Any failure rolls the statement back. Append-only triggers reject observation, revision, and assertion updates/deletes even outside the workflow.

Canonical facts and source snapshots are JSON objects bounded to 64 KiB; assertions are capped at 100 and strings/identifiers/URLs are bounded. Only credential-free HTTP(S) provenance URLs are accepted without resolving or fetching them. Raw bodies, secrets, headers, cookies, prompts, binary samples, and uploaded contents are forbidden.

## Explicit exclusions and later phases

No provider adapter, source collection/ingestion, network call, scheduler, Global View population, profile/InvestINT matching, discovery, scoring, priority, alert, Investigation mutation, canonical entity resolution, or AI brief is implemented. Phase 2.3C owns adapters; Phase 2.3D owns taxonomy/aliases/entity normalization; later phases own matching, analysis and presentation.

## Operator-authorized live acceptance

Migration 032 was not applied live. An operator must authorize application and synthetic checks for creation, retry, support, change, stale/conflict, retraction/reactivation, two-user isolation and direct-mutation denial. Confirm that no Indicator, Evidence, Note, Investigation, match or alert is created and Global View still makes no collection claim.
