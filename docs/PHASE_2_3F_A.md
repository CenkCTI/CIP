# Phase 2.3F-A — Continuous Collection Runtime

## Purpose

Phase 2.3F-A is the collection-continuity foundation for the later Global Technical Situation Awareness work.

The problem being solved is not browser refresh. A browser can be closed for hours and source collection still needs a durable way to resume from the last successful source cursor when the upstream provider supports recovery.

The Phase 2.3F-A flow is:

`local collector companion → narrow bearer capability → CİTEM server → owner-scoped due-source claim → existing TechINT collection orchestrator → Technical Signals → existing Global Priority / Profile matching`

The collector does **not** create a second Technical Signal stream for Global View or for individual Intel Profiles. Sources are collected once. Global View, standalone profiles, and InvestINT consume the same persisted Technical Signals and derived projections.

## What this phase delivers

- an owner-scoped continuous collector agent record;
- a one-time generated/rotatable collector capability token;
- only the SHA-256 token hash is persisted;
- a POST-only collector tick endpoint;
- database-enforced heartbeat/rate gating;
- owner-scoped due-source claims using the existing exact collection lease model;
- reuse of the existing source adapters, cursors, idempotent Technical Signal recorder, post-sync entity reconciliation, Global Priority, and Profile matching;
- a local Node.js collector companion (`npm run techint:collector`);
- on/off and token-rotation controls in TechINT → Technical Sources;
- explicit source-specific catch-up capability labels instead of a false universal recovery guarantee;
- PostgreSQL and unit/static acceptance coverage.

This is the runtime foundation. A packaged Tauri/system-tray desktop shell is intentionally deferred until this narrow collection contract passes live acceptance. The local Node companion exercises the same backend boundary the packaged desktop app will use.

## Security boundary

The local collector receives only a random collector capability token. It does not receive or embed:

- `SUPABASE_SERVICE_ROLE_KEY`;
- the ThreatFox Auth-Key;
- `NVD_API_KEY`;
- `MALWAREBAZAAR_AUTH_KEY`;
- source cursors;
- collection lease tokens;
- raw provider payloads.

Provider credentials remain server-side. The bearer token identifies exactly one owner collector agent. The database resolves that owner and the collector runtime can claim only due Technical Sources belonging to that owner.

`technical_collector_agents.token_hash` is not selectable by authenticated browser users. Collector configuration/tick/claim RPCs are service-role-only. Token rotation immediately invalidates the previous token.

## Scheduler poll versus provider synchronization

The collector poll interval and a source collection interval are deliberately separate.

A collector may poll the CİTEM server every 60 seconds (or another bounded value between 30 and 3600 seconds). Each poll asks only whether an owned source is **due**. It does not force CISA, NVD, FIRST, ThreatFox, or MalwareBazaar to run on every heartbeat.

Each Technical Source keeps its existing provider-safe interval, cooldown, failure backoff, active-run uniqueness, exact lease, and cursor semantics.

Only one due source is claimed per companion tick in Phase 2.3F-A. This deliberately bounds one server request and avoids one heartbeat starting several expensive provider collections at once. Repeated ticks drain due sources over time.

## Catch-up semantics

Catch-up is provider-dependent. Phase 2.3F-A does not claim that CİTEM can reconstruct data the upstream provider no longer exposes.

| Source | Mode | Recovery contract |
|---|---|---|
| NVD CVE | Durable cursor window | Resumes from the last successful `lastModifiedWatermark` with the existing five-minute overlap. The adapter bounds a window to 120 days. Replay is idempotent. |
| ThreatFox | Bounded lookback + high-water | Replays the configured 1–7 day lookback and filters by provider-ID high water. A ten-hour outage is recoverable when it remains inside the configured lookback and the upstream API still exposes the records. |
| CISA KEV | Current snapshot | Re-fetches the current catalog. Current KEV state is recovered, but intermediate catalog states that existed only while CİTEM was offline cannot be reconstructed. |
| FIRST EPSS | Current bounded snapshot | Refreshes the current bounded EPSS view. Intermediate score states missed while offline are not reconstructed. |
| MalwareBazaar | Latest bounded snapshot | Re-fetches the provider's latest bounded metadata. Long offline gaps can exceed the provider snapshot and are not guaranteed recoverable. |
| TEST_SYNTHETIC | Not applicable | Excluded from continuous collection claims. |

