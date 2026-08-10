# Phase 2.3F-A — Desktop-Driven Continuous Collection Runtime

## Purpose

Phase 2.3F-A is the collection-continuity foundation for Global Technical Situation Awareness.

The browser is not a scheduler. The desktop companion owns the long-running continuous control loop; server requests remain bounded and trusted.

The revised flow is:

`desktop collector → claim one due source → bounded work unit → checkpoint → bounded work unit → ... → final cursor commit`

Global View, Profiles and InvestINT still consume one canonical Technical Signal stream. This phase does not create profile-specific provider requests.

## Why the runtime was revised

The first live Preview acceptance proved collector-token authentication, owner scoping, Vercel Deployment Protection bypass, heartbeat state and due-source claiming. It also showed that executing a complete large provider run inside one serverless request is the wrong boundary: a large source can outlive one invocation.

Phase 2.3F-A therefore keeps the trusted server boundary but moves long-running orchestration to the desktop companion.

## Runtime boundary

### Desktop companion

The local Node companion:

- polls for due work;
- claims at most one due source;
- repeatedly asks for bounded work units;
- may remain active for many minutes while a large source drains;
- retries transient work-request failures;
- exits after one complete claimed run when `CITEM_COLLECTOR_ONCE=true`;
- does not contain the Supabase service role or provider credentials.

### Server

The server performs only bounded trusted operations:

- collector authentication / heartbeat;
- due-source claim;
- one bounded source work unit;
- Technical Signal recording;
- incremental checkpoint;
- final cursor commit or controlled failure;
- existing derived entity / Global Priority / Profile projections on bounded batches.

A single `/tick` request no longer executes a complete provider run.

## Endpoints

### `POST /api/techint/collector/tick`

Authenticates the owner-bound collector, applies database tick gating and returns at most one due source run capability.

If no source is due it returns a heartbeat result and completes the tick immediately.

### `POST /api/techint/collector/work`

Accepts the collector bearer token plus the exact claimed run ID/lease capability. It validates owner and lease, processes only a bounded signal slice, checkpoints progress and returns.

The desktop repeats this request until the run reports `done: true` or a controlled failure.

Default work-unit target: 50 signals.

Hard maximum: 100 signals.

## Stable incremental snapshot

Current adapters still produce their canonical bounded adapter result. During an incremental run CİTEM computes a deterministic SHA-256 identity from the ordered source observation identities.

The run work state stores:

- snapshot hash;
- total mapped signals;
- next signal offset.

On a later work unit the source result is re-evaluated. If the upstream snapshot changed such that the ordered identity/hash no longer matches, the run fails safely with `SOURCE_SNAPSHOT_CHANGED`. The authoritative connection cursor does not advance.

This avoids silently applying an offset to a shifted provider snapshot.

## Migration contract

Migration `045` has already been applied to Preview/test Supabase and is immutable for this refactor:

`202608100045_phase2_3f_a_continuous_collection.sql`

The desktop-driven incremental work state is additive in:

`202608100046_phase2_3f_a_incremental_collection_work.sql`

Migration 046 adds safe incremental progress state to `technical_collection_runs` and service-role-only RPCs for:

- collector authentication without starting a new tick;
- incremental work-claim validation;
- checkpoint/counter accumulation;
- lease extension;
- incremental completion;
- incremental failure.

Authenticated browser users may read only safe progress (`work_units_completed`, `last_work_at`), not `collector_work_state`, lease material or provider secrets.

## Cursor safety

The authoritative `technical_source_connections.cursor` remains unchanged during all intermediate work units.

Only final successful incremental completion advances the cursor.

If the desktop exits or a work request fails before completion:

- the run remains incomplete until recovered/failed;
- the connection cursor remains at the previous successful position;
- expired-run recovery frees the source;
- the next run replays from the previous cursor;
- existing Technical Signal observation identity absorbs safe replay/overlap.

## Security boundary

The desktop process has:

- `CITEM_COLLECTOR_URL`;
- one owner-bound `CITEM_COLLECTOR_TOKEN`;
- optional Vercel automation bypass secret for protected Preview deployments;
- a short-lived exact run lease capability only while processing a claimed run.

The desktop process does **not** receive:

- `SUPABASE_SERVICE_ROLE_KEY`;
- ThreatFox Auth-Key;
- `NVD_API_KEY`;
- `MALWAREBAZAAR_AUTH_KEY`;
- arbitrary database access;
- another owner's source/run state.

Provider credentials remain server-side in Phase 2.3F-A.

Collector and run capability values must never be logged or committed.

## Vercel Deployment Protection

Protected Preview deployments may require an automation bypass secret. The local companion supports:

