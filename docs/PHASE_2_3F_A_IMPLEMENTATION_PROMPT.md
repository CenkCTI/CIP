# Phase 2.3F-A — Desktop-Driven Continuous Collection Runtime

## Repository / PR contract

Repository: `CenkCTI/CIP`

Continue **only** on the existing branch and Draft PR:

- branch: `feat/techint-2-3f-a-continuous-collection`
- PR: `#41 — Phase 2.3F-A: Continuous Collection Runtime`

Do not create a second PR. Do not merge the PR.

Migration `202608100045_phase2_3f_a_continuous_collection.sql` has already been applied to Preview/test Supabase. **Do not edit or re-run migration 045.** Any database changes required by this refactor must be additive in migration `046` or later.

## Why the architecture is changing

The first 2.3F-A implementation made the desktop companion call one Vercel endpoint that claimed and executed an entire provider run inside the same server invocation. Live acceptance proved the authentication, ownership, heartbeat and due-source claim path, but also exposed the wrong runtime boundary: large sources can outlive a single serverless invocation.

The desktop companion must therefore own the long-running control loop. Vercel remains the trusted short-operation API boundary, not the long-running collection engine.

The target flow is:

`desktop collector → claim one due source → repeat bounded work-unit requests → trusted Technical Signal recorder → checkpoint → final cursor commit`

A single HTTP request must never need to finish a complete 1,000–2,500-record source run.

## Non-negotiable invariants

1. Browser refresh is never the collection scheduler.
2. The desktop companion is the primary continuous runtime.
3. Vercel/server execution is bounded per request and may be used as a coarse fallback scheduler, but continuous collection must not depend on one long server invocation.
4. Sources are collected once into the canonical Technical Signal stream. Global View, Profiles and InvestINT consume the same persisted signals.
5. `SUPABASE_SERVICE_ROLE_KEY` is never present in the desktop process.
6. Existing provider credentials remain server-side in this phase. Do not expose ThreatFox, MalwareBazaar, NVD or other server credentials to the desktop process.
7. The collector bearer token is owner-bound, rotatable, hash-only at rest and never logged.
8. A failed/incomplete run never advances the authoritative source cursor.
9. Replay remains idempotent through the existing Technical Signal observation identity.
10. One collector tick claims at most one due production source.
11. TEST_SYNTHETIC remains excluded from continuous collection.
12. Profile-specific collection is forbidden. Twenty Profiles must not create twenty upstream requests.
13. No AI is used for collection, cursor handling, scheduling or collection success/failure.

## Runtime design

### Tick / claim

`POST /api/techint/collector/tick`

The endpoint must:

- authenticate the collector bearer capability;
- update heartbeat / honor database tick gating;
- claim at most one owner-scoped due source;
- return a narrow run capability to the desktop (`runId`, `sourceKey`, `leaseToken`, lease expiry);
- **not execute the provider collection**.

If no source is due, it returns a heartbeat result and completes the collector tick immediately.

### Work units

Add a POST-only endpoint such as:

`POST /api/techint/collector/work`

Input:

- collector bearer token in Authorization;
- `runId`;
- exact run `leaseToken`.

The server must validate:

- collector token owner;
- run owner;
- run status RUNNING;
- lease token and lease freshness.

A work request may fetch/map the source on the server because provider credentials remain server-side, but it may record only a bounded signal slice (target 50, hard max 100) before returning.

The desktop companion repeatedly calls `/work` until the run reports `done: true` or a controlled failure.

### Stable incremental snapshot

Because a source adapter may be re-fetched across work units, prevent silent offset drift.

For every adapter result, compute a deterministic snapshot identity from ordered source observation identities (for example source system + source record key + source revision key). Persist in the run work state:

- snapshot hash;
- total mapped signals;
- next offset.

On later work units, recompute and compare. If the source snapshot changed during an incremental run, fail safely without advancing the authoritative source cursor. Do not silently continue with a shifted offset.

### Checkpointing

Add additive migration 046 with trusted-only incremental run state. Suggested columns on `technical_collection_runs`:

- `collector_work_state jsonb NOT NULL DEFAULT '{}'`;
- `work_units_completed integer NOT NULL DEFAULT 0`;
- `last_work_at timestamptz`.

Authenticated browser users may see only safe progress columns if useful; they must not read raw work state or lease material.

Add trusted RPCs for:

- collector-token authentication without starting a new tick;
- validating/fetching an owner-scoped incremental work claim;
- checkpointing one unit and accumulating counters/issues;
- renewing/extending the exact run lease;
- completing an incremental run from accumulated counters;
- failing an incremental run while preserving already accumulated counters.

