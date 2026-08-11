# Phase 2.3F-D — Baseline & Deterministic Anomaly Engine

## Purpose

Phase 2.3F-D answers one bounded analytical question:

> Is this technical measurement materially different from the same series' own eligible recent history?

It does **not** decide whether the deviation is dangerous, strategically important, a threat level, an attack count, a probability, a business-risk score, or cross-source corroboration.

Data flow:

`Technical Signal observations → Phase 2.3F-B activity/coverage → Phase 2.3F-C semantics → analytical series → coverage eligibility → robust baseline → deterministic evaluation`

## Epistemic invariants

- unknown is not zero;
- no collection coverage is not no activity;
- degraded collection is not activity decline;
- manual sync is not a natural source-activity opportunity;
- reporting volume is not attack volume;
- IOC volume is not attack count;
- EPSS score is not observed exploitation;
- repository submissions are not infections;
- anomaly score is not probability or severity;
- anomaly is not a threat assessment;
- cross-source reasoning and business relevance remain out of scope;
- AI cannot choose baselines, thresholds, coverage state, or anomaly truth.

## Analytical series

D v1 deliberately supports only:

- granularity: `HOUR`;
- time axis: `INGESTION_TIME`;
- semantics version: `2.3F-C-v1`;
- engine version: `2.3F-D-v1`;
- configuration version: `2.3F-D-config-v1`.

`SOURCE_EFFECTIVE_TIME` remains available in Phase 2.3F-B diagnostics, but is not used for generic automated anomaly decisions in D v1 because collection coverage is tied to when CİTEM collected a source, not necessarily to the historical time represented by a late-arriving source record.

A series identity includes source key/system, Technical Signal type, metric, time axis, granularity, source class, observation basis, semantic kind, semantic version, and engine version. Its deterministic `series_key` is SHA-256.

## Metrics

The controlled metric enum includes the six Phase 2.3F-B activity components, while D v1 automatically evaluates four generic metrics:

- `OBSERVATION_COUNT`;
- `DISTINCT_SIGNAL_COUNT`;
- `STALE_COUNT`;
- `CONFLICTING_COUNT`.

`CURRENT_COUNT` and `SUPPORTING_COUNT` remain available as contextual history measurements but are not separate v1 anomaly detectors.

Provider/domain-specific distributions such as EPSS median/P90 shifts are intentionally deferred to Phase 2.3F-E.

## Collection-opportunity eligibility

A wall-clock hour is not automatically a valid baseline sample.

An eligible sample requires:

- source coverage bucket exists;
- coverage is `COMPLETE`;
- no `MANUAL` collection run in the bucket;
- no `TEST` run in the bucket;
- a scheduled collection opportunity is evidenced by a scheduled run or known expected run;
- for reconstructed history, an actual successful scheduled run must exist.

A missing activity row becomes a real numeric zero only when the target bucket passed these collection-validity gates. Otherwise missing activity remains unknown/not applicable and the evaluation is suppressed.

### Strict samples

Strict samples require exact schedule history (`schedule_known=true`) and a scheduled run. They are eligible for a production `READY` baseline.

### Provisional samples

Historically reconstructed coverage may contribute only when an actual successful scheduled run exists. Missing reconstructed hours are never converted to zero.

## Manual/test contamination

`technical_collection_runs.trigger` is authoritative for `MANUAL`, `SCHEDULED`, and `TEST` collection work.

If any manual or test run occurs inside a target hour, that hour is suppressed because Phase 2.3F-B activity buckets cannot safely separate observations produced by different run triggers inside the same hour.

Therefore an analyst pressing **Sync now** cannot manufacture a production anomaly.

## Baseline readiness

History window: prior 30 days.

Maximum samples: 64 eligible collection opportunities.

`INSUFFICIENT_HISTORY`:

- fewer than 14 eligible samples; or
- insufficient historical span.

`PROVISIONAL`:

- at least 14 eligible samples;
- at least 72 hours of history;
- strict readiness not yet met.

`READY`:

