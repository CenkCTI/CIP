# CİTEM TechINT — Internet Infrastructure Lane

## Purpose

The `Internet Infrastructure` lane is the CİTEM consumer surface for accepted BAYKUSH Intelligence Node routing telemetry. It is deliberately separate from vulnerability reporting and malware/IOC reporting.

CİTEM does not collect RIPE data, perform MRT recovery, reconstruct missing routing history, calculate routing coverage, or infer attacks/outages/hijacks from BGP movement. BAYKUSH Intelligence Node remains the producer authority.

## Data flow

```text
RIPE RIS Live / official MRT UPDATE archives
                |
                v
      BAYKUSH Intelligence Node
      - stream collection
      - recovery
      - 1m routing truth
      - 5m/hour/day materialization
      - coverage/provenance
                |
        authenticated v1 API
                |
                v
         CİTEM server-only client
         - timeout / bounded retry
         - Zod response validation
         - presentation adapter
                |
                v
      Global View / Lane 03
      Internet Infrastructure
```

The browser never receives `BAYKUSH_NODE_API_TOKEN` and never calls the Node directly.

## Measurement ownership

Global routing charts use Node-materialized measurements through the existing `/v1/techint/measurements` endpoint with `resolution=AUTO`:

- `routing.ripe_ris.update_messages`
- `routing.ripe_ris.announcement_prefix_events`
- `routing.ripe_ris.withdrawal_prefix_events`
- `routing.ripe_ris.distinct_prefixes_observed`
- `routing.ripe_ris.distinct_announced_prefixes`
- `routing.ripe_ris.distinct_withdrawn_prefixes`
- `routing.ripe_ris.distinct_origin_asns_observed`

CİTEM does not fetch 1-minute data and re-aggregate 24H/7D/30D ranges. This keeps time/population/coverage authority on the Node and bounds browser payloads.

## Range behavior

The existing Global View controls remain authoritative:

- `24H`
- `7D`
- `30D`

The Node selects the appropriate materialized resolution through `resolution=AUTO`. CİTEM must not interpolate missing points or manufacture higher-level buckets.

## Range totals

`update_messages`, `announcement_prefix_events`, and `withdrawal_prefix_events` are additive count measurements. CİTEM shows a range total only when every returned point is numeric and `COMPLETE`.

Distinct prefix/ASN counts are not additive. CİTEM never sums per-bucket distinct counts to claim a range-wide distinct population. The headline surface card uses the latest current minute head from the routing-status contract.

## Operational status

CİTEM reads `GET /v1/techint/routing/status` independently from the historical measurement series. The status surface exposes:

- stream-worker heartbeat freshness;
- latest stream-session state;
- latest source-observation time;
- recovery-worker heartbeat freshness;
- latest recovery-request state;
- latest current routing minute;
- current capture-profile information.

Routing status failure does not make validated historical measurement series disappear. Measurement failure does not make operational status authoritative for missing historical values.

## Coverage and provenance

The UI keeps the following concepts distinct:

- `coverageStatus`: whether the selected bucket is proven complete/partial/degraded/missing;
- `dataAvailability`: whether usable data currently exists;
- `liveCollectionCoverage`: what BAYKUSH captured live at the time;
- `acquisitionBasis`: whether current data derives from live stream or MRT recovery;
- capture profile: observer-population identity/version.

Example:

```text
Data availability: AVAILABLE
Coverage: COMPLETE
Live collection: PARTIAL
Acquisition: MRT_RECOVERY
```

This is valid and means later recovery made the data complete without rewriting the historical fact that live collection was partial.

## Zero semantics

`0` under proven `COMPLETE` coverage is a valid observation.

`NO_COVERAGE` is unknown/missing observation state and must be rendered as unavailable/gap, never as numeric zero.

## Semantic boundary

The lane must never present:

- BGP UPDATE count as incident count;
- announcement count as attack count;
- withdrawal count as outage count;
- origin change as hijack verdict;
- RIPE RIS visibility as complete global-Internet visibility;
- infrastructure location as attacker origin;
- routing movement as a CİTEM risk score.

Cross-source convergence, geography, entity overlap and discovery remain later analytical work.

## Failure isolation

`/techint/global` uses settled parallel requests. Routing operational-status failure is isolated from the other lanes. The entire Global View is unavailable only under the existing condition where the principal Node source-status and measurement paths both fail.

## Cache policy

- generic source status: existing short cache;
- routing operational status: 15 seconds;
- materialized measurement series: existing 60-second query cache;
- no client-side raw-minute historical cache is introduced.

Historical routing data must not be assumed immutable merely because time has passed; MRT recovery may revise current materialized history while preserving lineage.

## Acceptance

The consumer closure is accepted when:

1. routing measurements are requested in bounded Node measurement batches;
2. 24H/7D/30D render through Node materialized resolution;
3. `Internet Infrastructure` appears as Lane 03;
4. additive totals are suppressed when coverage is incomplete;
5. distinct counts are never summed across buckets;
6. live coverage and recovered availability remain visibly distinct;
7. routing-status failure does not break Vulnerability or Malware/IOC lanes;
8. Node bearer credentials remain server-only;
9. real RIPE → Node → CİTEM acceptance confirms both live and recovered provenance states.
