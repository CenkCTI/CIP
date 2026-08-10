# Phase 2.3E — Matching, Global Priority and Relevance Engine

## Purpose

Phase 2.3E turns continuously collected Technical Signals into two separate derived intelligence projections:

1. **Global Priority** — what is technically important in the current cyber threat landscape, independent of any Intel Profile.
2. **Profile Relevance** — which ACTIVE standalone or Investigation Intel Profiles a Technical Signal relates to, and why.

Global Priority is **not organizational/business risk**. CİTEM does not claim asset exposure or business impact without an actual asset/exposure model.

## Core product invariant

> No useful Technical Signal may be hidden solely because entity normalization is incomplete.

Entity Resolution is an enrichment and identity-quality layer. It is not a visibility gate. Source-backed exact matches may therefore appear as `PROVISIONAL` while unresolved entity assertions remain in the normalization queue. A later canonical resolution re-evaluates the same signal/profile projection and may upgrade it to `CONFIRMED` without creating a duplicate match.

## Data model

Migration `202608100041_phase2_3e_matching_priority_relevance.sql` adds three owner-scoped derived tables:

- `technical_signal_global_priorities` — one current Global Priority projection per Technical Signal.
- `technical_signal_profile_matches` — one current signal/profile match projection per signal/profile pair.
- `technical_signal_profile_match_events` — append-only lifecycle and re-evaluation history.

Migration `202608100042_phase2_3e_resolution_recheck_visibility.sql` hardens the transaction-visibility contract for resolution-triggered re-evaluation. The profile-match snapshot evaluator is intentionally `VOLATILE` so an AFTER resolution trigger can see the `NEEDS_REVIEW → RESOLVED` state written by the statement that fired it. This is required for automatic `PROVISIONAL → CONFIRMED` upgrades.

The projection tables use composite owner foreign keys, deterministic uniqueness, bounded arrays/JSON, RLS, authenticated owner-scoped read access, and service-role-only trusted mutation RPCs.

Immutable Technical Signal observations, revisions and entity assertions are not rewritten by Phase 2.3E.

## Global Priority

Levels:

- `CRITICAL`
- `HIGH`
- `MEDIUM`
- `LOW`
- `INFO`

The v1 engine is deterministic and explainable. Inputs may include source-backed facts such as:

- CISA KEV presence
- confirmed active exploitation
- EPSS and percentile
- technical severity
- freshness
- multi-source support
- vendor advisory context
- material revision state
- source-backed confidence where present
- non-active lifecycle state

Source severity is only one factor. A provider saying `CRITICAL` does not automatically produce Global Priority `CRITICAL`.

Each projection stores an internal bounded score, machine-readable reason codes, source-system summary, context snapshot, evaluation time, and `engine_version = 2.3E-v1`. The UI presents categorical priority and reasons rather than an opaque score.

## Profile Matching

Match quality is distinct from intelligence confidence:

- `CONFIRMED` — canonical/deterministic identity or authoritative entity context matches active profile scope.
- `PROVISIONAL` — direct source-backed identity matches active profile scope while canonical identity remains unresolved.
- `CONTEXTUAL` — bounded contextual evidence such as sector, country/region, tag or keyword matches.

Relevance is categorical:

- `HIGH`
- `MEDIUM`
- `LOW`

The matching engine remains deterministic. AI does not assign relevance.

### Direct evidence

Where the existing schema supports it, direct matching covers CVEs, Indicators, ATT&CK techniques, Threat Actors, Malware, Campaigns, Vendors, Products and Infrastructure identities.

Canonical resolution has stronger match quality than an unresolved exact source assertion.

### Contextual evidence

The v1 bounded contextual layer covers exact Sector, Country, Region and Tag assertions plus explicit profile Keywords. Country/Region matching preserves profile semantic-role distinctions so target geography is not silently confused with infrastructure location.

The migration also contains a conservative compound-product bridge for source shapes such as CISA KEV `VENDOR=Splunk`, `PRODUCT=Enterprise` when the Technical Signal title explicitly identifies `Splunk Enterprise`. This keeps useful intelligence visible before Product normalization is complete without teaching a global alias.

Investigation-derived direct items preserve an explicit `INVESTIGATION_SCOPE` reason. Arbitrary one-hop expansion across analytical project graph relationships is not claimed in v1 because the current owner-global canonical TechINT layer does not yet provide a trustworthy generic canonical-to-project relationship bridge. Deep or multi-hop graph inference remains out of scope.