- at least 28 strict samples;
- strict sample span of at least seven days.

A target bucket is never included in its own baseline (`baseline sample bucket < target bucket`).

Previously anomalous values are not recursively removed from baseline training. Robust statistics reduce their influence without making the algorithm order-dependent.

## Robust statistics

The database is the authoritative mathematical implementation.

Primary baseline statistics:

- median;
- median absolute deviation (MAD);
- scaled MAD (`MAD / 0.6745`);
- Q1 / Q3 / IQR;
- P10 / P90;
- minimum / maximum;
- zero count;
- sample bucket provenance.

Primary deviation method when `MAD > 0`:

`modified_z = 0.6745 × (current - median) / MAD`

Candidate anomaly gate:

`abs(modified_z) > 3.5`

This value is exposed only as a **robust deviation score**. It is never labelled as a probability, confidence, p-value, risk, or threat severity.

When `MAD = 0` and `IQR > 0`, D falls back to 3×IQR outer fences.

When both MAD and IQR are zero, D uses a constant-baseline comparison with the same minimum-change gates.

## Minimum-change gates

Versioned v1 absolute floors:

- observation count: 10;
- distinct-signal count: 10;
- stale count: 5;
- conflicting count: 3.

For observation/distinct metrics with baseline median at least 20, relative movement must also be at least 35%.

These are versioned engine configuration choices, not universal scientific constants. Future tuning requires a new configuration version so historical evaluations do not silently change meaning.

## Deterministic anomaly kinds

- `VOLUME_SPIKE`;
- `VOLUME_DROP`;
- `DISTINCT_VOLUME_SPIKE`;
- `DISTINCT_VOLUME_DROP`;
- `STALE_SPIKE`;
- `CONFLICTING_SPIKE`.

Stale/conflicting metrics emit only high-direction anomalies in D v1.

## Suppression is first-class output

An evaluation may deliberately refuse to infer a deviation.

Suppression reasons include:

- `NO_COLLECTION_OPPORTUNITY`;
- `NO_COVERAGE`;
- `DEGRADED_COVERAGE`;
- `PARTIAL_COVERAGE`;
- `MANUAL_RUN_PRESENT`;
- `TEST_RUN_PRESENT`;
- `INSUFFICIENT_HISTORY`;
- semantic/configuration incompatibility.

A collection failure that produces zero mapped records must **not** become a volume-drop anomaly.

## Database model

Migration:

`202608110049_phase2_3f_d_baseline_anomaly.sql`

Migrations 041–048 remain immutable.

### `technical_analysis_series`

Deterministic analytical series identity and semantic contract.

### `technical_baseline_profiles`

Current recomputable baseline profile per series. Stores readiness, robust statistics, sample provenance, fingerprints, engine/config versions, and `as_of`.

Historical backfill is allowed to calculate an older baseline for an evaluation, but cannot replace a newer current profile because profile upsert is monotonic on `as_of`.

### `technical_anomaly_evaluations`

Recomputable derived evaluation per series/hour/engine version. Stores target measurement, collection validity, baseline snapshot, robust deviation, state, anomaly/suppression result, semantics, versions, and SHA-256 input fingerprint.

Late observation/coverage repair updates the same evaluation identity rather than creating duplicate conclusions.

### `technical_anomaly_backfill_state`

Bounded per-series 30-day evaluation backfill cursor.

### `technical_anomaly_maintenance_state`

Owner-scoped five-minute rate gate and maintenance timestamps.

## Runtime

The existing desktop collector remains the long-running control loop.

The existing maintenance endpoint now performs:

1. Phase 2.3F-B bounded activity/coverage maintenance;
2. Phase 2.3F-D bounded anomaly maintenance.

Analysis uses an independent database rate gate. Analysis failure is isolated: it does not fail source collection, advance collection cursors, or corrupt Phase 2.3F-B history maintenance.

A D maintenance cycle:

- refreshes analytical-series identities;
- evaluates at most 20 recent series/buckets;
- advances at most 12 historical evaluations;
- compacts evaluations older than one year at most once per day.