A failed source run does not advance the authoritative source cursor. Existing Phase 2.3B observation identity makes overlap/replay idempotent.

## Migration

Phase 2.3F-A adds one migration:

`202608100045_phase2_3f_a_continuous_collection.sql`

It must be applied **once after migration 044** in the intended Preview/test environment.

Do not edit or re-run migrations 041–044 for this phase.

After applying 045, reload the PostgREST schema cache if needed:

```sql
NOTIFY pgrst, 'reload schema';
```

## Local companion

After enabling/creating the collector in TechINT → Technical Sources, CİTEM displays the token once and gives a command similar to:

```bash
CITEM_COLLECTOR_URL="https://<preview-host>" \
CITEM_COLLECTOR_TOKEN="<one-time-token>" \
npm run techint:collector
```

For a single acceptance heartbeat/tick:

```bash
CITEM_COLLECTOR_URL="https://<preview-host>" \
CITEM_COLLECTOR_TOKEN="<one-time-token>" \
CITEM_COLLECTOR_ONCE=true \
npm run techint:collector
```

The token must not be committed to Git, pasted into public logs, or shared. If exposed, rotate it in CİTEM and replace the local value.

## Live acceptance

1. Apply migration 045 once to Preview/test Supabase and reload schema cache.
2. Deploy/open the current PR Preview.
3. Open TechINT → Technical Sources.
4. Enable at least one production source and leave its source status `ENABLED`.
5. Enable **Continuous collection** and create a collector token.
6. Run the local companion once with `CITEM_COLLECTOR_ONCE=true`.
7. Refresh Technical Sources and verify:
   - collector heartbeat is present;
   - last tick is visible;
   - the token itself is not rendered again;
   - if a source was due, a `SCHEDULED` collection run appears.
8. Run the companion continuously without `CITEM_COLLECTOR_ONCE` and close the browser. Verify scheduled runs continue according to each source's own interval.
9. Pause continuous collection in CİTEM. The local companion should learn that the collector is paused and stop cleanly. Source cursors/history must remain intact.
10. Re-enable or rotate the token. An old rotated token must receive unauthorized status; the new token must work.
11. Catch-up test:
    - stop the local companion long enough for a due source window to be missed;
    - restart it;
    - for NVD, verify the next successful run resumes from the durable last-modified cursor/overlap rather than resetting to a browser-time snapshot;
    - for ThreatFox, verify the gap is recovered when it remains inside the configured lookback/high-water contract;
    - do not interpret snapshot-only CISA/FIRST/MalwareBazaar behavior as guaranteed reconstruction of every intermediate offline state.
12. If a second user is available, verify one user's collector token cannot claim or expose the other user's source runs.

## What this phase does not do

Phase 2.3F-A does not yet implement:

- historical activity buckets;
- anomaly/baseline calculations;
- world map/geographic enrichment;
- Global Situation state;
- charts;
- cross-source convergence/divergence;
- Tauri packaging/system-tray/autostart UI;
- a new provider pack;
- AI analysis;
- business/organizational risk scoring.

Those layers depend on trustworthy continuous collection and are intentionally built after this foundation is accepted.

## Acceptance invariant

The decisive invariant for Phase 2.3F-A is:

> Closing the CİTEM browser must not be the event that stops TechINT scheduling. A separately running collector companion can wake the existing owner-scoped Technical Source scheduler, and restarting it after downtime resumes from the last successful provider cursor wherever the upstream source makes that history recoverable.
