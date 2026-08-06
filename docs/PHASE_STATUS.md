
## Phase 2.3A — TechINT Shell and Intel Profile Foundation

- [x] TechINT top-level navigation shell added with Global View, Profiles, and InvestINT.
- [x] Additive migration 031 authored for owner-scoped Intel Profiles, profile items, audit events, RLS, constraints, and append-only audit access.
- [x] Standalone and Investigation-linked profile UI/actions added with explicit separation.
- [x] Investigation Intel Profile workspace route added with deterministic local refresh from existing Investigation CTI records.
- [ ] Technical signal collection, provider ingestion, matching, prioritization, alerts, Global View intelligence, and AI briefs remain intentionally out of scope for later phases.
- [x] PR #32 repair tightened TechINT mutations behind service-role trusted RPCs, made audit writes transactional, preserved excluded/removed item identities across refresh, and replaced the static migration check with a PostgreSQL execution harness.
- [x] Final PR #32 hardening enforces strict TechINT profile status transitions and database-authoritative Indicator validation/normalization with URL path/query case preservation.
- [x] Compatibility repair skips unsupported `FILE`/`REGISTRY` and malformed legacy Investigation Indicators during TechINT seeding without aborting profile creation or refresh.

## Phase 2.3B — Canonical Technical Signal Backbone

- [x] Provider-independent canonical signal schema authored in additive migration 032.
- [x] Immutable, idempotent source observations and current/supporting/stale/conflicting classification implemented.
- [x] Immutable canonical revisions and deterministic change-history foundation implemented.
- [x] Source-backed entity assertion foundation implemented without canonical entity resolution.
- [x] Service-role-only transactional trusted recording RPC and narrow server-only client implemented.
- [ ] Source adapters/collection, Global View population, profile matching, priority scoring, alerts, AI briefs, and discovery remain later-phase work.
- [ ] Migration 032 live application and operator-authorized acceptance remain pending.

## Phase 2.3C — Technical Source Pack and Collection Operations

- [x] Provider-independent fixed Technical Source registry implemented.
- [x] Owner-scoped source connections, exact collection runs, hash-bound leases, bounded issues, and append-only source audit history added in migration 033.
- [x] Provider-bound versioned cursors advance only after exact successful completion; failed windows replay safely through Phase 2.3B idempotency.
- [x] Manual synchronization and bounded CRON scheduler integration implemented without a second scheduler secret.
- [x] Environment-gated deterministic TEST / SYNTHETIC source implemented through the production recording path.
- [x] Fixed CISA KEV adapter maps official catalog entries to ACTIVE_EXPLOITATION signals.
- [x] Fixed NVD CVE API 2.0 adapter maps bounded last-modified windows to VULNERABILITY_CHANGE signals.
- [x] Strict RSS, Atom, and JSON Feed parser foundation implemented for future code-owned advisory sources; no unverified CISA advisory endpoint is registered.
- [x] Secondary `/techint/sources` operations UI and recent run history added without changing the three-item TechINT primary navigation.
- [ ] Phase 2.3D taxonomy/alias/entity normalization, ATT&CK taxonomy ingestion, and canonical entity resolution remain pending.
- [ ] EPSS prioritization, profile matching, relevance/global-priority scoring, Global View population, alerts, discovery, and AI briefs remain pending.
- [ ] Migration 033 live application and operator-authorized Preview acceptance remain pending.