All public RPC bounds are validated and capped at 50.

Open/current hourly buckets are never evaluated. D uses a 15-minute settlement delay.

## Diagnostic UI

Route:

`/techint/sources/anomalies`

Shows:

- READY / PROVISIONAL / insufficient baselines;
- 24H anomaly count;
- coverage/manual suppression counts;
- analysis maintenance/backfill state;
- per-series median/MAD/latest value/deviation/evaluation;
- recent deterministic evaluations.

Detail route:

`/techint/sources/anomalies/[id]`

Shows:

- what changed;
- baseline snapshot;
- detection method and movement;
- collection validity;
- semantic `Represents` / `Does not represent` boundary;
- recent series evaluations;
- engine/config/semantic versions and input fingerprint.

This is an engineering/analyst explainability surface, not the final Global View.

## Security

All D tables are owner-scoped under RLS.

Authenticated users may read only their own derived analysis state.

Authenticated direct writes are denied.

Only service-role trusted RPCs can materialize series, refresh baselines, evaluate buckets, backfill, claim maintenance, compact, or orchestrate anomaly maintenance.

No provider credential, collector token, or Supabase service-role credential is persisted in analysis state.

Analysts cannot edit `ANOMALOUS` into `NORMAL`; a future analyst judgement must be a separate assertion/workflow state rather than mutation of deterministic derived truth.

## Validation

CI runs:

`bash scripts/test-phase2-3f-d-migration.sh`

The PostgreSQL harness verifies:

- four generic D v1 series are materialized;
- ThreatFox series preserves `IOC_SHARING / REPORTED / IOC_REPORT` semantics;
- 32 strict samples over more than seven days produce a `READY` baseline;
- median/MAD are computed from eligible history only;
- a scheduled high-volume target produces deterministic `VOLUME_SPIKE`;
- adding a manual run to that same hour recomputes the same evaluation into `MANUAL_RUN_PRESENT` suppression;
- manual recomputation changes the input fingerprint without duplicating the evaluation row;
- degraded provider collection is suppressed and never emitted as a volume drop;
- COMPLETE scheduled collection with no activity row becomes a valid zero;
- repeated evaluation is idempotent;
- anomaly backfill respects the requested bound;
- unbounded maintenance requests are rejected;
- authenticated direct writes/RPC execution are denied;
- cross-owner RLS isolation holds.

Vitest validates versioned/bounded D configuration.

## Preview acceptance

After CI is green:

1. Apply migration 049 exactly once to Preview/test. Do not rerun 041–048.
2. Reload PostgREST schema cache if required.
3. Run one bounded desktop maintenance cycle.
4. Open `/techint/sources/anomalies` and confirm production series materialize.
5. Confirm insufficient history/provisional status is rendered as a valid analytical state rather than an error.
6. Run a manual ThreatFox sync and verify its contaminated hour is suppressed with `MANUAL_RUN_PRESENT`, not emitted as an IOC-volume anomaly.
7. Observe/create a controlled provider failure (for example the existing rejected MalwareBazaar credential case) and verify `DEGRADED_COVERAGE` suppression, not `VOLUME_DROP`.
8. Verify a successful scheduled collection opportunity with no activity can be represented as a real zero.
9. Re-run maintenance for the same closed bucket and verify no duplicate evaluation rows and stable fingerprints when inputs did not change.
10. Verify another owner cannot read the first owner's series, baselines, evaluations, or backfill state.

Manual acceptance should be performed one step at a time.

## Out of scope

Phase 2.3F-D does not implement:

- Global Technical Activity state;
- domain-specific EPSS/vulnerability/malware/IOC situation detectors (2.3F-E);
- cross-source convergence/divergence (2.3F-F);
- new source packs;
- geography/world map;
- business/profile relevance;
- attribution;
- final Global View;
- AI anomaly decisions.

## Acceptance invariant

> CİTEM must never emit a technical anomaly merely because collection failed, coverage was missing, an analyst manually synchronized a source, or the baseline history was insufficient.