- `CITEM_VERCEL_BYPASS_SECRET`;
- `VERCEL_AUTOMATION_BYPASS_SECRET`.

When configured, it sends `x-vercel-protection-bypass`. The secret is never logged.

The collector distinguishes a Vercel protection 401 from a CİTEM collector-authentication 401.

## Source scheduling

Collector poll frequency and provider synchronization frequency remain separate.

A 60-second collector heartbeat does **not** mean every upstream source runs every minute. Each source keeps its existing interval, cooldown/backoff, one-active-run uniqueness and cursor semantics.

Only one production source is claimed per desktop tick.

`TEST_SYNTHETIC` remains excluded from continuous claims.

## Catch-up semantics

Catch-up remains provider-dependent:

| Source | Recovery contract |
|---|---|
| NVD CVE | Durable last-modified watermark with five-minute overlap and bounded window. |
| ThreatFox | Configured 1–7 day lookback plus provider-ID high-water. |
| CISA KEV | Current catalog state; intermediate offline catalog states are not reconstructed. |
| FIRST EPSS | Current bounded score snapshot; missed intermediate score states are not reconstructed. |
| MalwareBazaar | Latest bounded metadata; long offline gaps are not guaranteed recoverable. |

No universal backfill guarantee is made.

## Local companion

Typical continuous command:

```bash
CITEM_COLLECTOR_URL="https://<preview-host>" \
CITEM_COLLECTOR_TOKEN="<collector-token>" \
CITEM_VERCEL_BYPASS_SECRET="<optional-preview-bypass>" \
npm run techint:collector
```

Single acceptance run:

```bash
CITEM_COLLECTOR_URL="https://<preview-host>" \
CITEM_COLLECTOR_TOKEN="<collector-token>" \
CITEM_VERCEL_BYPASS_SECRET="<optional-preview-bypass>" \
CITEM_COLLECTOR_ONCE=true \
npm run techint:collector
```

A large run should now print multiple safe progress lines such as:

```text
source FIRST_EPSS: work unit 1 processed=50 progress=50/1250
source FIRST_EPSS: work unit 2 processed=50 progress=100/1250
...
source FIRST_EPSS: SUCCEEDED
```

No token or lease value is printed.

## Live acceptance

1. Keep migration 045 as already applied.
2. Apply migration 046 once to Preview/test Supabase.
3. Reload PostgREST schema cache if needed.
4. Deploy/open the current PR Preview.
5. Enable continuous collection and at least one production source.
6. Run the desktop companion with `CITEM_COLLECTOR_ONCE=true`.
7. Verify a due source is claimed and, for a sufficiently large source, more than one bounded work unit is processed.
8. Verify every intermediate work unit leaves the authoritative source cursor unchanged.
9. Verify the final successful work unit advances the cursor once and marks the run `SUCCEEDED`.
10. Stop the collector during a multi-unit run. Verify no partial cursor advancement occurs; after lease recovery, replay starts from the previous successful cursor.
11. Run continuously with the browser closed and verify scheduling continues.
12. Pause continuous collection and verify the local companion stops cleanly without deleting source history/cursors.
13. Rotate the collector token and verify the old token is rejected.
14. If a second user is available, verify collector/run capabilities cannot cross owner boundaries.

## Tests

The Phase 2.3F-A migration harness validates both 045 and additive 046, including:

- token hashing and rotation;
- owner-scoped claims;
- incremental work-claim validation;
- checkpoint storage;
- no cursor advancement at checkpoint;
- final cursor advancement only at incremental completion;
- safe progress columns;
- work-state secrecy;
- trusted RPC denial to authenticated users;
- cross-owner isolation.

Static/unit coverage also enforces:

- `/tick` is claim-only;
- desktop loops `/work`;
- work-unit hard bound is <= 100 signals;
- source snapshot drift fails safely;
- desktop contains no service-role/provider-secret variable names;
- Vercel protection bypass remains optional and safe.

## Out of scope

Phase 2.3F-A does not implement:

- historical activity / coverage buckets (2.3F-B);
- source semantic taxonomy (2.3F-C);
- baselines / anomaly engine (2.3F-D);
- technical situation detectors (2.3F-E);
- convergence/divergence (2.3F-F);
- new advisory/reporting/infrastructure sources;
- geographic enrichment / map;
- final Global View UI;
- Tauri/system-tray packaging;
- AI analysis;
- business risk scoring.

## Acceptance invariant

> Closing the browser must not stop TechINT scheduling, and a large source run must not depend on one long serverless invocation. The desktop companion owns the long-running loop, each server request performs bounded trusted work, and the authoritative source cursor advances only after the complete run succeeds.
