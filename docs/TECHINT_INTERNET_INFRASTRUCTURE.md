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

Core Global View measurements and routing measurements are fetched in separate server-side failure domains. A routing measurement dependency failure cannot suppress otherwise valid Vulnerability or Malware/IOC series.

## Range behavior

The existing Global View controls remain authoritative:

- `24H`
- `7D`
- `30D`

The Node selects the appropriate materialized resolution through `resolution=AUTO`. CİTEM must not interpolate missing points or manufacture higher-level buckets.

## Range totals

`update_messages`, `announcement_prefix_events`, and `withdrawal_prefix_events` are additive count measurements. CİTEM shows a range total only when every returned point is numeric and `COMPLETE`.

Distinct prefix/ASN counts are not additive. CİTEM never sums per-bucket distinct counts to claim a range-wide distinct population. The headline surface card uses the latest current minute head from the routing-status contract.

## Operational status and recovered provenance

CİTEM reads `GET /v1/techint/routing/status` independently from the historical measurement series. The status surface exposes:

- stream-worker heartbeat freshness;
- latest stream-session state;
- latest source-observation time;
- recovery-worker heartbeat freshness;
- latest recovery-request state;
- newest current routing minute (`latest`);
- newest retained MRT-recovered current historical minute (`latestRecovered`);
- capture-profile information.

`latest` and `latestRecovered` intentionally coexist. A healthy current live minute can be newer than a historical recovered minute. The recovered surface keeps its own `liveCollectionCoverage`, allowing the UI to show that data became complete later without rewriting what BAYKUSH actually collected live.

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

`/techint/global` uses settled parallel requests. Core measurement history, routing measurement history, routing operational status, source status, changes and comparison paths are independent where their semantics permit it.

Routing measurement failure therefore leaves Vulnerability and Malware/IOC measurements usable. Routing status failure does not erase validated routing history. The entire Global View is unavailable only under the existing condition where the principal Node source-status and core measurement paths both fail.

## Cache policy

- generic source status: existing short cache;
- routing operational status: 15 seconds;
- materialized measurement series: existing 60-second query cache;
- no client-side raw-minute historical cache is introduced.

Historical routing data must not be assumed immutable merely because time has passed; MRT recovery may revise current materialized history while preserving lineage.

## Real acceptance

The downstream integration was accepted on 2026-08-18 with:

- CİTEM tested commit `b8f8ed06bfefd73b46df2d9eeae4b3f6dd60c512`;
- Node tested commit `b89ed6b900a88a814f897de913b91c312fb5dbe9`;
- real acceptance run `32125005111`;
- PR-visible gate run `32124997379`.

The accepted run simultaneously exercised actual RIPE RIS Live traffic and the fixed official RIPE MRT UPDATE artifact. Live state was `STREAMING / FRESH`; the retained historical recovery was `MRT_RECOVERY / COMPLETE / AVAILABLE` while its original `liveCollectionCoverage` remained `PARTIAL`. The consumer parsed both states and all seven routing measurement contracts through Node-owned `AUTO` resolution.

The retained machine-readable evidence is stored in the producer repository at:

`docs/acceptance/NODE_6_CITEM_REAL_INTEGRATION_ACCEPTANCE.json`

The acceptance process also exposed and fixed an important isolation defect: routing and the existing eleven core measurements were initially fetched in a shared failure domain. They are now deliberately separated.

## Acceptance criteria

The consumer closure is accepted when:

1. routing measurements are requested through a bounded independent Node measurement request;
2. 24H/7D/30D render through Node materialized resolution;
3. `Internet Infrastructure` appears as Lane 03;
4. additive totals are suppressed when coverage is incomplete;
5. distinct counts are never summed across buckets;
6. live coverage and recovered availability remain visibly distinct;
7. routing measurement/status failure does not break Vulnerability or Malware/IOC lanes;
8. Node bearer credentials remain server-only;
9. real RIPE Live plus official MRT recovery are both consumed through CİTEM.

All nine criteria passed in the accepted run above. NODE-6 CİTEM consumer closure is technically complete; merge timing remains an operator decision.