All new trusted RPCs are `service_role` only. Revoke from `public`, `anon` and `authenticated`.

### Cursor semantics

The connection cursor remains unchanged for every intermediate unit.

Only the final successful work unit may commit the adapter's proposed cursor.

If the desktop exits, the network drops, Vercel returns a transient error, or the lease expires:

- the source cursor remains at the previous successful value;
- expired-run recovery eventually frees the source;
- the next run replays from the previous authoritative cursor;
- existing idempotency absorbs overlap/replay.

### Derived projections

Each recorded bounded batch must continue to feed existing entity reconciliation, Global Priority and Profile matching.

Projection failures must not convert a durably recorded batch into raw source corruption. Preserve the existing principle that source collection truth and derived projections are separate.

## Desktop companion behavior

`scripts/techint-collector.mjs` remains the MVP desktop runtime contract.

It must:

1. call `/tick`;
2. if no source is due, sleep according to server wait/poll;
3. if a run is claimed, loop `/work` until done;
4. log only safe source/progress/error information;
5. never log collector token, run lease token or Vercel bypass secret;
6. retry transient endpoint failures with bounded backoff;
7. treat collector 401 as fatal;
8. distinguish Vercel Deployment Protection from CİTEM collector authentication;
9. honor `CITEM_COLLECTOR_ONCE=true` by processing one claimed source run through all bounded work units, then exiting;
10. stop cleanly when continuous mode is paused.

The local process may run for 10, 20 or more minutes. Individual server requests must remain bounded.

## Vercel Deployment Protection

Keep optional support for:

- `CITEM_VERCEL_BYPASS_SECRET`
- `VERCEL_AUTOMATION_BYPASS_SECRET`

Use `x-vercel-protection-bypass` only when configured.

Never print the secret.

## Existing source / catch-up semantics

Preserve the current source-specific contracts:

- NVD: durable last-modified watermark + overlap;
- ThreatFox: bounded lookback + provider ID high-water;
- CISA KEV: current snapshot, not intermediate historical reconstruction;
- FIRST EPSS: current bounded snapshot, not every missed score state;
- MalwareBazaar: latest bounded metadata, no guarantee for long offline gaps.

Do not claim universal historical reconstruction.

## UI

Keep the existing TechINT → Technical Sources collector control but update explanatory copy so it no longer implies that one server tick performs a whole source run.

Show safe progress when available:

- ONLINE / OFFLINE / PAUSED;
- current source if a run is active;
- work units completed;
- last work time;
- last completed tick status;
- last safe error.

Do not expose work-state JSON, source cursor, lease token or provider secrets.

## Tests

Update/add tests covering at minimum:

- migration 045 remains unchanged;
- migration 046 additive work-state fields and service-role-only RPCs;
- collector token cannot access another owner's run;
- invalid run lease rejected;
- checkpoint extends lease;
- intermediate checkpoint does not advance connection cursor;
- final incremental completion advances cursor exactly once;
- failed incremental run preserves previous connection cursor;
- authenticated users cannot invoke incremental trusted RPCs;
- desktop script contains no service-role/provider-secret variable names;
- desktop script loops work units rather than expecting one long `/tick` request;
- max work-unit signal count is bounded to 100 or less;
- snapshot identity drift fails safely;
- old rotated collector token remains invalid;
- Vercel bypass behavior remains supported.

Run lint, typecheck, full Vitest, Next production build, historical migration harnesses, Phase 2.3F-A migration harness and the new migration-046 harness.

## Acceptance

The decisive acceptance scenario is a deliberately large source run:

- desktop collector starts;
- one source is claimed;
- multiple short work requests are visible;
- total desktop runtime may exceed a serverless invocation limit;
- no individual request must own the entire run;
- final source cursor advances only after all units succeed;
- browser can remain closed throughout;
- stopping desktop mid-run does not advance the cursor;
- restart/recovery safely replays from the last successful cursor.

## Out of scope

Do not implement in 2.3F-A:

- historical activity buckets / coverage (2.3F-B);
- source semantic taxonomy (2.3F-C);
- baseline/anomaly engine (2.3F-D);
- domain detectors (2.3F-E);
- convergence/divergence (2.3F-F);
- new advisory/reporting/infrastructure source packs;
- geographic enrichment / map;
- final Global View UI;
- Tauri/system-tray packaging;
- AI analysis;
- business risk scoring.
