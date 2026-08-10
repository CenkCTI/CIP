# Phase 2.3F-B — Historical Activity & Coverage Backbone — Implementation Contract

Repository: `CenkCTI/CIP`

Branch: `feat/techint-2-3f-b-historical-activity`

Base: latest `main` after Phase 2.3F-A merge.

Open one Draft PR only. Do not merge it during implementation.

## Goal

Build the historical measurement layer required by Global Technical Situation Awareness without creating a second feed, adding AI interpretation, or confusing collection volume with real-world attack volume.

Target flow:

`canonical observations + collection runs + schedule snapshots → bounded deterministic rollups → historical activity + collection coverage`

## Non-negotiable invariants

1. `0 observations` and `NO_COVERAGE` are different states.
2. `received_at` and `effective_at` are separate time axes.
3. All bucket boundaries are UTC and deterministic.
4. Historical rollups are derived/recomputable; raw Technical Signal observations remain append-only.
5. Rollup recomputation is idempotent.
6. Late-arriving data may repair an old bucket.
7. Backfill is bounded and checkpointed; never scan/rebuild unlimited history in one request.
8. Existing exact schedule history must be captured going forward; pre-047 schedule coverage must not be overstated.
9. Intentional PAUSED periods are not collection failures.
10. Source collection is still performed once into the canonical Technical Signal stream.
11. Browser refresh is not a scheduler.
12. Desktop collector owns the long-running maintenance loop; server work remains bounded.
13. `SUPABASE_SERVICE_ROLE_KEY` and provider credentials remain server-side.
14. Authenticated browser users are read-only for historical derived data.
15. No AI is used for aggregation, coverage state, backfill or retention.
16. Do not label observation/reporting volume as attack volume.

## Migration contract

Add only:

`202608100047_phase2_3f_b_historical_activity_coverage.sql`

Do not edit migrations 045 or 046.

The migration must add:

- activity granularity enum: FIVE_MINUTES / HOUR / DAY;
- time axis enum: INGESTION_TIME / SOURCE_EFFECTIVE_TIME;
- coverage enum: COMPLETE / PARTIAL / DEGRADED / NO_COVERAGE;
- rollup calculation mode: LIVE / BACKFILLED / RECOMPUTED;
- `technical_activity_buckets`;
- `technical_collection_coverage_buckets`;
- immutable `technical_source_schedule_snapshots`;
- maintenance state;
- bounded backfill state;
- deterministic bucket helpers;
- trusted rollup/backfill/maintenance/compaction RPCs;
- owner RLS and strict ACLs.

## Activity rollups

Dimensions:

- owner;
- granularity;
- time axis;
- bucket start/end;
- source system;
- Technical Signal type.

Metrics:

- observations;
- distinct signals;
- CURRENT;
- SUPPORTING;
- STALE;
- CONFLICTING.

Exclude MANUAL_TEST observations from production historical activity.

Do not create zero-filled activity rows. Coverage is the authority for whether an absent activity row can be interpreted safely.

## Coverage rollups

Coverage must be source and schedule aware.

Store:

- source status;
- whether schedule history is known;
- expected/attempted/succeeded/failed/running runs;
- records seen/mapped;
- last success/failure/error;
- deterministic coverage status.

Rules:

- known ENABLED + expected run + no attempt → NO_COVERAGE;
- failed work → DEGRADED;
- running/incomplete/missing expected successes → PARTIAL;
- PAUSED/ARCHIVED configured periods → not a collection failure;
- pre-047 unknown schedule history → do not assert exact coverage; mark schedule unknown and keep classification conservative.

## Schedule snapshots

Capture append-only source schedule snapshots when any of these change:

- status;
- interval_minutes;
- next_run_at.

Migration 047 seeds one `reconstructed=true` snapshot for existing connections at migration time. It must not fabricate an exact pre-047 schedule timeline.

## Bounded maintenance

Add:

`POST /api/techint/collector/maintenance`

Authenticate the existing owner-bound collector bearer token.

Database rate gate: one maintenance cycle every five minutes.

One cycle may refresh bounded recent windows:

- five-minute: last 2 hours;
- hourly: last 48 hours;
- daily: last 14 days;
- both activity time axes;
- collection coverage.

Then advance one bounded backfill stream (maximum 48 buckets) and compact retention at most once per day.

Historical-maintenance failure must not mutate or advance source collection cursors.

## Desktop integration

The existing Node collector should call bounded maintenance after a normal tick/run.

Maintenance is best-effort relative to source collection: a rollup failure may be logged safely, but it must not corrupt or cancel an already valid source collection run.

Do not log secrets, run leases, collector tokens or provider credentials.

## Backfill

Maintain independent checkpoint state for nine streams:

- activity 5m ingestion;
- activity 5m source-effective;
- activity hourly ingestion;
- activity hourly source-effective;
- activity daily ingestion;
- activity daily source-effective;
- coverage 5m;
- coverage hourly;
- coverage daily.

Process at most 48 buckets from one stream per maintenance cycle.

Historical activity can be reconstructed from canonical observations. Historical coverage before exact schedule snapshots is partial/reconstructed and must remain visibly qualified.

## Retention

Derived history only:

- 5-minute: retain 14 days;
- hourly: retain 1 year;
- daily: retain long-term.

Do not delete raw Technical Signal provenance.

## Read layer / diagnostics

Add authenticated RLS-backed queries and an operator diagnostic route:

`/techint/sources/history`

Show at minimum:

- received-observation total for last 24H;
- source-effective observation total for last 24H;
- hourly coverage table;
- NO_COVERAGE / DEGRADED counts;
- maintenance timestamps;
- backfill progress.

This route is not the final Global View.

## Tests

Add Vitest for:

- UTC five-minute/hour/day boundaries;
- DST-insensitive epoch bucketing;
- 96-bucket hard cap;
- bounded recent window definitions.

Add PostgreSQL harness:

`scripts/test-phase2-3f-b-migration.sh`

It must validate:

- all migrations apply from zero;
- activity counts and disposition accounting;
- distinct signals;
- idempotent recomputation;
- late effective-time repair;
- known expected-run counting;
- failed run → DEGRADED;
- paused period is not a failure;
- missed expected run → NO_COVERAGE;
- bounded backfill state;
- schedule snapshot append-only behavior;
- trusted RPC denial to authenticated users;
- owner RLS isolation.

Add the harness to `.github/workflows/phase2-1a-validation.yml`.

## Out of scope

Do not add:

- 2.3F-C source semantic taxonomy;
- anomaly baselines or MAD/z-score logic;
- anomaly records;
- situation event detectors;
- convergence/divergence;
- new external sources;
- GeoIP/map;
- final Global View cards/charts;
- profile relevance changes;
- InvestINT changes;
- AI analysis;
- business risk scoring.

## Definition of done

CI is fully green, migration 047 is the only new migration, historical maintenance is bounded and owner-scoped, activity is queryable on both time axes, coverage distinguishes missed expected collection from zero activity, backfill is checkpointed, and no analyst-facing wording overstates observed feed volume as real-world attacks.
