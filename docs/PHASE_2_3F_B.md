# Phase 2.3F-B — Historical Activity & Coverage Backbone

## Purpose

Phase 2.3F-B turns the canonical Technical Signal stream and collection-run history into deterministic, query-efficient time-series data for Global Technical Situation Awareness.

Phase 2.3F-A answered: **Can CİTEM collect continuously without an open browser or one long serverless invocation?**

Phase 2.3F-B answers: **What did CİTEM observe over time, and did it actually have collection coverage during that period?**

The central invariant is:

> Zero observed activity and no collection coverage are different states and must never be collapsed into the same value.

This phase is historical measurement infrastructure. It does not decide whether the technical environment is normal or abnormal.

## Data-flow boundary

`Technical Signal observations + collection runs + source schedule history → deterministic rollups → activity / coverage time series`

The rollup layer is derived telemetry. It is not a second intelligence feed and it is not part of the canonical Technical Signal identity model.

Global View, Profiles and InvestINT continue to consume one canonical Technical Signal stream.

## Migration

Migration:

`202608100047_phase2_3f_b_historical_activity_coverage.sql`

Migrations 045 and 046 are already applied and immutable. Do not rewrite or rerun them.

## Activity model

`technical_activity_buckets` stores non-zero aggregate activity by:

- owner;
- granularity;
- time axis;
- UTC bucket;
- source system;
- Technical Signal type.

Metrics:

- observation count;
- distinct Technical Signal count;
- CURRENT observations;
- SUPPORTING observations;
- STALE observations;
- CONFLICTING observations.

Synthetic/manual-test observations are excluded from production historical activity.

### Two time axes

The backbone intentionally keeps two clocks separate.

`INGESTION_TIME` uses `technical_signal_observations.received_at` and answers:

> When did CİTEM receive this observation?

`SOURCE_EFFECTIVE_TIME` uses `technical_signal_observations.effective_at` and answers:

> What time does the source observation represent?

An observation received today may describe source activity from yesterday. Both timelines are preserved.

## Granularity and retention

Three UTC granularities are materialized:

- `FIVE_MINUTES` — near-real-time operational detail;
- `HOUR` — primary 24H / 7D / 30D analytical resolution;
- `DAY` — long-term history.

Retention:

- five-minute buckets: 14 days;
- hourly buckets: 1 year;
- daily buckets: retained long-term.

Retention removes derived buckets only. Raw canonical provenance is not deleted by Phase 2.3F-B.

## Coverage model

`technical_collection_coverage_buckets` records source collection health per UTC bucket.

Metrics include:

- configured source status;
- whether exact schedule history is known;
- expected runs;
- attempted runs;
- successful runs;
- failed runs;
- still-running runs;
- records seen / mapped;
- latest success / failure;
- latest controlled error code;
- deterministic coverage status.

Coverage status is one of:

- `COMPLETE`;
- `PARTIAL`;
- `DEGRADED`;
- `NO_COVERAGE`.

### Coverage semantics

`COMPLETE` means collection behaved as configured for the bucket. It does not mean a source observed every real-world event.

`NO_COVERAGE` is emitted only when schedule history is known, a collection was expected, and no attempt occurred.

`DEGRADED` represents failed collection work.

`PARTIAL` represents incomplete/running collection or historically reconstructed periods where exact expected cadence cannot be asserted.

An intentionally paused source is not treated as a collection failure.

## Source schedule history

Current connection state is insufficient for historical coverage because cadence and status can change over time.

`technical_source_schedule_snapshots` therefore records immutable snapshots whenever these connection fields change:

- status;
- interval;
- next scheduled run.

Existing source connections receive a single `reconstructed=true` seed snapshot when migration 047 is applied. This does not pretend that exact historical schedule state existed before the migration.

Future schedule snapshots are exact and append-only.

## Deterministic recomputation

Raw observation inserts do not increment counters through write-coupled triggers.

Instead, trusted rollup RPCs recompute bounded UTC windows from authoritative source data:

- `refresh_technical_activity_buckets`;
- `refresh_technical_collection_coverage_buckets`.

The same authoritative input set produces the same aggregate result. Re-running the same window must not multiply counts.

Derived buckets are mutable/recomputable because late observations and backfill can legitimately repair historical windows.

Raw Technical Signal observations remain append-only.

## Late-arriving observations

A late observation can affect two different timelines.

Example:

- received at: Aug 10 21:00 UTC;
- source effective at: Aug 9 13:00 UTC.

The ingestion timeline changes on Aug 10. The source-effective timeline changes on Aug 9.

Recent maintenance continuously recomputes bounded lookback windows so late source data repairs the relevant historical bucket.

## Backfill

Historical activity is reconstructable from existing immutable Technical Signal observations.