## Match lifecycle

A current match may be:

- `NEW`
- `REVIEWED`
- `ACCEPTED`
- `DISMISSED`
- `NOT_RELEVANT`
- `SNOOZED`

`ACCEPTED` means the analyst accepts relevance to the profile; it does not verify every source claim.

`NOT_RELEVANT` preserves explicit analyst feedback that the match was not useful/correct.

`SNOOZED` is temporary and stores `snoozed_until` plus the lifecycle state to restore. Match events are append-only.

## Automatic evaluation and re-evaluation

The source collection pipeline now performs:

`successful collection → Technical Signal persistence → deterministic/confirmed-alias reconciliation → Global Priority evaluation → Profile matching`

Collection success remains authoritative. Derived post-processing failures do not retroactively fail a completed source run.

Affected signal IDs are evaluated in bounded batches of 250. CVE-linked sibling signals are expanded inside the trusted database evaluation so NVD, CISA KEV and FIRST EPSS context can contribute to the same technical priority picture without collapsing provider-specific Technical Signal identities.

Successful Intel Profile definition/item/status trusted workflows attach a best-effort Phase 2.3E profile projection after the authoritative profile mutation. The original Phase 2.3A action boundary remains free of provider/network/AI/matching logic. Entity-resolution inserts/updates also trigger bounded signal-profile re-evaluation inside PostgreSQL, allowing `PROVISIONAL → CONFIRMED` upgrades without analyst feed maintenance.

## UI

### Global View

`/techint` now displays the ranked Global Technical Agenda with:

- Global Priority
- Technical Signal title/type/lifecycle
- first/last seen timestamps
- source-system support
- explainable priority reasons
- engine version

The UI explicitly states that this is technical priority, not organizational/business risk.

### Intel Profile feed

Standalone and Investigation Intel Profile details now include a live matched-signal feed showing:

- Global Priority
- Profile Relevance
- Match Quality
- match lifecycle
- matching reasons
- separate Global Priority reasons
- unresolved identity count/details where safely bounded
- analyst lifecycle actions

The feed uses bounded server-side pagination. Rendering a bounded page does not impose a hidden global queue/feed ceiling.

## AI boundary

**AI does not assign Global Priority or Profile Relevance in Phase 2.3E.**

The core engine works with no BYOK provider configured. Phase 2.3D AI identity-resolution provenance may improve later canonical match quality, but it is not a relevance or priority judgement.

## Required acceptance scenario

The merge-blocking scenario is:

1. CISA records a Technical Signal for a Splunk Enterprise vulnerability.
2. Assertions include `VENDOR=Splunk`, `PRODUCT=Enterprise`, and a CVE.
3. Product normalization remains `NEEDS_REVIEW`.
4. An ACTIVE Intel Profile watches Splunk and/or Splunk Enterprise.
5. Without analyst Entity Resolution work, the signal appears in the profile as a deterministic relevance projection with `PROVISIONAL` match quality.
6. Global Priority is evaluated separately.
7. Later the Product assertion is resolved to canonical `Splunk Enterprise`.
8. The existing signal/profile row is re-evaluated and becomes `CONFIRMED` where the profile scope justifies it.
9. No duplicate profile match is created.
10. Immutable source assertion values remain unchanged.

This flow is covered by the Phase 2.3E PostgreSQL harness.

## Explicit exclusions

Phase 2.3E does not implement:

- organizational asset/business risk
- AI relevance scoring
- AI Global Priority scoring
- autonomous analyst judgement
- attribution changes
- strategic analysis
- arbitrary project-graph one-hop expansion without a canonical relationship bridge
- deep graph inference
- automated Investigation creation
- automatic alias teaching
- Phase 2.3D extraction redesign
- arbitrary source ingestion redesign
- a second scheduler
- SOC alert/case-management replacement

## Deployment

Migrations 037–040 are Phase 2.3D history and must not be edited or re-run as part of this phase.

After the existing migration chain is present, apply the new Phase 2.3E migrations **041 → 042 once, in order**, then reload the PostgREST schema cache and redeploy the application.

Existing historical Technical Signals receive projections when they are touched by subsequent source collection/re-evaluation. For Preview acceptance, re-sync the relevant bounded Technical Sources after applying migrations 041 and 042, then verify the Global View and Intel Profile feeds.