Historical collection coverage is only partly reconstructable because exact schedule history before migration 047 may be unknown.

`technical_history_backfill_state` checkpoints bounded backfill progress separately for:

- activity / ingestion time;
- activity / source-effective time;
- coverage;
- each supported granularity.

`advance_technical_history_backfill` processes at most 96 buckets per call and never requires one unbounded migration or server invocation.

The desktop-driven maintenance loop advances one backfill stream per maintenance cycle until all streams reach the current closed bucket.

## Bounded maintenance runtime

The desktop collector remains the long-running control loop.

After a normal collection tick it may call:

`POST /api/techint/collector/maintenance`

The endpoint:

- authenticates the same owner-bound collector token;
- is rate-gated in the database to one maintenance cycle every five minutes;
- refreshes bounded recent 5-minute, hourly and daily windows;
- advances one bounded backfill stream;
- performs retention compaction at most once per day.

Maintenance failures are isolated from collection work. A failed historical refresh must not advance or corrupt a source collection cursor.

The desktop still never receives the Supabase service-role key or provider credentials.

## Diagnostic read model

Authenticated users may read their own derived history through RLS.

Diagnostic route:

`/techint/sources/history`

It shows:

- 24H received-observation volume;
- 24H source-effective observation volume;
- hourly coverage state;
- collection gaps and degraded buckets;
- bounded backfill progress;
- maintenance timestamps.

This is an operator/engineering diagnostic view, not the final Global View UI.

## Intelligence-language guardrails

Phase 2.3F-B stores observation and collection measurements only.

Examples:

- ThreatFox observation volume increased → valid collection/reporting statement;
- NVD publication/change volume increased → valid vulnerability-publication statement;
- CİTEM received more observations → valid ingestion statement.

The following inference is forbidden in this phase unless an upstream source explicitly supports it:

- “global attacks increased”;
- “attacker activity increased”;
- “country X launched more attacks.”

Phase 2.3F-C adds explicit source and observation semantics. Phase 2.3F-D adds baselines and deterministic anomaly detection.

## Security and ownership

All Phase 2.3F-B tables are owner-scoped under RLS.

Authenticated clients have read-only access to their own derived history.

Only service-role trusted RPCs may:

- refresh buckets;
- advance backfill;
- claim maintenance;
- compact history.

Source schedule snapshots are append-only.

No AI is used for rollup, backfill, coverage classification, retention or historical reconstruction.

## Validation

CI must run:

`bash scripts/test-phase2-3f-b-migration.sh`

The PostgreSQL harness verifies:

- UTC bucket boundaries;
- deterministic activity counts;
- CURRENT / SUPPORTING / STALE / CONFLICTING accounting;
- idempotent recomputation;
- late source-effective repair;
- expected-run coverage;
- degraded coverage after failed runs;
- intentional pause semantics;
- `NO_COVERAGE` for missed expected collection;
- bounded backfill state;
- append-only schedule snapshots;
- service-role-only maintenance RPCs;
- owner RLS isolation.

Vitest covers deterministic UTC bucket helpers and bounded windows.

## Preview acceptance

After CI is green:

1. Do not rerun migrations 045 or 046.
2. Apply migration 047 once to Preview/test Supabase.
3. Reload PostgREST schema cache if required.
4. Run the desktop collector against the PR Preview with the browser closed.
5. Wait for at least one history-maintenance cycle.
6. Open `/techint/sources/history` and verify hourly activity rows exist.
7. Verify both `INGESTION_TIME` and `SOURCE_EFFECTIVE_TIME` series exist.
8. Verify existing collection runs appear in coverage buckets.
9. Pause one source across a completed bucket and verify it is not classified as a collection failure.
10. Create/observe a controlled collection failure and verify a `DEGRADED` bucket.
11. Allow an expected scheduled run to be missed in a controlled test and verify `NO_COVERAGE`, not zero activity.
12. Re-run maintenance for the same closed window and verify aggregate counts do not multiply.
13. Verify backfill cursors advance in bounded units and eventually complete.
14. Verify five-minute/hour/day queries read derived buckets rather than scanning raw observations in the UI path.
15. Verify another owner cannot read the first owner's history.

## Out of scope

Phase 2.3F-B does not implement:

- source semantic taxonomy / observation basis (2.3F-C);
- baselines or anomaly scoring (2.3F-D);
- technical situation detectors (2.3F-E);
- cross-source convergence/divergence (2.3F-F);
- new source packs;
- geography / world map;
- final Global View UI;
- AI analysis;
- business-risk scoring.

## Acceptance invariant

> CİTEM must be able to answer “what did we observe over time?” without scanning raw observations, and it must never represent missing collection coverage as zero technical activity.
